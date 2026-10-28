import {randomUUID} from 'crypto';
export interface Candidate { id:string; platform:string; model:string; key:string; base:string; auth:string; score?:number; explicit?:boolean; }
export interface Attempt { route:string; status:number; outcome:string; at:string; tokens?:{prompt:number;completion:number;total:number}; }
export function failureKind(status:number,data:any):string {
 if(status===504)return 'timeout';
 const code=String(data?.error?.code||data?.error?.type||'').toLowerCase(),msg=String(data?.error?.message||'').toLowerCase();
 if(status===429)return /insufficient|quota|balance|余额|额度/.test(code+' '+msg)?'quota':'rate_limit';
 if(status===402||/insufficient_quota|insufficient_balance|quota_exceeded|1113/.test(code)||/insufficient (?:quota|balance|credit)|quota (?:exceeded|exhausted)|余额不足|额度(?:已)?(?:耗尽|用完|不足)/.test(msg))return 'quota';
 if(status===401||status===403)return 'auth';
 if(status===404||/model_not_found|invalid_model/.test(code)||/model.*(?:not found|does not exist)|模型不存在/.test(msg))return 'model_unavailable';
 if(status>=500)return 'upstream';
 if(status===0)return 'network';return 'invalid_request';
}
export async function invoke(c:Candidate,input:any,signal:AbortSignal){
 const messages=input.messages,base=c.base.replace(/\/$/,''),headers:Record<string,string>={'Content-Type':'application/json'};
 let url=base+'/chat/completions',body:any={model:c.model,messages,max_tokens:input.max_tokens||1600,stream:false};
 if(input.temperature!==undefined)body.temperature=input.temperature;
 if(c.auth==='bearer')headers.Authorization='Bearer '+c.key;else if(c.auth==='header-custom')headers['x-api-key']=c.key;
 if(c.platform==='gemini'){
  headers['x-goog-api-key']=c.key;url=base+'/models/'+encodeURIComponent(c.model)+':generateContent';
  body={contents:messages.filter((m:any)=>m.role!=='system').map((m:any)=>({role:m.role==='assistant'?'model':'user',parts:[{text:m.content}]})),generationConfig:{maxOutputTokens:input.max_tokens||1600,...(input.temperature!==undefined?{temperature:input.temperature}:{})}};
  const system=messages.filter((m:any)=>m.role==='system').map((m:any)=>m.content).join('\n');if(system)body.systemInstruction={parts:[{text:system}]};
 }else if(c.platform==='anthropic'){
  headers['x-api-key']=c.key;headers['anthropic-version']='2023-06-01';url=base+'/messages';body={model:c.model,max_tokens:input.max_tokens||1600,messages:messages.filter((m:any)=>m.role!=='system'),system:messages.filter((m:any)=>m.role==='system').map((m:any)=>m.content).join('\n')};
 }else if(c.auth==='query')url+='?key='+encodeURIComponent(c.key);
 const r=await fetch(url,{method:'POST',headers,body:JSON.stringify(body),signal,redirect:'error'});
 let data:any;try{data=await r.json();}catch{return {status:r.ok?502:r.status,data:{error:{code:'invalid_response'}},retryAfter:r.headers.get('retry-after')};}
 if(r.ok&&!data?.error){
  let text:string|undefined;
  if(c.platform==='gemini'){text=data.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('');data={choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}],usage:{prompt_tokens:data.usageMetadata?.promptTokenCount||0,completion_tokens:data.usageMetadata?.candidatesTokenCount||0}};}
  if(c.platform==='anthropic'){text=data.content?.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('');data={choices:[{message:{role:'assistant',content:text},finish_reason:data.stop_reason==='max_tokens'?'length':'stop'}],usage:{prompt_tokens:data.usage?.input_tokens||0,completion_tokens:data.usage?.output_tokens||0}};}
  if(typeof data.choices?.[0]?.message?.content!=='string'||!data.choices[0].message.content.trim())return {status:502,data:{error:{code:'empty_response'}},retryAfter:null};
 }
 return {status:r.ok&&data?.error?400:r.status,data,retryAfter:r.headers.get('retry-after')};
}
export async function routeCompletion(candidates:Candidate[],input:any,cooldowns:Record<string,number>,log:(a:Attempt)=>void,request=invoke,clock=Date.now){
 const attempts:Attempt[]=[],start=clock();
 for(const c of candidates){if((cooldowns[c.id]||0)>clock())continue;if(clock()-start>=90000)break;
  let response;try{response=await request(c,input,AbortSignal.timeout(Math.max(1,Math.min(60000,90000-(clock()-start)))));}catch(error:any){response={status:error?.name==='TimeoutError'||error?.name==='AbortError'?504:0,data:{},retryAfter:null};}
  if(response.status>=200&&response.status<300&&!response.data?.error){const u=response.data?.usage,tokens=u&&typeof u==='object'?{prompt:Number(u.prompt_tokens||0),completion:Number(u.completion_tokens||0),total:Number(u.total_tokens||0)}:undefined;const a={route:c.id,status:response.status,outcome:'success',at:new Date().toISOString(),...tokens?{tokens}:{}};attempts.push(a);log(a);return {...response.data,id:'chatcmpl-'+randomUUID(),object:'chat.completion',created:Math.floor(clock()/1000),model:c.id,gateway:{route:c.id,attempts}};}
  const kind=failureKind(response.status,response.data),a={route:c.id,status:response.status,outcome:kind,at:new Date().toISOString()};attempts.push(a);log(a);
  if(kind==='invalid_request')throw Object.assign(new Error('上游拒绝请求，请检查模型和请求参数'),{status:400,attempts});
  const raw=response.retryAfter,seconds=raw?(Number.isFinite(Number(raw))?Number(raw):Math.ceil((Date.parse(raw)-clock())/1000)):0;
  const delay=seconds>0?Math.min(seconds,86400):kind==='quota'?3600:kind==='auth'?300:kind==='rate_limit'?60:10;
  cooldowns[c.id]=clock()+delay*1000;
 }
 throw Object.assign(new Error('所有可用模型均失败或处于冷却期，请查看调用记录或补充额度'),{status:503,attempts});
}
