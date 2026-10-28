import {eligible,orderRoutes} from './route-policy';
import {Module,Injectable,Controller,Get,Post,Put,Body,Req,Res} from '@nestjs/common';
import type {Request,Response} from 'express';
import {randomBytes,timingSafeEqual} from 'crypto';
import fs from 'fs';import path from 'path';
import {PlatformsModule} from '../platforms/platforms.module';
import {PlatformsService} from '../platforms/platforms.service';
import {ModelsModule} from '../models/models.module';
import {ModelsService} from '../models/models.service';
import {LOCAL_USER_ID} from '../../local/auth';
import {routeCompletion,type Candidate,type Attempt} from './router';
const supported=(p:any)=>!['cloudflare','replicate','huggingface','cohere','ai21'].includes(p.key)&&p.status!=='已关停';
const MODEL_CACHE_TTL_MS=5*60*1000; // 平台模型列表缓存 5 分钟
const MAX_MODELS_PER_PLATFORM=5; // 每平台自动切换候选数上限
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
  if(hit)return hit.ok?hit.items:[];
  try{const res=await this.models.getPlatformModels(LOCAL_USER_ID,p.key);this.modelCache.map.set(p.key,{items:res.items,ok:true});return res.items;}catch{this.modelCache.map.set(p.key,{items:[],ok:false});return [];}
 }
 async candidates(){const result:Candidate[]=[];const status=await this.platforms.listPlatformsWithConfig(LOCAL_USER_ID,{});for(const p of status.items){if(!supported(p)||!eligible(p))continue;const c=await this.platforms.getRawConfig(LOCAL_USER_ID,p.key);if(c?.isEnabled&&c.apiKeyEncrypted){
  const base={key:c.apiKeyEncrypted,base:p.apiBaseUrl,auth:p.authType};
  const configured=(this.config.routes[p.key]||'').trim();
  if(configured){result.push({id:p.key+'::'+configured,platform:p.key,model:configured,...base});continue;}
  // 未显式指定模型：动态取平台模型列表（文本模型优先 → 免费优先 → 剩余额度多优先），用完一个自动切下一个
  const models=await this.platformModels(p);
  const sortRank=(m:any)=>(m.freeQuotaType==='Text'?0:1);
  const picks=models.filter((m:any)=>m.isFree&&!m.isDeprecated).sort((a:any,b:any)=>sortRank(a)-sortRank(b)||(b.freeQuotaRemaining??0)-(a.freeQuotaRemaining??0)).slice(0,MAX_MODELS_PER_PLATFORM);
  const list=picks.length?picks:models.filter((m:any)=>!m.isDeprecated).slice(0,MAX_MODELS_PER_PLATFORM);
  for(const m of list){if(!m.id)continue;result.push({id:p.key+'::'+m.id,platform:p.key,model:m.id,...base});}
 }}return orderRoutes(result,this.config.order);}

 async state(){const candidates=await this.candidates();const unsupported:string[]=[];for(const p of this.platforms.getAllPlatforms()){const c=await this.platforms.getRawConfig(LOCAL_USER_ID,p.key);if(c?.isEnabled&&c.apiKeyEncrypted&&!supported(p))unsupported.push(p.key);}const all=await this.platforms.listPlatformsWithConfig(LOCAL_USER_ID,{});const waiting=all.items.filter(p=>supported(p)&&p.config?.hasKey&&p.config?.isEnabled&&!eligible(p)).map(p=>({platform:p.key,name:p.name,status:p.latestHealthStatus}));const grouped:any[]=[];for(const c of candidates){let g=grouped.find(x=>x.platform===c.platform);if(!g){g={platform:c.platform,model:c.model,candidates:[],order:this.config.order.indexOf(c.platform)};grouped.push(g);}g.candidates.push({id:c.id,model:c.model,cooldown_until:this.cooldowns[c.id]||0});g.model=c.model;}return {waiting,unsupported,model:'auto',streaming:false,routes:grouped.map((g,i)=>({...g,order:g.order<0?999:g.order})),order:this.config.order,overrides:this.config.routes,logs:this.logs.slice(-100).reverse(),key_configured:true};}
 async chat(input:any){if(!input||typeof input.model!=='string'||!Array.isArray(input.messages)||!input.messages.length||input.messages.length>100||input.messages.some((m:any)=>!m||!['system','user','assistant'].includes(m.role)||typeof m.content!=='string'||m.content.length>100000)||input.stream===true||input.max_tokens!==undefined&&(!Number.isInteger(input.max_tokens)||input.max_tokens<1||input.max_tokens>8192)||input.temperature!==undefined&&(!Number.isFinite(input.temperature)||input.temperature<0||input.temperature>2))throw Object.assign(new Error('仅支持文本 messages、非流式请求及 max_tokens 1–8192'),{status:400});if(Object.keys(input).some(k=>!['model','messages','stream','max_tokens','temperature'].includes(k)))throw Object.assign(new Error('暂不支持 tools、多模态或其他扩展参数'),{status:400});let candidates=await this.candidates();if(input.model!=='auto')candidates=candidates.filter(c=>c.id===input.model);if(!candidates.length)throw Object.assign(new Error('没有检测正常且已启用的兼容模型，或模型 ID 不存在'),{status:404});try{return await routeCompletion(candidates,input,this.cooldowns,a=>{this.logs.push(a);this.logs=this.logs.slice(-300);fs.writeFileSync(path.join(this.directory,'gateway-log.json'),JSON.stringify(this.logs),{mode:0o600});});}finally{fs.writeFileSync(path.join(this.directory,'gateway-state.json'),JSON.stringify(this.cooldowns),{mode:0o600});}}
}
@Controller()
export class GatewayController{
 constructor(private readonly gateway:GatewayService){}
 private local(req:Request){const remote=req.socket.remoteAddress?.replace(/^::ffff:/,'');return ['127.0.0.1','::1'].includes(remote||'')&&(!req.headers.origin||req.headers.origin==='http://'+req.headers.host)&&(!req.headers['sec-fetch-site']||['same-origin','none'].includes(String(req.headers['sec-fetch-site'])));}
 @Get('api/gateway')async state(@Req()req:Request,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});return res.json(await this.gateway.state());}
 @Post('api/gateway/key')key(@Req()req:Request,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});res.setHeader('Cache-Control','no-store');return res.json({key:this.gateway.config.apiKey});}
 @Put('api/gateway/config')config(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.local(req))return res.status(403).json({error:'仅允许本机管理'});const valid=this.gateway['platforms'].getAllPlatforms().map(p=>p.key);if(!body||!Array.isArray(body.order)||body.order.some((k:any)=>!valid.includes(k))||!body.routes||typeof body.routes!=='object'||Array.isArray(body.routes)||Object.entries(body.routes).some(([k,v])=>!valid.includes(k)||typeof v!=='string'||v.length>200))return res.status(400).json({error:'渠道顺序或模型格式不正确'});this.gateway.config.order=[...new Set(body.order)] as string[];this.gateway.config.routes=body.routes;this.gateway.save();return res.json({ok:true});}
 @Post('api/gateway/reset')reset(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.local(req)||body?.confirm!==true)return res.status(403).json({error:'需要本机明确确认'});this.gateway.cooldowns={};fs.writeFileSync(path.join(this.gateway.directory,'gateway-state.json'),'{}');return res.json({ok:true});}
 @Get('v1/models')async models(@Req()req:Request,@Res()res:Response){if(!this.gateway.auth(req))return res.status(401).json({error:{message:'API Key 无效'}});const state=await this.gateway.state();return res.json({object:'list',data:[{id:'auto',object:'model',owned_by:'gateway'},...state.routes.map(c=>({id:c.id,object:'model',owned_by:c.platform}))]});}
 @Post('v1/chat/completions')async chat(@Req()req:Request,@Body()body:any,@Res()res:Response){if(!this.gateway.auth(req))return res.status(401).json({error:{message:'API Key 无效'}});try{return res.status(200).json(await this.gateway.chat(body));}catch(e:any){return res.status(e.status||500).json({error:{message:e.status?e.message:'网关内部错误',attempts:e.attempts||[]}});}}
}
@Module({imports:[PlatformsModule,ModelsModule],providers:[GatewayService],controllers:[GatewayController]})export class GatewayModule{}
