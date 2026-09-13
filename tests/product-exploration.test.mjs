import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createMemoryProductRepository,createProductService} from '../backend/product-service.mjs';
import {runRulesAnalysis} from '../shared/rules-analysis.js';
import {applyProfileChangeSet,validateProfileChangeSet} from '../shared/profile-changes.js';
import {createPrototypeProfile} from '../shared/profile.js';

async function request(service,{method='GET',url='/api/v1/profile',cookie='',origin='http://127.0.0.1:4173',body,headers={}}={}){
 const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);req.method=method;req.url=url;req.headers={host:'127.0.0.1:4173',origin,...(body===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers};
 const res=new EventEmitter();res.writeHead=(status,responseHeaders)=>{res.status=status;res.headers=responseHeaders;};res.end=value=>{res.body=value?JSON.parse(value):null;};
 await service(req,res);return res;
}
const rulesSession=({id='server-rules',method='',rivers=[]}={})=>({id,flowVersion:'stage10-minimum-v0.2',answers:[
 {questionId:'q1',kind:'situation',value:'change',skipped:false},
 {questionId:'q2',kind:'blockers',value:[],skipped:true},
 {questionId:'q3',kind:'experience',value:'project',skipped:false},
 {questionId:'q4',kind:'actions',value:['organize'],skipped:false},
 {questionId:'q5',kind:'outcome',value:{outcomes:['artifact'],source:null},skipped:false},
 {questionId:'q6',kind:'method',value:method,skipped:!method},
 {questionId:'q7',kind:'river_basis',value:rivers,skipped:!rivers.length}
]});
const changeSet={id:'change_server_test',sessionId:'server-rules',scope:{evidence:['server-rules_evidence_experience'],capitalLinks:['server-rules_capital_human'],riverLinks:['server-rules_river_ability'],unknowns:['server-rules_unknown_direction']},operations:[
 {type:'add_evidence',entityId:'server-rules_evidence_experience',payload:{id:'server-rules_evidence_experience',title:'一次确认实践',experience:'project',actions:['organize'],result:'artifact',source:null,limitations:['一次记录'],source_type:'user_self_report',confirmation_status:'confirmed',input_refs:['q3','q4','q5']}},
 {type:'link_capital',entityId:'server-rules_capital_human',payload:{id:'server-rules_capital_human',evidence_id:'server-rules_evidence_experience',capital:'human',aspect:'信息分类',explanation:'确认使用过该方法。',confirmation_status:'confirmed',input_refs:['q4','q6']}},
 {type:'link_river',entityId:'server-rules_river_ability',payload:{id:'server-rules_river_ability',evidence_id:'server-rules_evidence_experience',river:'ability',explanation:'确认在另一任务复用。',uncertainty:'只记录这次复用。',confirmation_status:'confirmed',input_refs:['q3','q7']}},
 {type:'keep_unknown',entityId:'server-rules_unknown_direction',payload:{id:'server-rules_unknown_direction',topic:'direction',reason:'not_asked',input_refs:[],explanation:'未来方向继续保持未知。',confirmation_status:'confirmed'}}
]};

async function signedIn(repository=createMemoryProductRepository()){
 const service=createProductService({repository}),session=await request(service,{method:'POST',url:'/api/v1/session'});
 return {service,repository,cookie:session.headers['Set-Cookie'].split(';')[0],subject:session.body.session.subject};
}

test('V1 rules analysis requires a session and only uses explicit optional evidence',async()=>{
 const {service,cookie}=await signedIn();
 assert.equal((await request(service,{method:'POST',url:'/api/v1/analyses/rules',body:{session:rulesSession()}})).status,401);
 assert.equal((await request(service,{method:'POST',url:'/api/v1/analyses/rules',cookie,origin:'https://elsewhere.invalid',body:{session:rulesSession()}})).status,403);
 const invalid=await request(service,{method:'POST',url:'/api/v1/analyses/rules',cookie,body:{session:rulesSession({rivers:['fourth']})}});
 assert.equal(invalid.status,422);assert.equal(invalid.body.error.code,'invalid_analysis_input');
 const response=await request(service,{method:'POST',url:'/api/v1/analyses/rules',cookie,body:{session:rulesSession({method:'信息分类法',rivers:['ability','love']})}});
 assert.equal(response.status,200);assert.equal(response.body.analysis.mode,'rules');
 assert.deepEqual(response.body.analysis.proposal.capital_links.map(item=>item.capital),['human']);
 assert.deepEqual(response.body.analysis.proposal.river_links.map(item=>item.river),['ability','love']);
 const legacy=rulesSession({id:'legacy'});legacy.answers=legacy.answers.filter(answer=>!['q6','q7'].includes(answer.questionId));
 const legacyProposal=(await request(service,{method:'POST',url:'/api/v1/analyses/rules',cookie,body:{session:legacy}})).body.analysis.proposal;
 assert.deepEqual(legacyProposal.capital_links,[]);assert.deepEqual(legacyProposal.river_links,[]);
 assert.equal(legacyProposal.unknowns.find(item=>item.topic==='capital').reason,'not_asked');
});

