// Pages advanced-mode adapter. Only a configured service binding may receive API
// traffic; never derive an upstream URL from request headers or query parameters.
const unavailable=()=>Response.json({error:{code:'api_unavailable',message:'服务器连接暂不可用，请保留当前输入后重试。',retryable:true}},{status:503,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Retry-After':'60'}});

export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(path==='/api'||path.startsWith('/api/')){
   if(typeof env?.MOAT_API?.fetch!=='function')return unavailable();
   try{
    // Preserve the Pages URL, Origin, Cookie, IP and body for the Worker's own
    // authentication and CSRF checks. Do not follow an unexpected redirect.
    const response=await env.MOAT_API.fetch(new Request(request,{redirect:'manual'}));
    if((response.status>=300&&response.status<400)||!/^application\/json(?:\s*;|$)/i.test(response.headers.get('Content-Type')||'')){
     await response.body?.cancel();return unavailable();
    }
    return response;
   }catch{return unavailable();}
  }
  return env.ASSETS.fetch(request);
 }
};
