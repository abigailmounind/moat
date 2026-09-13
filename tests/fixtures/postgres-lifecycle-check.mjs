import assert from 'node:assert/strict';
import {createPostgresProductRepository} from '../../backend/postgres-repository.mjs';
import {emptyWorkspace} from '../../shared/workspace.js';
import {pathItem,planItem,growthItem} from './product-workspace.mjs';

// Real SQL fault injection and deterministic interleaving, with isolated subjects.
export async function checkPostgresLifecycle(pool,otherPool){
 const repository=createPostgresProductRepository({pool});
 const other=createPostgresProductRepository({pool:otherPool});
 const session=await repository.createAnonymousSession();
 const seed={...emptyWorkspace(),paths:[pathItem()],plans:[planItem()],growth:[growthItem()]};
 const saved=await repository.writeWorkspace(session.subject.id,0,seed,{idempotencyKey:'seed'});
 assert.equal(saved.ok,true);
 const wrap=hook=>({query:pool.query.bind(pool),connect:async()=>{
  const client=await pool.connect();
  return {release:client.release.bind(client),query:async(sql,args)=>hook(client,sql,args)};
 }});

 const profileSession=await repository.createAnonymousSession();
 const profileChange={id:'change_pg_profile',sessionId:'pg-profile',scope:{unknowns:['pg_unknown_direction']},operations:[{type:'keep_unknown',entityId:'pg_unknown_direction',payload:{id:'pg_unknown_direction',topic:'direction',reason:'not_asked',input_refs:[],explanation:'继续保持未知。',confirmation_status:'confirmed'}}]};
 const profileBefore=await repository.readProfile(profileSession.subject.id);
 const profileSaved=await repository.applyProfileChangeSet(profileSession.subject.id,profileBefore.revision,profileChange,{idempotencyKey:'pg-profile-save'});
 assert.equal(profileSaved.ok,true);assert.equal(profileSaved.revision,1);
 assert.equal((await repository.applyProfileChangeSet(profileSession.subject.id,0,profileChange,{idempotencyKey:'pg-profile-save'})).replayed,true);
 assert.equal((await repository.applyProfileChangeSet(profileSession.subject.id,0,profileChange,{idempotencyKey:'pg-profile-stale'})).code,'revision_conflict');
 const profileFaulty=createPostgresProductRepository({pool:wrap(async(client,sql,args)=>{
  if(sql.startsWith('INSERT INTO moat_profile_receipts'))return client.query('SELECT 1/0');
  return client.query(sql,args);
 })});
 const profileCurrent=await repository.readProfile(profileSession.subject.id),profileRetry={...profileChange,id:'change_pg_profile_retry'};
 await assert.rejects(profileFaulty.applyProfileChangeSet(profileSession.subject.id,profileCurrent.revision,profileRetry,{idempotencyKey:'pg-profile-rollback'}));
 assert.deepEqual(await repository.readProfile(profileSession.subject.id),profileCurrent);
 assert.equal((await repository.applyProfileChangeSet(profileSession.subject.id,profileCurrent.revision,profileRetry,{idempotencyKey:'pg-profile-rollback'})).ok,true);
 console.log('PostgreSQL: profile revision, idempotent confirmation and receipt rollback passed.');

 // Fail at the receipt insert, after all data rows and revision have changed.
 const operations=[
  {kind:'workspace',action:'import',workspace:{...seed,growth:[]},confirmed:true},
  {kind:'growth',action:'create',item:growthItem()},
  {kind:'growth',action:'confirm-proof',itemId:'growth-1',confirmed:true,selection:{river:'ability',explanation:'合成依据'}},
  {kind:'growth',action:'update',itemId:'growth-1',item:{...growthItem(),result:'更新后的合成成果'}},
  {kind:'growth',action:'revoke-proof',itemId:'growth-1'},
  {kind:'growth',action:'delete',itemId:'growth-1'}
 ];
 const mutationSession=await repository.createAnonymousSession();
 for(const [index,mutation] of operations.entries()){
  const before=await repository.readWorkspace(mutationSession.subject.id);
  let faultReached=false;
  const faulty=createPostgresProductRepository({pool:wrap(async(client,sql,args)=>{
   if(sql.startsWith('INSERT INTO moat_idempotency_receipts')){faultReached=true;return client.query('SELECT 1/0');}
   return client.query(sql,args);
  })});
  const key='rollback-'+index;
  await assert.rejects(faulty.mutateWorkspace(mutationSession.subject.id,before.revision,mutation,{idempotencyKey:key}));
  assert.equal(faultReached,true);
  assert.deepEqual(await repository.readWorkspace(mutationSession.subject.id),before);
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM moat_idempotency_receipts WHERE subject_id=$1 AND operation_key=$2',[mutationSession.subject.id,key])).rows[0].count,0);
  const retried=await repository.mutateWorkspace(mutationSession.subject.id,before.revision,mutation,{idempotencyKey:key});
  assert.equal(retried.ok,true);assert.equal(retried.workspace.revision,before.revision+1);
  assert.equal((await repository.mutateWorkspace(mutationSession.subject.id,before.revision,mutation,{idempotencyKey:key})).replayed,true);
 }
 console.log('PostgreSQL: import, growth create/edit/delete and proof confirm/revoke roll back with failed receipts and retry safely.');
 let injected=false;
 const failing=createPostgresProductRepository({pool:wrap(async(client,sql,args)=>{
  if(sql.startsWith('DELETE FROM moat_subjects')){injected=true;return client.query('SELECT 1/0');}
  return client.query(sql,args);
 })});
 await assert.rejects(failing.deleteSubject(session.subject.id,1));
 assert.equal(injected,true);
 assert.deepEqual(await repository.readWorkspace(session.subject.id),saved.workspace);
 assert.ok(await repository.findSession(session.token));
 assert.equal((await repository.writeWorkspace(session.subject.id,0,seed,{idempotencyKey:'seed'})).replayed,true);

 // Hold the first operation after it acquires the shared writer/deleter lock.
 for(const first of ['write','delete']){
  const {subject,token}=await repository.createAnonymousSession();
  assert.equal((await repository.writeWorkspace(subject.id,0,seed,{idempotencyKey:'seed'})).ok,true);
  let entered,release;
  const locked=new Promise(resolve=>entered=resolve),gate=new Promise(resolve=>release=resolve);
  const gated=createPostgresProductRepository({pool:wrap(async(client,sql,args)=>{
   const result=await client.query(sql,args);
   if(sql.endsWith('FOR UPDATE')){entered();await gate;}
   return result;
  })});
  const change={kind:'paths',action:'update',itemId:'path-1',item:{...pathItem(),name:'并发修改'}};
  const write=repo=>repo.mutateWorkspace(subject.id,1,change,{idempotencyKey:'race'});
  const remove=repo=>repo.deleteSubject(subject.id,1);
  const leading=first==='write'?write(gated):remove(gated);
  await locked;
  const trailing=first==='write'?remove(other):write(other);
  release();
  const [a,b]=await Promise.all([leading,trailing]);
  assert.equal(a.ok,true);
  assert.equal(b.code,first==='write'?'revision_conflict':'subject_not_found');
  if(first==='write'){
   assert.equal((await repository.readWorkspace(subject.id)).paths[0].name,'并发修改');
   assert.ok(await repository.findSession(token));
  }else{
   assert.equal(await repository.readBootstrap(subject.id),null);
   assert.equal(await repository.findSession(token),null);
  }
 }
 assert.equal((await repository.deleteSubject(session.subject.id,1)).ok,true);
 console.log('PostgreSQL: deletion failure rollback, receipt preservation and both writer/deleter orderings passed.');
}
