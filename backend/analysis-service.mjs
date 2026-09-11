import {validateUnderstandingProposal} from '../shared/understanding.js';

const validSession=s=>s&&typeof s.id==='string'&&s.id.length>0&&s.id.length<=100&&typeof s.flowVersion==='string'&&s.flowVersion.length<=100&&Array.isArray(s.answers)&&s.answers.length>0&&s.answers.length<=20&&new Set(s.answers.map(a=>a?.questionId)).size===s.answers.length&&s.answers.every(a=>a&&typeof a.questionId==='string'&&a.questionId.length>0&&a.questionId.length<=100&&typeof a.kind==='string'&&a.kind.length<=100&&typeof a.skipped==='boolean'&&Object.hasOwn(a,'value'));

// No provider or external calls by default; keys and provider implementations stay server-side.
export function createAnalysisService({provider=null,timeout=20000,maxBytes=32768}={}){
 return async function handle(req,res){
  const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
  const route=req.url?.split('?')[0];
  if(route==='/api/capabilities'){if(req.method!=='GET'){send(405,{error:'method_not_allowed'});return;}send(200,{analysis:provider?'configured':'disabled',contractVersion:'0.1'});return;}
  if(req.method!=='POST'){send(405,{error:'method_not_allowed'});return;}
  const host=req.headers.host;
  if(!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host??'')||req.headers.origin!==`http://${host}`){req.resume();send(403,{error:'origin_rejected'});return;}
  if(req.headers['content-type']?.split(';')[0]!=='application/json'){req.resume();send(415,{error:'json_required'});return;}
  if(!provider){req.resume();send(503,{error:'analysis_unavailable'});return;}
  const controller=new AbortController();let timer;
  const disconnected=()=>controller.abort();res.on('close',disconnected);
  try{
   let bytes=0;const chunks=[];
   for await(const chunk of req){bytes+=Buffer.byteLength(chunk);if(bytes>maxBytes){send(413,{error:'input_too_large'});return;}chunks.push(Buffer.from(chunk));}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{send(400,{error:'invalid_json'});return;}
   if(!validSession(body?.session)){send(400,{error:'invalid_session'});return;}
   // Whitelist only the session fields needed by the provider; omit workspace/profile data.
   const session={id:body.session.id,flowVersion:body.session.flowVersion,answers:body.session.answers.map(({questionId,kind,value,skipped})=>({questionId,kind,value,skipped}))};
   const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('timeout'));},timeout);});
   const output=await Promise.race([Promise.resolve().then(()=>provider.analyze(session,{signal:controller.signal})),deadline]);
   if(JSON.stringify(output)?.length>131072||output?.session_id!==session.id||!validateUnderstandingProposal(output,{inputIds:session.answers.map(a=>a.questionId)}).ok){send(502,{error:'invalid_analysis_contract'});return;}
   send(200,output);
  }catch{if(!res.destroyed)send(controller.signal.aborted?504:502,{error:controller.signal.aborted?'analysis_timeout':'analysis_failed'});}
  finally{clearTimeout(timer);res.off('close',disconnected);controller.abort();}
 };
}
