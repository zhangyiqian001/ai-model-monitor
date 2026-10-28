import {eligible,orderRoutes} from './route-policy';
import {rankModel} from './model-ranking';
import {Module,Injectable,Controller,Get,Post,Put,Body,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {randomBytes,timingSafeEqual} from 'crypto';
import fs from 'fs';import path from 'path';
import {PlatformsModule} from '../platforms/platforms.module';
import {PlatformsService} from '../platforms/platforms.service';
import {ModelsModule} from '../models/models.module';
import {ModelsService} from '../models/models.service';
import {LOCAL_USER_ID} from '../../local/auth';
import {routeCompletion,invoke,type Candidate,type Attempt} from './router';
import {mergeFreeOverrides} from '../models/models.service';
const supported=(p:any)=>!['cloudflare','replicate','huggingface','cohere','ai21'].includes(p.key)&&p.status!=='已关停';
const MODEL_CACHE_TTL_MS=5*60*1000; // 平台模型列表缓存 5 分钟
// 非文本对话类模型（语音/图像/嵌入/重排/翻译等）不参与自动切换
const NON_CHAT=/tts|asr|embedding|rerank|image|video|audio|s2s|realtime|livetranslate|translate|mt[-_]|character|whisper|transcri|voice|ocr/i;
const isChatModel=(m:any)=>m.freeQuotaType?m.freeQuotaType==='Text':!NON_CHAT.test(String(m.id||''));
interface PlatformModelsCache{ts:number;map:Map<string,{items:any[];ok:boolean}>;}
@Injectable()
export class GatewayService{
 readonly directory=process.env.GATEWAY_DATA_DIR||path.join(process.cwd(),'data');
 readonly file=path.join(this.directory,'gateway.json');
 config:{apiKey:string;routes:Record<string,string>;order:string[]};cooldowns:Record<string,number>={};logs:Attempt[]=[];
 private modelCache:PlatformModelsCache|null=null;
 constructor(private readonly platforms:PlatformsService,private readonly models:ModelsService){fs.mkdirSync(this.directory,{recursive:true});this.config=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{apiKey:'gw_'+randomBytes(32).toString('hex'),routes:{},order:[]};this.save();const state=path.join(this.directory,'gateway-state.json');if(fs.existsSync(state))this.cooldowns=JSON.parse(fs.readFileSync(state,'utf8'));const logs=path.join(this.directory,'gateway-log.json');if(fs.existsSync(logs))this.logs=JSON.parse(fs.readFileSync(logs,'utf8'));}
 save(){fs.writeFileSync(this.file+'.tmp',JSON.stringify(this.config,null,2),{mode:0o600});fs.renameSync(this.file+'.tmp',this.file);}
 auth(req:Request){const token=req.headers.authorization?.replace(/^Bearer /,'')||'';const a=Buffer.from(token),b=Buffer.from(this.config.apiKey);return a.length===b.length&&timingSafeEqual(a,b);}
 /** 拉取平台模型列表（内存缓存，失败静默降级为空） */
 private async platformModels(p:any):Promise<any[]>{
  const now=Date.now();
  if(!this.modelCache||now-this.modelCache.ts>=MODEL_CACHE_TTL_MS)this.modelCache={ts:now,map:new Map()};
  const hit=this.modelCache.map.get(p.key);
  if(hit)return mergeFreeOverrides(hit.ok?hit.items:[],p.key);
  try{const res=await this.models.getPlatformModels(LOCAL_USER_ID,p.key);this.modelCache.map.set(p.key,{items:res.items,ok:true});return mergeFreeOverrides(res.items,p.key);}catch{this.modelCache.map.set(p.key,{items:[],ok:false});return [];}
 }
 async candidates(){const result:Candidate[]=[];const status=await this.platforms.listPlatformsWithConfig(LOCAL_USER_ID,{});for(const p of status.items){if(!supported(p)||!eligible(p))continue;const c=await this.platforms.getRawConfig(LOCAL_USER_ID,p.key);if(c?.isEnabled&&c.apiKeyEncrypted){
  const base={key:c.apiKeyEncrypted,base:p.apiBaseUrl,auth:p.authType};
  const configured=(this.config.routes[p.key]||'').trim();
  const models=await this.platformModels(p);
  // 显式指定的模型置顶（explicit），同时保留该平台其他免费模型用于额度用尽后的自动回落
  if(configured){result.push({id:p.key+'::'+configured,platform:p.key,model:configured,...base,score:rankModel(configured).score,explicit:true});}
  const sortRank=(m:any)=>(m.freeQuotaType==='Text'?0:1);
  const picks=models.filter((m:any)=>m.isFree&&!m.isDeprecated&&isChatModel(m)&&m.id!==configured).sort((a:any,b:any)=>sortRank(a)-sortRank(b)||rankModel(b.id).score-rankModel(a.id).score||(b.freeQuotaRemaining??0)-(a.freeQuotaRemaining??0));
  const list=picks.length?picks:models.filter((m:any)=>!m.isDeprecated&&isChatModel(m)&&m.id!==configured).sort((a:any,b:any)=>rankModel(b.id).score-rankModel(a.id).score);
  for(const m of list){if(!m.id)continue;result.push({id:p.key+'::'+m.id,platform:p.key,model:m.id,...base,score:rankModel(m.id).score});}
 }}// 全局按模型性能从高到低排序；用户显式指定的固定模型置顶（explicit 优先）
 return result.sort((a,b)=>(b.explicit?1:0)-(a.explicit?1:0)||(b.score??0)-(a.score??0));}

 async state(){const candidates=await this.candidates();const unsupported:string[]=[];for(const p of this.platforms.getAllPlatforms()){const c=await this.platforms.getRawConfig(LOCAL_USER_ID,p.key);if(c?.isEnabled&&c.apiKeyEncrypted&&!supported(p))unsupported.push(p.key);}const all=await this.platforms.listPlatformsWithConfig(LOCAL_USER_ID,{});const waiting=all.items.filter(p=>supported(p)&&p.config?.hasKey&&p.config?.isEnabled&&!eligible(p)).map(p=>({platform:p.key,name:p.name,status:p.latestHealthStatus}));// 全量免费模型聚合：所有正常渠道的免费可用模型，按性能降序（不截断）
 const freeModels:any[]=[];for(const p of all.items){if(!supported(p)||!eligible(p))continue;const models=await this.platformModels(p);for(const m of models){if(!m?.id||!m.isFree||m.isDeprecated)continue;const rank=rankModel(m.id);freeModels.push({id:p.key+'::'+m.id,platform:p.key,model:m.id,score:rank.score,tier:rank.tier,freeQuotaRemaining:m.freeQuotaRemaining,freeQuotaTotal:m.freeQuotaTotal,freeQuotaUsagePercent:m.freeQuotaUsagePercent,freeQuotaExpires:m.freeQuotaExpires,freeQuotaAutoStop:m.freeQuotaAutoStop});}}freeModels.sort((a,b)=>b.score-a.score);const grouped:any[]=[];const modelRoutes:any[]=[];for(const c of candidates){const rank=rankModel(c.model);modelRoutes.push({id:c.id,platform:c.platform,model:c.model,score:rank.score,tier:rank.tier,explicit:!!c.explicit,cooldown_until:this.cooldowns[c.id]||0});let g=grouped.find(x=>x.platform===c.platform);if(!g){g={platform:c.platform,model:c.model,candidates:[],order:this.config.order.indexOf(c.platform)};grouped.push(g);}g.candidates.push({id:c.id,model:c.model,cooldown_until:this.cooldowns[c.id]||0});g.model=c.model;}const overview=this.overview(candidates.length);let currentModel:any=null;const pinEntry=Object.entries(this.config.routes).find(([,v]:any)=>typeof v==='string'&&v.length);if(pinEntry){currentModel=pinEntry[0]+'::'+pinEntry[1];}else{for(let i=this.logs.length-1;i>=0;i--){if(this.logs[i].outcome==='success'){currentModel=this.logs[i].route;break;}}}return {waiting,currentModel,unsupported,model:'auto',streaming:false,overview,routes:grouped.map((g,i)=>({...g,order:g.order<0?999:g.order})),modelRoutes,freeModels,order:this.config.order,overrides:this.config.routes,logs:this.logs.slice(-100).reverse(),key_configured:true};}

 /** 概览统计：从网关调用日志聚合（可接入模型/回合/Token/近7天用量） */
 private overview(accessibleModels:number){
  const now=new Date();const day=(ts:number)=>new Date(ts).toISOString().slice(0,10);
  const seven:any[]=[];for(let i=6;i>=0;i--){const d=new Date(now);d.setDate(d.getDate()-i);seven.push({date:(d.getMonth()+1)+'/'+d.getDate(),day:day(d.getTime()),input:0,output:0});}
  let userTurns=0,totalTokens=0,inputTokens=0,outputTokens=0,unfinished=0;
  for(const a of this.logs){
   if(a.outcome==='success'){userTurns++;if(a.tokens){inputTokens+=a.tokens.prompt||0;outputTokens+=a.tokens.completion||0;totalTokens+=a.tokens.total||0;}const d=day(Date.parse(a.at));const slot=seven.find(s=>s.day===d);if(slot){slot.input+=a.tokens?.prompt||0;slot.output+=a.tokens?.completion||0;}}
   else unfinished++;
  }
  return {accessibleModels,userTurns,totalTokens,inputTokens,outputTokens,unfinishedTurns:unfinished,last7Days:seven.map(({day,...r})=>r)};
 }
 async chat(input:any){
  if(!input||typeof input.model!=='string'||!Array.isArray(input.messages)||!input.messages.length||input.messages.length>100)throw Object.assign(new Error('messages 必填（1–100 条）'),{status:400});
  const bad=input.messages.find((m:any)=>!m||!['system','user','assistant','developer','tool'].includes(m.role)||(m.content===null?(!m.tool_calls||!Array.isArray(m.tool_calls)||!m.tool_calls.length):(typeof m.content!=='string'||m.content.length>100000))||(m.role==='tool'&&typeof m.tool_call_id!=='string'));
  if(bad)throw Object.assign(new Error(`仅支持文本 messages；第 ${input.messages.indexOf(bad)+1} 条角色或内容不合法（tool 消息需带 tool_call_id，不支持多模态）`),{status:400});
  const stream=input.stream===true;
  if(input.max_tokens!==undefined&&(!Number.isInteger(input.max_tokens)||input.max_tokens<1||input.max_tokens>131072))throw Object.assign(new Error('max_tokens 需为 1–131072'),{status:400});
  if(input.temperature!==undefined&&(!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>2))throw Object.assign(new Error('temperature 需为 0–2'),{status:400});
  if(input.tools!==undefined&&(!Array.isArray(input.tools)||!input.tools.length||input.tools.length>64||input.tools.some((t:any)=>!t||t.type!=='function'||!t.function||typeof t.function.name!=='string'||!t.function.name)))throw Object.assign(new Error('tools 需为 function 定义数组（type=function 且含 function.name）'),{status:400});
  if(input.tool_choice!==undefined&&typeof input.tool_choice!=='string'&&(!input.tool_choice||input.tool_choice.type!=='function'||!input.tool_choice.function||typeof input.tool_choice.function.name!=='string'))throw Object.assign(new Error('tool_choice 需为 auto/none/required 或 {type:"function",function:{name}}'),{status:400});
  // 宽容策略：未知扩展参数（reasoning_effort/response_format/seed/stream_options 等）忽略不报错，仅透传受支持字段
  if(input.messages.some((m:any)=>m.role==='developer'))input.messages=input.messages.map((m:any)=>m.role==='developer'?{...m,role:'system'}:m);
  let candidates=await this.candidates();
  if(input.model!=='auto')candidates=candidates.filter(c=>c.id===input.model);
  if(!candidates.length)throw Object.assign(new Error('没有检测正常且已启用的兼容模型，或模型 ID 不存在'),{status:404});
  try{const payload=await routeCompletion(candidates,input,this.cooldowns,a=>{this.logs.push(a);this.logs=this.logs.slice(-300);fs.writeFileSync(path.join(this.directory,'gateway-log.json'),JSON.stringify(this.logs),{mode:0o600});});return {stream,payload};}finally{fs.writeFileSync(path.join(this.directory,'gateway-state.json'),JSON.stringify(this.cooldowns),{mode:0o600});}}
}
@Controller()
export class GatewayController{
 constructor(private readonly gateway:GatewayService){}
 private local(req:Request){const remote=req.socket.remoteAddress?.replace(/^::ffff:/,'');return ['127.0.0.1','::1'].includes(remote||'')&&(!req.headers.origin||req.headers.origin==='http://'+req.headers.host)&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(String(req.headers['sec-fetch-site'])));}
 @Get('api/gateway')async state(@Req()req:Request,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});return res.json(await this.gateway.state());}
 @Post('api/gateway/key')key(@Req()req:Request,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});res.setHeader('Cache-Control','no-store');return res.json({key:this.gateway.config.apiKey});}
 @Put('api/gateway/config')config(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});const valid=this.gateway['platforms'].getAllPlatforms().map(p=>p.key);if(!body||!Array.isArray(body.order)||body.order.some((k:any)=>!valid.includes(k))||!body.routes||typeof body.routes!=='object'||Array.isArray(body.routes)||Object.entries(body.routes).some(([k,v])=>!valid.includes(k)||typeof v!=='string'||v.length>200))return res.status(400).json({error:'渠道顺序或模型格式不正确'});this.gateway.config.order=[...new Set(body.order)] as string[];this.gateway.config.routes=body.routes;this.gateway.save();return res.json({ok:true});}
 @Post('api/gateway/reset')reset(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.local(req)||body?.confirm!==true)return res.status(403).json({error:'需要本机明确确认'});this.gateway.cooldowns={};fs.writeFileSync(path.join(this.gateway.directory,'gateway-state.json'),'{}');return res.json({ok:true});}
 /** 一键测试：对指定平台的一组模型逐个发最小请求，返回可用性（并发4，单模型10s超时） */
 @Post('api/gateway/test-models')async testModels(@Req()req:Request,@Res()res:Response,@Body()body:any){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});const platform=body?.platform,modelIds=body?.modelIds;if(typeof platform!=='string'||!Array.isArray(modelIds)||!modelIds.length||modelIds.length>200)return res.status(400).json({error:'platform 与 modelIds 必填（≤200个）'});const p=this.gateway['platforms'].getAllPlatforms().find(x=>x.key===platform);if(!p)return res.status(404).json({error:'平台不存在'});const cfg=await this.gateway['platforms'].getRawConfig(LOCAL_USER_ID,platform);if(!cfg?.isEnabled||!cfg.apiKeyEncrypted)return res.status(400).json({error:'平台未配置或未启用'});const base={key:cfg.apiKeyEncrypted,base:p.apiBaseUrl,auth:p.authType};const input={model:'',messages:[{role:'user',content:'ping'}],max_tokens:64};const results:any[]=[];let idx=0;const worker=async()=>{while(idx<modelIds.length){const model=modelIds[idx++];const start=Date.now();let r:any={model,ok:false,status:0,ms:0,error:''};try{const resp=await invoke({id:platform+'::'+model,platform,model,...base},input,AbortSignal.timeout(10000));r={model,ok:resp.status>=200&&resp.status<300&&!resp.data?.error,status:resp.status,ms:Date.now()-start,error:resp.data?.error?.message||resp.data?.error?.code||''};}catch(e:any){r={model,ok:false,status:0,ms:Date.now()-start,error:(e?.name==='TimeoutError'||e?.name==='AbortError')?'超时':String(e?.message||e)};}results.push(r);}};await Promise.all(Array.from({length:Math.min(4,modelIds.length)},()=>worker()));results.sort((a,b)=>modelIds.indexOf(a.model)-modelIds.indexOf(b.model));res.setHeader('Cache-Control','no-store');return res.json({platform,total:modelIds.length,results});}
 @Get('v1/models')async models(@Req()req:Request,@Res()res:Response){if(!this.gateway.auth(req))return res.status(401).json({error:{message:'API Key 无效'}});const state=await this.gateway.state();return res.json({object:'list',data:[{id:'auto',object:'model',owned_by:'gateway'},...state.routes.map(c=>({id:c.id,object:'model',owned_by:c.platform}))]});}
 @Post('v1/chat/completions')async chat(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.gateway.auth(req))return res.status(401).json({error:{message:'API Key 无效'}});try{const out=await this.gateway.chat(body);if(out.stream){res.status(200);res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');const p=out.payload,base={id:p.id,object:'chat.completion.chunk',created:p.created,model:p.model},chunk=(obj:any)=>res.write('data: '+JSON.stringify(obj)+'\n\n');const msg=p.choices?.[0]?.message||{},content=typeof msg.content==='string'?msg.content:'',toolCalls=Array.isArray(msg.tool_calls)?msg.tool_calls:[];chunk({...base,choices:[{index:0,delta:{role:'assistant',content:''},finish_reason:null}]});const len=content.length,step=Math.max(1,Math.ceil(len/3));let sent=0;while(sent<len){const end=Math.min(len,sent+step);chunk({...base,choices:[{index:0,delta:{content:content.slice(sent,end)},finish_reason:null}]});sent=end;}toolCalls.forEach((tc:any,i:number)=>{chunk({...base,choices:[{index:0,delta:{tool_calls:[{index:i,id:tc.id,type:tc.type||'function',function:{name:tc.function?.name||'',arguments:''}}]},finish_reason:null}]});const args=typeof tc.function?.arguments==='string'?tc.function.arguments:'';if(args){const alen=args.length,ast=Math.max(1,Math.ceil(alen/3));let asent=0;while(asent<alen){const ae=Math.min(alen,asent+ast);chunk({...base,choices:[{index:0,delta:{tool_calls:[{index:i,function:{arguments:args.slice(asent,ae)}}]},finish_reason:null}]});asent=ae;}}});const finish=toolCalls.length?'tool_calls':(p.choices?.[0]?.finish_reason||'stop');chunk({...base,choices:[{index:0,delta:{},finish_reason:finish}]});if(p.usage)chunk({...base,choices:[],usage:p.usage});res.end('data: [DONE]\n\n');return;}return res.status(200).json(out.payload);}catch(e:any){return res.status(e.status||500).json({error:{message:e.status?e.message:'网关内部错误',attempts:e.attempts||[]}});}}
}
@Module({imports:[PlatformsModule,ModelsModule],providers:[GatewayService],controllers:[GatewayController]})export class GatewayModule{}
