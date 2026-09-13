import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createWorker} from '../cloudflare/worker.mjs';

class FakeStatement{
 constructor(db,sql){this.db=db;this.sql=sql;this.args=[];}
 bind(...args){this.args=args;return this;}
 async first(){
  if(this.db.failure)throw this.db.failure;
  if(this.sql.startsWith('SELECT s.id')){const session=this.db.sessions.get(this.args[0]);if(!session||session.expiresAt<=this.args[1])return null;const subject=this.db.subjects.get(session.subjectId);return subject?{id:subject.id,kind:subject.kind,createdAt:subject.createdAt}:null;}
  if(this.sql.startsWith('SELECT revision')&&this.sql.includes('FROM profiles')){const item=this.db.profiles.get(this.args[0]);return item?{revision:item.revision,contentJson:item.content}:null;}
  if(this.sql.startsWith('SELECT revision')&&this.sql.includes('FROM workspaces')){const item=this.db.workspaces.get(this.args[0]);return item?{revision:item.revision,contentJson:item.content}:null;}
  if(this.sql.startsWith('SELECT fingerprint')){const item=this.db.receipts.get(`${this.args[0]}:${this.args[1]}`);return item&&item.expiresAt>this.args[2]?{fingerprint:item.fingerprint,responseJson:item.response}:null;}
  if(this.sql.startsWith('SELECT count(*)')){let count=0;for(const [receiptKey,item] of this.db.receipts)if(receiptKey.startsWith(`${this.args[0]}:`)&&item.expiresAt>this.args[1])count++;return {count};}
  return null;
 }
 async run(){
  if(this.db.failure)throw this.db.failure;
  if(this.sql.startsWith('DELETE FROM sessions'))this.db.sessions.delete(this.args[0]);
  if(this.sql.startsWith('DELETE FROM subjects')){
   const subjectId=this.args[0],workspace=this.db.workspaces.get(subjectId);if(!this.db.subjects.has(subjectId)||workspace?.revision!==this.args[1])return {success:true,meta:{changes:0}};
   this.db.subjects.delete(subjectId);this.db.profiles.delete(subjectId);this.db.workspaces.delete(subjectId);
   for(const [key,session] of this.db.sessions)if(session.subjectId===subjectId)this.db.sessions.delete(key);
   for(const key of this.db.receipts.keys())if(key.startsWith(`${subjectId}:`))this.db.receipts.delete(key);
   return {success:true,meta:{changes:5}};
  }
  return {success:true,meta:{changes:1}};
 }
}
class FakeD1{
 constructor(){this.subjects=new Map();this.sessions=new Map();this.profiles=new Map();this.workspaces=new Map();this.receipts=new Map();this.visits=[];this.failure=null;this.snapshotBatches=0;}
 prepare(sql){return new FakeStatement(this,sql);}
 async batch(statements){
  if(this.failure)throw this.failure;
  if(statements[0].sql.startsWith('DELETE FROM idempotency_receipts')){
   const [subjectId,timestamp]=statements[0].args;
   for(const [key,row] of this.receipts)if(key.startsWith(`${subjectId}:`)&&row.expiresAt<=timestamp)this.receipts.delete(key);
   const [id,key,fingerprint,response,expiresAt,owner,revision,capacity]=statements[1].args;
   const table=statements[1].sql.includes('FROM profiles')?this.profiles:this.workspaces,current=table.get(id),receiptKey=`${id}:${key}`;
   if(current?.revision===revision&&!this.receipts.has(receiptKey)&&[...this.receipts.keys()].filter(k=>k.startsWith(`${id}:`)).length<capacity){
    this.receipts.set(receiptKey,{fingerprint,response,expiresAt,owner});
    current.revision=statements[2].args[2];current.content=statements[2].args[3];
   }
   const row=this.receipts.get(receiptKey);
   return [{},{},{},{results:row?[{fingerprint:row.fingerprint,responseJson:row.response,owner:row.owner}]:[]}];
  }
  if(statements[0].sql.startsWith('DELETE FROM visitor_events')){
   const cutoff=statements[0].args[0];this.visits=this.visits.filter(row=>row.visitedAt>=cutoff);
   const a=statements[1].args;this.visits.push({id:a[0],visitedAt:a[1],countryCode:a[2],region:a[3],city:a[4],latitude:a[5],longitude:a[6]});return [{success:true,meta:{changes:0}},{success:true,meta:{changes:1}}];
  }
  if(statements[0].sql.startsWith('SELECT count(*) AS total FROM visitor_events')){
   const cutoff=statements[0].args[0],rows=this.visits.filter(row=>row.visitedAt>=cutoff).sort((a,b)=>b.visitedAt.localeCompare(a.visitedAt)).slice(0,500);
   return [{success:true,results:[{total:this.visits.filter(row=>row.visitedAt>=cutoff).length}]},{success:true,results:rows}];
  }
  const results=[];
  for(const statement of statements){const a=statement.args;let changes=1;
   if(statement.sql.startsWith('SELECT revision')){const source=statement.sql.includes('FROM profiles')?this.profiles:this.workspaces,item=source.get(a[0]);results.push({success:true,results:item?[{revision:item.revision,contentJson:item.content}]:[],meta:{changes:0}});continue;}
   if(statement.sql.startsWith('INSERT INTO subjects'))this.subjects.set(a[0],{id:a[0],kind:a[1],createdAt:a[2]});
   else if(statement.sql.startsWith('INSERT INTO sessions'))this.sessions.set(a[0],{subjectId:a[1],createdAt:a[2],expiresAt:a[3]});
   else if(statement.sql.startsWith('INSERT INTO profiles'))this.profiles.set(a[0],{revision:0,content:a[1],lastKey:null,lastFingerprint:null});
   else if(statement.sql.startsWith('INSERT INTO workspaces'))this.workspaces.set(a[0],{revision:0,content:a[1],lastKey:null,lastFingerprint:null});
   else if(statement.sql.startsWith('UPDATE profiles')){const item=this.profiles.get(a[0]);if(!item||item.revision!==a[1])changes=0;else Object.assign(item,{revision:a[2],content:a[3],lastKey:a[4],lastFingerprint:a[5]});}
   else if(statement.sql.startsWith('UPDATE workspaces')){const item=this.workspaces.get(a[0]);if(!item||item.revision!==a[1])changes=0;else Object.assign(item,{revision:a[2],content:a[3],lastKey:a[4],lastFingerprint:a[5]});}
   else if(statement.sql.startsWith('INSERT INTO idempotency_receipts')){const source=statement.sql.includes('FROM workspaces')?this.workspaces.get(a[0]):this.profiles.get(a[0]),matches=statement.sql.includes('last_operation_key')?source?.lastKey===a[1]&&source?.lastFingerprint===a[2]:source?.revision===a[5];if(!matches)changes=0;else this.receipts.set(`${a[0]}:${a[1]}`,{fingerprint:a[2],response:a[3],expiresAt:a[4]});}
   results.push({success:true,meta:{changes}});
  }
  if(statements.length===2&&statements.every(statement=>statement.sql.startsWith('SELECT revision')))this.snapshotBatches++;
  return results;
 }
}
const call=(worker,path,{method='GET',cookie='',origin='https://moat.example'}={})=>worker.fetch(new Request('https://moat.example'+path,{method,headers:{...(origin?{Origin:origin}:{}),...(cookie?{Cookie:cookie}:{})}}),{DB:call.db});
const value=async response=>({status:response.status,headers:response.headers,body:await response.json()});