test('V1 model analysis is authenticated, server-routed and falls back explicitly',async()=>{
 const seen=[];
 const modelProvider={freeOnly:true,analyze:async session=>{seen.push(session);return runRulesAnalysis(session);}};
 const repository=createMemoryProductRepository(),service=createProductService({repository,modelProvider});
 const capabilities=await request(service,{url:'/api/v1/capabilities'});
 assert.deepEqual(capabilities.body.analysis.serviceModes,['model','rules']);
 assert.equal(capabilities.body.analysis.routing,'server_managed');assert.equal(capabilities.body.analysis.freeOnly,true);
 assert.equal((await request(service,{method:'POST',url:'/api/v1/analyses/model',body:{session:rulesSession()}})).status,401);
 const created=await request(service,{method:'POST',url:'/api/v1/session'}),cookie=created.headers['Set-Cookie'].split(';')[0];
 const input=rulesSession({method:'信息分类法',rivers:['ability']});input.privateExtra='do-not-send';input.answers[4].value.privateExtra='do-not-send';
 const result=await request(service,{method:'POST',url:'/api/v1/analyses/model',cookie,body:{session:input}});
 assert.equal(result.status,200);assert.equal(result.body.analysis.mode,'model');assert.equal(result.body.analysis.routing,'server_managed');
 assert.equal(result.body.analysis.model,undefined);assert.equal(result.body.analysis.proposal.session_id,input.id);
 assert.equal(seen[0].privateExtra,undefined);assert.equal(seen[0].answers[4].value.privateExtra,undefined);

 const failed=createProductService({repository,modelProvider:{freeOnly:true,analyze:async()=>{throw Error('free_models_exhausted');}}});
 const fallback=await request(failed,{method:'POST',url:'/api/v1/analyses/model',cookie,body:{session:input}});
 assert.equal(fallback.status,200);assert.equal(fallback.body.analysis.mode,'rules');assert.equal(fallback.body.analysis.fallbackFrom,'model');
 assert.equal(fallback.body.analysis.fallbackReason,'free_models_exhausted');assert.equal(fallback.body.analysis.proposal.session_id,input.id);
 assert.ok(!JSON.stringify(fallback.body).includes('do-not-send'));
 const invalid=createProductService({repository,modelProvider:{freeOnly:true,analyze:async()=>({session_id:input.id})}});
 const rejected=await request(invalid,{method:'POST',url:'/api/v1/analyses/model',cookie,body:{session:input}});
 assert.equal(rejected.body.analysis.mode,'rules');assert.equal(rejected.body.analysis.fallbackReason,'model_unavailable');
});

test('V1 model analysis fails closed when unconfigured and times out into rules',async()=>{
 assert.throws(()=>createProductService({modelTimeoutMs:999}),/invalid_model_timeout/);
 assert.throws(()=>createProductService({modelTimeoutMs:120001}),/invalid_model_timeout/);
 const repository=createMemoryProductRepository(),plain=createProductService({repository});
 const created=await request(plain,{method:'POST',url:'/api/v1/session'}),cookie=created.headers['Set-Cookie'].split(';')[0],body={session:rulesSession()};
 const disabled=await request(plain,{method:'POST',url:'/api/v1/analyses/model',cookie,body});
 assert.equal(disabled.status,503);assert.equal(disabled.body.error.code,'model_disabled');
 const stalled=createProductService({repository,modelTimeoutMs:1000,modelProvider:{freeOnly:true,analyze:(_session,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}))}});
 const fallback=await request(stalled,{method:'POST',url:'/api/v1/analyses/model',cookie,body});
 assert.equal(fallback.status,200);assert.equal(fallback.body.analysis.fallbackReason,'timeout');
});

