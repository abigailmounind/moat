export async function edgeGuard(request,env){
 if(env.MOAT_PUBLIC_API_ENABLED!=='true')return null;
 const ip=request.headers.get('CF-Connecting-IP');
 if(!ip||!env.API_RATE_LIMITER?.limit||!env.SESSION_RATE_LIMITER?.limit)return {status:503,code:'rate_limit_unavailable'};
 // Edge buckets never receive raw input, account names or prompt content.
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
 const key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 try{
  if(!(await env.API_RATE_LIMITER.limit({key})).success)return {status:429,code:'rate_limited'};
  if(new URL(request.url).pathname==='/api/v1/session'&&request.method==='POST'&&!(await env.SESSION_RATE_LIMITER.limit({key})).success)return {status:429,code:'rate_limited'};
 }catch{return {status:503,code:'rate_limit_unavailable'};}
 return null;
}

export async function readBoundedJson(request,limit){
 const fail=code=>{const e=Error(code);e.code=code;throw e;};
 if((request.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase()!=='application/json')fail('unsupported_media_type');
 if(Number(request.headers.get('Content-Length'))>limit)fail('body_too_large');
 const reader=request.body?.getReader();if(!reader)fail('invalid_json');
 let size=0,text='';const decoder=new TextDecoder();
 try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();fail('body_too_large');}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
 try{return JSON.parse(text);}catch{fail('invalid_json');}
}