test('Worker health and capabilities disclose durable D1 without creating data',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1();
 const health=await value(await call(worker,'/api/v1/health')),capabilities=await value(await call(worker,'/api/v1/capabilities'));
 assert.equal(health.status,200);assert.equal(capabilities.body.persistence.mode,'d1');assert.equal(capabilities.body.persistence.freeTierFailClosed,true);
 assert.equal(db.subjects.size,0);assert.equal(capabilities.body.analysis.model,'disabled');assert.equal(capabilities.body.profileWrites.changeSets,true);assert.equal(capabilities.body.workspaceWrites.aggregateEnabled,false);
});

test('Worker anonymous session is same-origin, hashed, resumable and revocable',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1();
 assert.equal((await call(worker,'/api/v1/session',{method:'POST',origin:'https://other.example'})).status,403);
 const created=await value(await call(worker,'/api/v1/session',{method:'POST'})),cookie=created.headers.get('set-cookie').split(';')[0];
 assert.equal(created.status,201);assert.match(created.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
 assert.equal(db.subjects.size,1);assert.equal(db.sessions.size,1);assert.equal(db.profiles.size,1);assert.equal(db.workspaces.size,1);
 assert.ok(![...db.sessions.keys()][0].includes(cookie.split('=')[1]));
 const profile=await value(await call(worker,'/api/v1/profile',{cookie})),workspace=await value(await call(worker,'/api/v1/workspace',{cookie})),bootstrap=await value(await call(worker,'/api/v1/bootstrap',{cookie}));
 assert.equal(profile.body.revision,0);assert.deepEqual(profile.body.profile,{evidence:{},capitalLinks:{},riverLinks:{},unknowns:{},appliedChangeSets:[]});
 assert.equal(workspace.body.workspace.revision,0);assert.deepEqual(bootstrap.body.data,{profile:profile.body.profile,profileRevision:0,workspace:workspace.body.workspace});
 assert.equal(db.snapshotBatches,1);
 const resumed=await value(await call(worker,'/api/v1/session',{cookie}));assert.equal(resumed.body.session.subject.id,created.body.session.subject.id);
 const reused=await value(await call(worker,'/api/v1/session',{method:'POST',cookie}));assert.equal(reused.status,200);assert.equal(db.subjects.size,1);
 const deleted=await value(await call(worker,'/api/v1/session',{method:'DELETE',cookie}));assert.equal(deleted.body.signedOut,true);assert.match(deleted.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await call(worker,'/api/v1/session',{cookie})).status,401);assert.equal(db.subjects.size,1);
});

