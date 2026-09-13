import {createAliyunModelProviderFromEnv} from '../backend/aliyun-model-provider.mjs';
import {runRulesAnalysis,validateRulesSession} from '../shared/rules-analysis.js';

const integer=(value,fallback,max,min=1)=>{const n=Number(value??fallback);if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('invalid_model_config');return n;};
export function modelConfiguration(env){
 try{
  if(env.MOAT_MODEL_ENABLED!=='true'||env.MOAT_PUBLIC_API_ENABLED!=='true'||!env.DB||!env.API_RATE_LIMITER?.limit||!env.SESSION_RATE_LIMITER?.limit)return null;
  const timeout=integer(env.MOAT_MODEL_TIMEOUT_MS,75000,120000,1000),hourly=integer(env.MOAT_MODEL_CALLS_PER_HOUR,6,100),daily=integer(env.ALIYUN_MODEL_DAILY_CALL_LIMIT,100,10000);
  const provider=createAliyunModelProviderFromEnv(env);
  return provider?{timeout,hourly,daily}:null;
 }catch{return null;}
}

export function analysisCapabilities(env){
 const enabled=Boolean(modelConfiguration(env));
 return {model:enabled?'configured':'disabled',availableModes:enabled?['model','rules','manual']:['rules','manual'],serviceModes:enabled?['model','rules']:['rules'],routing:enabled?'server_managed':null,freeOnly:enabled?true:null,defaultMode:'rules'};
}

export async function reserveCounter(db,scope,window,limit){
 const subjectId=scope.startsWith('subject:')?scope.slice(8):null;
 const row=await db.prepare(`INSERT INTO model_counters(scope,window,used,subject_id) VALUES(?1,?2,1,?4)
  ON CONFLICT(scope,window) DO UPDATE SET used=used+1 WHERE used<?3 RETURNING used`).bind(scope,window,limit,subjectId).first();
 return Boolean(row);
}

// Each model attempt, including quota fallbacks, consumes a durable global slot.
// The upstream Free Quota Only console setting remains the billing safeguard.
export async function analyzeWithModel(env,subjectId,session,{fetcher=globalThis.fetch,now=()=>Date.now(),signal}={}){
 const config=modelConfiguration(env);if(!config)return {error:'model_disabled',status:503};
 const time=now(),owner=crypto.randomUUID(),db=env.DB;
 const lease=await db.prepare(`INSERT INTO model_leases(subject_id,owner,expires_at) VALUES(?1,?2,?3)
  ON CONFLICT(subject_id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at
  WHERE model_leases.expires_at<=?4 RETURNING owner`).bind(subjectId,owner,time+config.timeout+5000,time).first();
 if(!lease)return {error:'model_in_progress',status:429,retryAfter:1};
 const controller=new AbortController(),abort=()=>controller.abort();
 signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
 const timer=setTimeout(abort,config.timeout);
 try{
  const hour=Math.floor(time/3600000)*3600000;
  if(!await reserveCounter(db,`subject:${subjectId}`,hour,config.hourly))return {error:'model_rate_limited',status:429,retryAfter:Math.max(1,Math.ceil((hour+3600000-time)/1000))};
  // Only metadata older than two days is expired; aborted attempts aren't refunded.
  await db.prepare('DELETE FROM model_counters WHERE window<?1').bind(time-172800000).run();
  const safeSession={id:session.id,...(typeof session.flowVersion==='string'&&session.flowVersion.length<=100?{flowVersion:session.flowVersion}:{}),answers:session.answers.map(a=>({questionId:a.questionId,kind:a.kind,skipped:a.skipped,value:a.questionId==='q5'?{outcomes:[...a.value.outcomes],source:a.value.source}:Array.isArray(a.value)?[...a.value]:a.value}))};
  const provider=createAliyunModelProviderFromEnv(env,{fetcher:async(url,options)=>{
   controller.signal.throwIfAborted();
   const day=Math.floor(now()/86400000)*86400000;
   if(!await reserveCounter(db,'global',day,config.daily))throw Error('model_daily_limit');
   controller.signal.throwIfAborted();return fetcher(url,options);
  }});
  try{
   const proposal=await provider.analyze(safeSession,{signal:controller.signal});
   return {analysis:{mode:'model',provider:'aliyun-model-studio',routing:'server_managed',proposal}};
  }catch(error){
   const fallbackReason=controller.signal.aborted?'timeout':error.message==='model_daily_limit'?'daily_limit':error.message==='free_models_exhausted'?'free_models_exhausted':'model_unavailable';
   // Only fixed categories and numeric status; never log inputs, output or credentials.
   console.warn('moat_model_failure',JSON.stringify({reason:fallbackReason,attempts:(error.failures??[]).map(({category,status})=>({category,status}))}));
   return {analysis:{mode:'rules',ruleVersion:'0.1',fallbackFrom:'model',fallbackReason,proposal:runRulesAnalysis(safeSession)}};
  }
 }finally{
  clearTimeout(timer);signal?.removeEventListener('abort',abort);
  await db.prepare('DELETE FROM model_leases WHERE subject_id=?1 AND owner=?2').bind(subjectId,owner).run();
 }
}

export {runRulesAnalysis,validateRulesSession};