test('V1 model analysis permits one in-flight request and rate-limits each session independently',async()=>{
 let releaseFirst,calls=0;
 const firstGate=new Promise(resolve=>{releaseFirst=resolve;});
 const provider={freeOnly:true,analyze:async session=>{calls++;if(calls===1)await firstGate;return runRulesAnalysis(session);}};
 const repository=createMemoryProductRepository(),service=createProductService({repository,modelProvider:provider,modelCallsPerHour:1});
 const firstSession=await request(service,{method:'POST',url:'/api/v1/session'}),firstCookie=firstSession.headers['Set-Cookie'].split(';')[0],body={session:rulesSession()};
 const pending=request(service,{method:'POST',url:'/api/v1/analyses/model',cookie:firstCookie,body});
 await new Promise(resolve=>setImmediate(resolve));
 const concurrent=await request(service,{method:'POST',url:'/api/v1/analyses/model',cookie:firstCookie,body});
 assert.equal(concurrent.status,429);assert.equal(concurrent.body.error.code,'model_in_progress');assert.equal(concurrent.headers['Retry-After'],'1');
 releaseFirst();assert.equal((await pending).status,200);
 const limited=await request(service,{method:'POST',url:'/api/v1/analyses/model',cookie:firstCookie,body});
 assert.equal(limited.status,429);assert.equal(limited.body.error.code,'model_rate_limited');assert.ok(Number(limited.headers['Retry-After'])>0);
 const secondSession=await request(service,{method:'POST',url:'/api/v1/session'}),secondCookie=secondSession.headers['Set-Cookie'].split(';')[0];
 assert.equal((await request(service,{method:'POST',url:'/api/v1/analyses/model',cookie:secondCookie,body})).status,200);
 assert.equal(calls,2);
});

test('confirmed profile change sets are isolated, versioned and safely replayed',async()=>{
 const repository=createMemoryProductRepository(),first=await signedIn(repository),second=await signedIn(repository);
 const initial=await request(first.service,{url:'/api/v1/profile',cookie:first.cookie});
 assert.equal(initial.status,200);assert.equal(initial.body.revision,0);assert.deepEqual(initial.body.profile,createPrototypeProfile());
 const save=body=>request(first.service,{method:'POST',url:'/api/v1/profile/change-sets',cookie:first.cookie,body,headers:{'idempotency-key':'profile-save-1'}});
 assert.equal((await request(first.service,{method:'POST',url:'/api/v1/profile/change-sets',cookie:first.cookie,body:{revision:0,changeSet}})).status,400);
 const saved=await save({revision:0,changeSet});assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal(saved.body.duplicate,false);
 assert.equal(saved.headers['Idempotency-Replayed'],'false');assert.equal(Object.keys(saved.body.profile.evidence).length,1);
 const replay=await save({revision:0,changeSet:structuredClone(changeSet)});assert.deepEqual(replay.body,saved.body);assert.equal(replay.headers['Idempotency-Replayed'],'true');
 const stale=await request(first.service,{method:'POST',url:'/api/v1/profile/change-sets',cookie:first.cookie,body:{revision:0,changeSet},headers:{'idempotency-key':'profile-stale'}});
 assert.equal(stale.status,409);assert.equal(stale.body.revision,1);assert.equal(stale.body.error.code,'revision_conflict');
 const duplicate=await request(first.service,{method:'POST',url:'/api/v1/profile/change-sets',cookie:first.cookie,body:{revision:1,changeSet},headers:{'idempotency-key':'profile-duplicate'}});
 assert.equal(duplicate.status,200);assert.equal(duplicate.body.revision,1);assert.equal(duplicate.body.duplicate,true);
 assert.equal((await request(first.service,{url:'/api/v1/profile',cookie:second.cookie})).body.revision,0);
 const bootstrap=await request(first.service,{url:'/api/v1/bootstrap',cookie:first.cookie});assert.equal(bootstrap.body.data.profileRevision,1);
});

test('profile validation rejects malformed scope and preserves the prior profile on storage failure',async()=>{
 const bad={...structuredClone(changeSet),scope:{fourthRiver:['server-rules_evidence_experience']}};
 assert.equal(validateProfileChangeSet(bad),false);
 assert.equal(applyProfileChangeSet(createPrototypeProfile(),bad).ok,false);
 const memory=createMemoryProductRepository(),{service,cookie,subject}=await signedIn(memory);
 const broken=createProductService({repository:{...memory,applyProfileChangeSet:async()=>{throw Error('private profile data');}}});
 const failed=await request(broken,{method:'POST',url:'/api/v1/profile/change-sets',cookie,body:{revision:0,changeSet},headers:{'idempotency-key':'profile-fail'}});
 assert.equal(failed.status,503);assert.equal(failed.body.error.code,'storage_unavailable');assert.ok(!JSON.stringify(failed.body).includes('private profile data'));
 assert.equal((await memory.readProfile(subject.id)).revision,0);
});

test('shared rules output stays deterministic and profile application does not mutate requests',()=>{
 const session=rulesSession({method:'信息分类法',rivers:['ability']});
 assert.deepEqual(runRulesAnalysis(session),runRulesAnalysis(structuredClone(session)));
 const requestCopy=structuredClone(changeSet),profile=createPrototypeProfile(),applied=applyProfileChangeSet(profile,requestCopy);
 requestCopy.operations[0].payload.title='外部修改';applied.profile.evidence['server-rules_evidence_experience'].title='响应修改';
 const fresh=applyProfileChangeSet(profile,changeSet);
 assert.equal(fresh.profile.evidence['server-rules_evidence_experience'].title,'一次确认实践');assert.deepEqual(profile,createPrototypeProfile());
});