test('visitor events are same-origin, anonymous, coarse and privately readable',async()=>{
 const worker=createWorker(),db=new FakeD1(),env={DB:db,VISITOR_STATS_ADMIN_KEY:'test-admin-key'};
 const send=(origin,cf)=>{const request=new Request('https://moat.example/api/v1/visits',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'moat_session=must-not-be-stored'},body:'{}'});Object.defineProperty(request,'cf',{value:cf});return worker.fetch(request,env);};
 assert.equal((await send('https://other.example',{country:'US'})).status,403);assert.equal(db.visits.length,0);
 db.visits.push({id:'old',visitedAt:'2020-01-01T00:00:00.000Z',countryCode:'XX',region:'old',city:'old',latitude:0,longitude:0});
 assert.equal((await send('https://moat.example',{country:'sg',region:'Central',city:'Singapore',latitude:'1.349',longitude:'103.856'})).status,201);
 assert.equal(db.visits.length,1);assert.deepEqual(db.visits[0].countryCode,'SG');assert.equal(db.visits[0].latitude,1.3);assert.equal(db.visits[0].longitude,103.9);
 assert.doesNotMatch(JSON.stringify(db.visits),/must-not-be-stored|subject|cookie|ip/i);
 await send('https://moat.example',{country:'KR',latitude:'91',longitude:'-181'});assert.equal(db.visits[1].latitude,null);assert.equal(db.visits[1].longitude,null);
 for(const authorization of ['', 'Bearer wrong']){const response=await worker.fetch(new Request('https://moat.example/api/v1/admin/visits',{headers:{Authorization:authorization}}),env);assert.equal(response.status,401);}
 const response=await worker.fetch(new Request('https://moat.example/api/v1/admin/visits',{headers:{Authorization:'Bearer test-admin-key'}}),env),body=await response.json();
 assert.equal(response.status,200);assert.equal(body.total,2);assert.equal(body.returned,2);assert.equal(body.limit,500);assert.deepEqual(new Set(body.visits.map(row=>row.countryCode)),new Set(['SG','KR']));assert.equal(body.visits.some(row=>'country' in row),false);
});

