import assert from 'node:assert/strict';
import {commitDocument} from '../../cloudflare/d1-commit.mjs';
import {createWorker} from '../../cloudflare/worker.mjs';
import {analyzeWithModel,reserveCounter} from '../../cloudflare/model-gateway.mjs';
import {runRulesAnalysis} from '../../shared/rules-analysis.js';
import {analysisEvaluationCases} from './analysis-evaluation-cases.mjs';
import {createProductAnalysisAdapter} from '../../frontend/src/analysis-client.js';

const session=analysisEvaluationCases[0].session;
const limiter={limit:async()=>({success:true})};
const config=db=>({DB:db,MOAT_MODEL_ENABLED:'true',MOAT_PUBLIC_API_ENABLED:'true',API_RATE_LIMITER:limiter,SESSION_RATE_LIMITER:limiter,ALIYUN_DASHSCOPE_API_KEY:'synthetic-key-never-sent-to-network',ALIYUN_FREE_ONLY_CONFIRMED:'true',ALIYUN_FREE_MODELS:'qwen-test-a,qwen-test-b',ALIYUN_MODEL_DAILY_CALL_LIMIT:'100',MOAT_MODEL_CALLS_PER_HOUR:'100'});
const completion=()=>Response.json({choices:[{message:{content:JSON.stringify(runRulesAnalysis(session))}}]});
const makeClient=(db,{env={},fetcher=async()=>{throw Error('Unexpected upstream call');}}={})=>{
 const worker=createWorker({modelFetcher:fetcher}),bindings={DB:db,...env};let cookie='';
 const fetchImpl=async(path,options={})=>{
  const headers=new Headers(options.headers);headers.set('Origin','https://moat.test');headers.set('CF-Connecting-IP','192.0.2.1');if(cookie)headers.set('Cookie',cookie);
  const response=await worker.fetch(new Request(new URL(path,'https://moat.test'),{...options,headers}),bindings);
  if(response.headers.has('Set-Cookie'))cookie=response.headers.get('Set-Cookie').split(';')[0];return response;
 };
 return {fetchImpl,async request(path,{method='GET',body,key}={}){
  const response=await fetchImpl(path,{method,headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  return {response,value:await response.json()};
 }};
};
const subject=async db=>{const client=makeClient(db),created=await client.request('/api/v1/session',{method:'POST'});assert.equal(created.response.status,201);return {id:created.value.session.subject.id,client};};

export async function runReleaseGuards(db){
 // Identical simultaneous writes reserve one receipt, including a no-op profile write.
 for(const unchanged of [false,true]){
  const {id}=await subject(db),nextRevision=unchanged?0:1;
  const args={table:'profiles',subjectId:id,revision:0,nextRevision,content:{marker:'synthetic'},key:'same-key',fingerprint:'same-fingerprint',response:{revision:nextRevision}};
  const results=await Promise.all(Array.from({length:8},()=>commitDocument(db,args)));
  assert.equal(results.filter(r=>r.replayed===false).length,1);assert.ok(results.every(r=>r.response?.revision===nextRevision));
 }
 // Both resources share key space and capacity, enforced inside the transaction.
 for(const sameKey of [false,true]){
  const {id}=await subject(db);
  const results=await Promise.all(['profiles','workspaces'].map(table=>commitDocument(db,{table,subjectId:id,revision:0,nextRevision:1,content:{},key:sameKey?'shared':table,fingerprint:table,response:{table},capacity:1})));
  assert.equal(results.filter(r=>r.response).length,1);
  assert.equal(results.find(r=>r.code).code,sameKey?'idempotency_conflict':'idempotency_capacity');
  const counts=await db.prepare('SELECT (SELECT revision FROM profiles WHERE subject_id=?1)+(SELECT revision FROM workspaces WHERE subject_id=?1) AS total').bind(id).first();assert.equal(counts.total,1);
 }
 // Expired keys are reusable; failed mutation rolls back the reserved receipt.
 {
  const {id}=await subject(db),args={table:'profiles',subjectId:id,revision:0,nextRevision:1,content:{},key:'retry',fingerprint:'first',response:{revision:1},now:Date.UTC(2026,8,10)};
  await commitDocument(db,args);
  const reused=await commitDocument(db,{...args,revision:1,nextRevision:2,fingerprint:'second',response:{revision:2},now:Date.UTC(2026,8,12)});assert.equal(reused.replayed,false);
  await db.prepare("CREATE TRIGGER release_injected_failure BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'release_injected_failure'); END").run();
  const retry={...args,revision:2,nextRevision:3,key:'failure',now:Date.UTC(2026,8,12)};
  try{await assert.rejects(commitDocument(db,retry),/release_injected_failure/);}finally{await db.prepare('DROP TRIGGER release_injected_failure').run();}
  assert.equal(await db.prepare('SELECT owner FROM idempotency_receipts WHERE subject_id=?1 AND operation_key=?2').bind(id,'failure').first(),null);
  assert.equal((await commitDocument(db,retry)).replayed,false);
 }
 // Real HTTP-layer retries must also succeed when the document read sees a new revision.
 {
  const {client}=await subject(db),path={id:'race-path',river:'ability',name:'合成路径',status:'exploring',goal:'验证',notes:'',support:'',gap:'',constraints:'',nextAction:''};
  const results=await Promise.all(Array.from({length:8},()=>client.request('/api/v1/paths',{method:'POST',key:'http-same-key',body:{revision:0,path}})));
  assert.ok(results.every(r=>r.response.status===200),JSON.stringify(results.map(r=>r.value)));
  assert.equal(results.filter(r=>r.response.headers.get('Idempotency-Replayed')==='false').length,1);
 }
 console.log('Real D1: concurrent replays, cross-document capacity, expiry and rollback passed.');

 await db.prepare('DELETE FROM model_counters').run();
 let calls=0;
 const fetcher=async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'dashscope-intl.aliyuncs.com');assert.equal(options.redirect,'manual');assert.ok(!options.body.includes('DO_NOT_FORWARD'));return completion();};
 const env=config(db),{id}=await subject(db);
 // Each configuration gate fails closed before any upstream request.
 for(const change of [{MOAT_MODEL_ENABLED:'false'},{MOAT_PUBLIC_API_ENABLED:'false'},{ALIYUN_FREE_ONLY_CONFIRMED:'false'},{ALIYUN_DASHSCOPE_API_KEY:''},{API_RATE_LIMITER:null},{MOAT_MODEL_CALLS_PER_HOUR:'0'}]){
  assert.equal((await analyzeWithModel({...env,...change},id,session,{fetcher})).error,'model_disabled');
 }
 assert.equal(calls,0);
 const decorated={...session,profile:'DO_NOT_FORWARD',answers:session.answers.map(a=>({...a,private:'DO_NOT_FORWARD',value:a.questionId==='q5'?{...a.value,private:'DO_NOT_FORWARD'}:a.value}))};
 assert.equal((await analyzeWithModel(env,id,decorated,{fetcher})).analysis.mode,'model');assert.equal(calls,1);

 // Global daily reservations are atomic, persist across new clients and count fallbacks.
 await db.prepare('DELETE FROM model_counters').run();calls=0;
 const quotaFetcher=async(url,options)=>{calls++;return JSON.parse(options.body).model==='qwen-test-a'?Response.json({code:'AllocationQuota.FreeTierOnly'},{status:403}):completion();};
 const limited={...env,ALIYUN_MODEL_DAILY_CALL_LIMIT:'2'};
 assert.equal((await analyzeWithModel(limited,id,session,{fetcher:quotaFetcher})).analysis.mode,'model');assert.equal(calls,2);
 const {id:otherId}=await subject(db);
 assert.equal((await analyzeWithModel({...limited},otherId,session,{fetcher:quotaFetcher})).analysis.fallbackReason,'daily_limit');assert.equal(calls,2);
 const day=Math.floor(Date.now()/86400000)*86400000;
 assert.equal((await db.prepare("SELECT used FROM model_counters WHERE scope='global' AND window=?1").bind(day).first()).used,2);
 await db.prepare('DELETE FROM model_counters').run();
 const reservations=await Promise.all(Array.from({length:20},()=>reserveCounter(db,'global',day,3)));assert.equal(reservations.filter(Boolean).length,3);

 // Per-subject hourly budget and in-flight lock survive gateway recreation.
 await db.prepare('DELETE FROM model_counters').run();calls=0;
 const hourly={...env,MOAT_MODEL_CALLS_PER_HOUR:'1'};
 assert.equal((await analyzeWithModel(hourly,id,session,{fetcher})).analysis.mode,'model');
 assert.equal((await analyzeWithModel({...hourly},id,session,{fetcher})).error,'model_rate_limited');assert.equal(calls,1);
 await db.prepare('DELETE FROM model_counters').run();
 let entered,release;const started=new Promise(resolve=>{entered=resolve;}),hold=new Promise(resolve=>{release=resolve;});
 const pending=analyzeWithModel(env,id,session,{fetcher:async()=>{entered();await hold;return completion();}});
 try{await started;assert.equal((await analyzeWithModel({...env},id,session,{fetcher})).error,'model_in_progress');}finally{release();await pending;}
 assert.equal(await db.prepare('SELECT owner FROM model_leases WHERE subject_id=?1').bind(id).first(),null);
 const timeout=await analyzeWithModel({...env,MOAT_MODEL_TIMEOUT_MS:'1000'},id,session,{fetcher:async(url,{signal})=>new Promise((resolve,reject)=>{if(signal.aborted)reject(signal.reason);else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});})});
 assert.equal(timeout.analysis.fallbackReason,'timeout');assert.equal(await db.prepare('SELECT owner FROM model_leases WHERE subject_id=?1').bind(id).first(),null);
 const controller=new AbortController();controller.abort();calls=0;
 await analyzeWithModel(env,id,session,{fetcher,signal:controller.signal});assert.equal(calls,0);
 // Database failure cannot turn into an unmetered provider request.
 const brokenDb={prepare(){throw Error('injected_database_failure');}};
 await assert.rejects(analyzeWithModel({...env,DB:brokenDb},id,session,{fetcher}),/injected_database_failure/);assert.equal(calls,0);

 // Frontend's existing product adapter speaks the same Worker protocol.
 await db.prepare('DELETE FROM model_counters').run();
 const client=makeClient(db,{env,fetcher}),adapter=createProductAnalysisAdapter({fetchImpl:client.fetchImpl});
 assert.equal(await adapter.available(),true);assert.equal((await adapter.analyze(session)).mode,'model');assert.equal(calls,1);
 const invalid=await client.request('/api/v1/analyses/model',{method:'POST',body:{session:{}}});assert.equal(invalid.response.status,422);assert.equal(calls,1);
 const rules=await client.request('/api/v1/analyses/rules',{method:'POST',body:{session}});assert.equal(rules.value.analysis.mode,'rules');assert.equal(calls,1);
 const failClient=makeClient(db,{env,fetcher:async()=>Response.json({code:'unavailable'},{status:500})});
 assert.equal((await createProductAnalysisAdapter({fetchImpl:failClient.fetchImpl}).analyze(session)).mode,'rules');
 // Deletion clears subject metadata/leases but cannot reset the global daily budget.
 const current=await client.request('/api/v1/session'),subjectId=current.value.session.subject.id;
 const before=await db.prepare("SELECT used FROM model_counters WHERE scope='global' AND window=?1").bind(day).first();
 const deleted=await client.request('/api/v1/data',{method:'DELETE',body:{confirmed:true,subjectId,revision:0}});assert.equal(deleted.response.status,200);
 assert.equal(await db.prepare('SELECT used FROM model_counters WHERE subject_id=?1').bind(subjectId).first(),null);
 assert.deepEqual(await db.prepare("SELECT used FROM model_counters WHERE scope='global' AND window=?1").bind(day).first(),before);
 console.log('Real D1: free-only gates, daily/hourly limits, leases, timeouts, no-secret forwarding, deletion and frontend protocol passed.');
}