test('Worker read endpoints isolate subjects and reject corrupt stored JSON',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1(),first=await value(await call(worker,'/api/v1/session',{method:'POST'})),firstCookie=first.headers.get('set-cookie').split(';')[0];
 const second=await value(await call(worker,'/api/v1/session',{method:'POST'})),secondCookie=second.headers.get('set-cookie').split(';')[0];
 db.workspaces.get(first.body.session.subject.id).content='{"version":1,"revision":9}';
 const corrupt=await value(await call(worker,'/api/v1/workspace',{cookie:firstCookie}));assert.equal(corrupt.status,503);assert.equal(corrupt.body.error.code,'stored_data_invalid');
 const safe=await value(await call(worker,'/api/v1/workspace',{cookie:secondCookie}));assert.equal(safe.status,200);assert.equal(safe.body.workspace.revision,0);
 assert.equal((await call(worker,'/api/v1/bootstrap')).status,401);
 assert.equal((await call(worker,'/api/v1/profile',{method:'POST',cookie:secondCookie})).status,405);
 db.profiles.get(second.body.session.subject.id).content='not-json';
 const corruptProfile=await value(await call(worker,'/api/v1/profile',{cookie:secondCookie}));assert.equal(corruptProfile.status,503);assert.equal(corruptProfile.body.error.code,'stored_data_invalid');
});

test('D1 foundation migration keeps identity data related and revisioned',async()=>{
 const sql=await readFile(new URL('../cloudflare/migrations/0001_foundation.sql',import.meta.url),'utf8');
 for(const table of ['subjects','sessions','profiles','workspaces','idempotency_receipts'])assert.match(sql,new RegExp(`CREATE TABLE ${table} \\(`));
 assert.match(sql,/token_hash TEXT PRIMARY KEY/);assert.match(sql,/REFERENCES subjects\(id\) ON DELETE CASCADE/g);
 assert.match(sql,/revision INTEGER NOT NULL DEFAULT 0 CHECK \(revision >= 0\)/g);
 assert.doesNotMatch(sql,/api[_-]?key|access[_-]?key|secret/i);
});

test('Worker profile writes are revisioned, idempotent and isolated',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1(),created=await value(await call(worker,'/api/v1/session',{method:'POST'})),cookie=created.headers.get('set-cookie').split(';')[0];
 const changeSet={id:'change-1',sessionId:'explore-1',scope:{evidence:['evidence-1']},operations:[{type:'add_evidence',entityId:'evidence-1',payload:{id:'evidence-1',title:'一次确认',experience:'project',actions:['整理'],result:'形成记录',source:null,limitations:['单次自述'],source_type:'user_self_report',confirmation_status:'confirmed',input_refs:['q3']}}]};
 const request=(payload,key='profile-1')=>worker.fetch(new Request('https://moat.example/api/v1/profile/change-sets',{method:'POST',headers:{Origin:'https://moat.example',Cookie:cookie,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)}),{DB:db});
 const saved=await value(await request({revision:0,changeSet}));assert.equal(saved.status,200);assert.equal(saved.body.revision,1);assert.equal(saved.headers.get('Idempotency-Replayed'),'false');
 const replay=await value(await request({revision:0,changeSet}));assert.deepEqual(replay.body,saved.body);assert.equal(replay.headers.get('Idempotency-Replayed'),'true');
 const conflicting=structuredClone(changeSet);conflicting.operations[0].payload.title='不同内容';assert.equal((await value(await request({revision:0,changeSet:conflicting}))).body.error.code,'idempotency_conflict');
 const stale=await value(await request({revision:0,changeSet},'profile-2'));assert.equal(stale.status,409);assert.equal(stale.body.error.code,'revision_conflict');assert.equal(stale.body.revision,1);
 assert.equal((await request({revision:1,changeSet},'bad key')).status,400);
 const wrongType=await worker.fetch(new Request('https://moat.example/api/v1/profile/change-sets',{method:'POST',headers:{Origin:'https://moat.example',Cookie:cookie,'Idempotency-Key':'profile-3'},body:'{}'}),{DB:db});assert.equal(wrongType.status,415);
});

test('Worker path and plan APIs preserve placement, revisions and receipts',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1(),created=await value(await call(worker,'/api/v1/session',{method:'POST'})),cookie=created.headers.get('set-cookie').split(';')[0];
 const request=(path,{method='GET',body,key}={})=>worker.fetch(new Request(`https://moat.example${path}`,{method,headers:{Origin:'https://moat.example',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined}),{DB:db});
 const path={id:'path-1',river:'ability',name:'验证路径',status:'exploring',goal:'练习',notes:'',support:'',gap:'',constraints:'',nextAction:''};
 const plan={id:'plan-1',river:'ability',name:'验证计划',status:'active',goal:'形成方法',notes:'',capitals:['human'],pathIds:['path-1'],milestones:[]};
 const createdPath=await value(await request('/api/v1/paths',{method:'POST',key:'path-create',body:{revision:0,path}}));assert.equal(createdPath.status,200);assert.equal(createdPath.body.workspace.revision,1);
 const replay=await value(await request('/api/v1/paths',{method:'POST',key:'path-create',body:{revision:0,path}}));assert.equal(replay.headers.get('Idempotency-Replayed'),'true');
 const createdPlan=await value(await request('/api/v1/plans',{method:'POST',key:'plan-create',body:{revision:1,plan}}));assert.equal(createdPlan.status,200);assert.equal(createdPlan.body.workspace.revision,2);
 const list=await value(await request('/api/v1/plans'));assert.equal(list.body.revision,2);assert.deepEqual(list.body.plans,[plan]);
 const moved=await value(await request('/api/v1/paths/path-1',{method:'PATCH',key:'path-move',body:{revision:2,path:{...path,river:'love'}}}));assert.equal(moved.body.workspace.plans[0].river,'love');
 const removed=await value(await request('/api/v1/paths/path-1',{method:'DELETE',key:'path-delete',body:{revision:3}}));assert.deepEqual(removed.body.workspace.plans[0].pathIds,[]);
 assert.equal((await request('/api/v1/paths/path-1')).status,404);
 const stale=await value(await request('/api/v1/plans/plan-1',{method:'DELETE',key:'plan-stale',body:{revision:3}}));assert.equal(stale.status,409);assert.equal(stale.body.error.code,'revision_conflict');
});

test('Worker imports empty workspaces and protects growth proof confirmation',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1(),created=await value(await call(worker,'/api/v1/session',{method:'POST'})),cookie=created.headers.get('set-cookie').split(';')[0];
 const request=(path,{method='GET',body,key}={})=>worker.fetch(new Request(`https://moat.example${path}`,{method,headers:{Origin:'https://moat.example',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined}),{DB:db});
 const path={id:'path-1',river:'ability',name:'验证路径',status:'exploring',goal:'练习',notes:'',support:'',gap:'',constraints:'',nextAction:''};
 const plan={id:'plan-1',river:'ability',name:'验证计划',status:'active',goal:'形成方法',notes:'',capitals:['human'],pathIds:['path-1'],milestones:[{id:'milestone-1',name:'完成初稿',criterion:'可回看',done:false,actions:[]}]};
 const workspace={version:1,revision:0,paths:[path],plans:[plan],growth:[]};
 const unconfirmed=await value(await request('/api/v1/imports/workspace',{method:'POST',key:'import-bad',body:{revision:0,workspace}}));assert.equal(unconfirmed.body.error.code,'invalid_import');
 const imported=await value(await request('/api/v1/imports/workspace',{method:'POST',key:'import-1',body:{revision:0,workspace,confirmed:true}}));assert.equal(imported.status,200);assert.equal(imported.body.workspace.revision,1);
 const growth={id:'growth-1',name:'验证成果',date:'2026-09-12',type:'result',action:'整理素材',result:'形成初稿',reflection:'',source:'合成测试',planId:'plan-1',milestoneId:'milestone-1',planName:'',milestoneName:''};
 const saved=await value(await request('/api/v1/growth-records',{method:'POST',key:'growth-1',body:{revision:1,record:growth}}));assert.equal(saved.status,200);assert.equal(saved.body.workspace.growth[0].planName,'验证计划');
 const bypass=await value(await request('/api/v1/growth-records/growth-1',{method:'PATCH',key:'growth-bypass',body:{revision:2,record:{...saved.body.workspace.growth[0],proof:{}}}}));assert.equal(bypass.body.error.code,'confirmation_required');
 const missingConfirmation=await value(await request('/api/v1/growth-records/growth-1/proof',{method:'POST',key:'proof-bad',body:{revision:2,selection:{}}}));assert.equal(missingConfirmation.body.error.code,'confirmation_required');
 const proof=await value(await request('/api/v1/growth-records/growth-1/proof',{method:'POST',key:'proof-1',body:{revision:2,confirmed:true,selection:{}}}));assert.equal(proof.status,200);assert.ok(proof.body.workspace.growth[0].proof);
 const revoked=await value(await request('/api/v1/growth-records/growth-1/proof',{method:'DELETE',key:'proof-revoke',body:{revision:3}}));assert.equal(revoked.status,200);assert.equal(revoked.body.workspace.growth[0].proof,undefined);
 const secondImport=await value(await request('/api/v1/imports/workspace',{method:'POST',key:'import-2',body:{revision:4,workspace,confirmed:true}}));assert.equal(secondImport.body.error.code,'import_requires_empty');
});

test('Worker exports one subject and conditionally deletes its complete server data',async()=>{
 const worker=createWorker(),db=call.db=new FakeD1(),first=await value(await call(worker,'/api/v1/session',{method:'POST'})),cookie=first.headers.get('set-cookie').split(';')[0],second=await value(await call(worker,'/api/v1/session',{method:'POST'}));
 const request=(path,{method='GET',body}={})=>worker.fetch(new Request(`https://moat.example${path}`,{method,headers:{Origin:'https://moat.example',Cookie:cookie,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB:db});
 const exported=await value(await request('/api/v1/data/export'));assert.equal(exported.status,200);assert.equal(exported.body.subject.id,first.body.session.subject.id);assert.equal(exported.body.format,'personal-moat-server-export');assert.match(exported.headers.get('Content-Disposition'),/^attachment;/);assert.ok(!JSON.stringify(exported.body).includes(cookie.split('=')[1]));
 const wrong=await value(await request('/api/v1/data',{method:'DELETE',body:{confirmed:true,subjectId:second.body.session.subject.id,revision:0}}));assert.equal(wrong.status,422);assert.equal(wrong.body.error.code,'deletion_confirmation_required');
 db.workspaces.get(first.body.session.subject.id).revision=1;db.workspaces.get(first.body.session.subject.id).content=JSON.stringify({version:1,revision:1,paths:[],plans:[],growth:[]});
 const stale=await value(await request('/api/v1/data',{method:'DELETE',body:{confirmed:true,subjectId:first.body.session.subject.id,revision:0}}));assert.equal(stale.status,409);assert.equal(stale.body.workspace.revision,1);
 const deleted=await value(await request('/api/v1/data',{method:'DELETE',body:{confirmed:true,subjectId:first.body.session.subject.id,revision:1}}));assert.equal(deleted.status,200);assert.equal(deleted.body.deleted,true);assert.match(deleted.headers.get('Set-Cookie'),/Max-Age=0/);
 assert.equal((await request('/api/v1/session')).status,401);assert.equal(db.subjects.has(second.body.session.subject.id),true);assert.equal(db.subjects.size,1);
});

test('Worker fails closed when D1 is absent or its free quota is exhausted',async()=>{
 const worker=createWorker();
 const missing=await worker.fetch(new Request('https://moat.example/api/v1/session'),{});assert.equal((await missing.json()).error.code,'storage_unavailable');
 const db=call.db=new FakeD1();db.failure=Error("Your account has exceeded D1's free tier daily row read limit.");
 const exhausted=await value(await call(worker,'/api/v1/session',{method:'POST'}));assert.equal(exhausted.status,503);assert.equal(exhausted.body.error.code,'free_tier_exhausted');
 assert.equal(db.subjects.size,0);
});
