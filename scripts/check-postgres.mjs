import assert from 'node:assert/strict';
import {checkSessionRevocation} from '../tests/fixtures/session-revocation-check.mjs';
import {checkPostgresLifecycle} from '../tests/fixtures/postgres-lifecycle-check.mjs';
import {checkDataLifecycle} from '../tests/fixtures/data-lifecycle-check.mjs';
import {checkGrowthCommands} from '../tests/fixtures/growth-api-check.mjs';
import {randomBytes,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import pg from 'pg';
import {migratePostgres,verifyPostgresSchema} from '../backend/postgres-migrations.mjs';
import {createPostgresProductRepository} from '../backend/postgres-repository.mjs';
import {emptyWorkspace} from '../shared/workspace.js';
import {pathItem,planItem,growthItem} from '../tests/fixtures/product-workspace.mjs';
import {createGrowthProof} from '../frontend/src/growth-proof.js';

// Explicit test URL; every write is isolated in a new, randomly named schema.
if(!process.env.MOAT_TEST_DATABASE_URL)throw new Error('Set MOAT_TEST_DATABASE_URL to an isolated PostgreSQL test database.');
const databaseUrl=new URL(process.env.MOAT_TEST_DATABASE_URL);
const schema='moat_check_'+randomBytes(10).toString('hex');
const admin=new pg.Pool({connectionString:databaseUrl.href,connectionTimeoutMillis:5000});
databaseUrl.searchParams.set('options','-c search_path='+schema);
const pool=new pg.Pool({connectionString:databaseUrl.href,max:10,connectionTimeoutMillis:5000,statement_timeout:10000});
const pool2=new pg.Pool({connectionString:databaseUrl.href,max:10,connectionTimeoutMillis:5000,statement_timeout:10000});
let schemaCreated=false,service;
async function startService(){
 const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,DATABASE_URL:databaseUrl.href,MOAT_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
 const closed=once(child,'close');let logs='';child.stderr.on('data',chunk=>{logs+=chunk;});
 const stop=async()=>{if(child.exitCode===null)child.kill('SIGTERM');await closed;};
 try{
  const origin=await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('Test HTTP startup timed out')),10000);let output='';
   child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
   child.once('error',()=>{clearTimeout(timer);reject(Error('Test HTTP startup failed'));});
   child.once('exit',()=>{clearTimeout(timer);reject(Error('Test HTTP startup failed; database configuration or migrations were not accepted'));});
  });
  return {stop,origin,get:(route,options={})=>fetch(origin+route,{...options,signal:AbortSignal.timeout(5000)})};
 }catch(error){await stop();throw error;}
}

try{
 await admin.query('CREATE SCHEMA '+schema);schemaCreated=true;
 await Promise.all([migratePostgres(pool),migratePostgres(pool2)]);
 await verifyPostgresSchema(pool);
 assert.equal((await pool.query('SELECT count(*)::integer AS count FROM moat_schema_migrations')).rows[0].count,2);
 console.log('PostgreSQL: concurrent migrations and schema verification passed.');
 const repository=createPostgresProductRepository({pool}),otherRepository=createPostgresProductRepository({pool:pool2});
 const deletedSubject=await checkDataLifecycle(repository);
 for(const table of ['moat_sessions','moat_profiles','moat_workspaces','moat_paths','moat_plans','moat_plan_paths','moat_growth_records','moat_idempotency_receipts','moat_profile_receipts']){
  assert.equal((await pool.query('SELECT count(*)::integer AS count FROM '+table+' WHERE subject_id=$1',[deletedSubject])).rows[0].count,0);
 }
 console.log('PostgreSQL: data export snapshot and subject deletion cascade passed.');
 await checkSessionRevocation(repository);
 await checkPostgresLifecycle(pool,pool2);
 await checkGrowthCommands(repository);
 console.log('PostgreSQL: growth commands, explicit proof confirmation and empty import passed.');
 const {subject,token}=await repository.createAnonymousSession(),other=await otherRepository.createAnonymousSession();
 const original={...emptyWorkspace(),paths:[pathItem()]};
 const mutation={kind:'paths',action:'create',itemId:'',item:pathItem()};
 const saves=await Promise.all(Array.from({length:8},(_,i)=>(i%2?repository:otherRepository).mutateWorkspace(subject.id,0,mutation,{idempotencyKey:'create'})));
 for(const save of saves){assert.equal(save.ok,true);assert.equal(save.workspace.revision,1);}
 assert.equal(saves.filter(save=>!save.replayed).length,1);
 const plan=await repository.mutateWorkspace(subject.id,1,{kind:'plans',action:'create',itemId:'',item:planItem()},{idempotencyKey:'plan'});
 assert.equal(plan.ok,true);
 const contested=await Promise.all(['a','b'].map((key,index)=>(index?repository:otherRepository).mutateWorkspace(subject.id,2,{kind:'paths',action:'update',itemId:'path-1',item:{...pathItem(),notes:key}},{idempotencyKey:key})));
 assert.deepEqual(contested.map(result=>result.ok).sort(),[false,true]);
 assert.equal(contested.find(result=>!result.ok).code,'revision_conflict');
 assert.equal((await repository.mutateWorkspace(subject.id,0,mutation,{idempotencyKey:'create'})).replayed,true);
 assert.equal((await repository.mutateWorkspace(subject.id,0,{...mutation,item:pathItem('different')},{idempotencyKey:'create'})).code,'idempotency_conflict');
 assert.deepEqual((await repository.readWorkspace(other.subject.id)).paths,[]);
 assert.equal((await repository.findSession(token)).id,subject.id);
 console.log('PostgreSQL: cross-pool concurrency, replay, conflicts and subject isolation passed.');

 // Fault after destructive statements must roll the entire SQL transaction back.
 const before=await repository.readWorkspace(subject.id);
 let fault=true;
 const failingPool={query:pool.query.bind(pool),connect:async()=>{
  const client=await pool.connect();return {release:client.release.bind(client),query:async(sql,args)=>{
   if(fault&&sql.startsWith('INSERT INTO moat_plans')){fault=false;return client.query('SELECT 1/0');}
   return client.query(sql,args);
  }};
 }};
 const failedRepository=createPostgresProductRepository({pool:failingPool});
 await assert.rejects(failedRepository.writeWorkspace(subject.id,before.revision,{...before,paths:[{...pathItem(),name:'应当回滚'}]},{idempotencyKey:'rollback'}));
 assert.deepEqual(await repository.readWorkspace(subject.id),before);
 assert.equal((await pool.query('SELECT count(*)::integer AS count FROM moat_idempotency_receipts WHERE subject_id=$1 AND operation_key=$2',[subject.id,'rollback'])).rows[0].count,0);
 assert.equal((await repository.writeWorkspace(subject.id,before.revision,before,{idempotencyKey:'rollback'})).ok,true);

 // Commit a newer workspace between the reader's header and object queries.
 const snapshot=await repository.readWorkspace(subject.id);let interleave=true;
 const readingPool={query:pool.query.bind(pool),connect:async()=>{
  const client=await pool.connect();return {release:client.release.bind(client),query:async(sql,args)=>{
   const result=await client.query(sql,args);
   if(interleave&&sql.startsWith('SELECT version,revision')){interleave=false;const save=await otherRepository.writeWorkspace(subject.id,snapshot.revision,{...snapshot,paths:[{...pathItem(),name:'新的版本'}]});assert.equal(save.ok,true);}
   return result;
  }};
 }};
 assert.deepEqual(await createPostgresProductRepository({pool:readingPool}).readWorkspace(subject.id),snapshot);
 assert.equal((await repository.readWorkspace(subject.id)).paths[0].name,'新的版本');
 console.log('PostgreSQL: failed transaction rollback and consistent read snapshots passed.');

 const growth=growthItem();growth.proof=createGrowthProof(growth);
 let current=await repository.readWorkspace(subject.id);
 current=(await repository.writeWorkspace(subject.id,current.revision,{...current,growth:[growth]})).workspace;
 const update=(kind,item,key)=>repository.mutateWorkspace(subject.id,current.revision,{kind,action:'update',itemId:item.id,item},{idempotencyKey:key});
 current=(await update('paths',{...pathItem(),river:'love'},'move')).workspace;
 assert.equal(current.plans[0].river,'love');assert.deepEqual(current.growth[0].proof,growth.proof);
 current=(await update('plans',{...planItem(),river:'love',milestones:[]},'remove-milestone')).workspace;
 assert.equal(current.growth[0].milestoneId,'');
 current=(await repository.mutateWorkspace(subject.id,current.revision,{kind:'paths',action:'delete',itemId:'path-1'},{idempotencyKey:'delete-path'})).workspace;
 assert.deepEqual(current.plans[0].pathIds,[]);assert.equal(current.growth[0].context[0].river,'love');
 current=(await repository.mutateWorkspace(subject.id,current.revision,{kind:'plans',action:'delete',itemId:'plan-1'},{idempotencyKey:'delete-plan'})).workspace;
 assert.equal(current.growth[0].planId,'');assert.deepEqual(current.growth[0].proof,growth.proof);

 const bounded=createPostgresProductRepository({pool,maxKeysPerSubject:1});
 const boundedSession=await bounded.createAnonymousSession();
 const first=await bounded.writeWorkspace(boundedSession.subject.id,0,original,{idempotencyKey:'first'});
 assert.equal((await bounded.writeWorkspace(boundedSession.subject.id,1,first.workspace,{idempotencyKey:'second'})).code,'idempotency_capacity');
 await pool.query("UPDATE moat_idempotency_receipts SET expires_at=clock_timestamp()-interval '1 second' WHERE subject_id=$1",[boundedSession.subject.id]);
 assert.equal((await bounded.writeWorkspace(boundedSession.subject.id,0,original,{idempotencyKey:'first'})).code,'revision_conflict');
 assert.equal((await bounded.writeWorkspace(boundedSession.subject.id,1,first.workspace,{idempotencyKey:'second'})).ok,true);
 const digest=createHash('sha256').update(boundedSession.token).digest('hex');
 await pool.query("UPDATE moat_sessions SET expires_at=clock_timestamp()-interval '1 second' WHERE token_hash=$1",[digest]);
 assert.equal(await bounded.findSession(boundedSession.token),null);
 console.log('PostgreSQL: relationship changes, proof preservation, receipt capacity/expiry and session expiry passed.');

 service=await startService();
 assert.equal((await service.get('/')).status,200);
 assert.equal((await service.get('/shared/workspace-operations.js')).status,200);
 assert.equal((await (await service.get('/api/v1/capabilities')).json()).persistence.durable,true);
 const session=await service.get('/api/v1/session',{method:'POST',headers:{origin:service.origin}});
 assert.equal(session.status,201);const cookie=session.headers.get('set-cookie').split(';')[0];
 let headers={origin:service.origin,cookie,'content-type':'application/json','idempotency-key':'http-path'};
 const body=JSON.stringify({revision:0,path:pathItem()});
 const saved=await service.get('/api/v1/paths',{method:'POST',headers,body});assert.equal(saved.status,200);
 await service.stop();service=await startService();headers={...headers,origin:service.origin};
 const restored=await service.get('/api/v1/paths/path-1',{headers:{cookie}});assert.equal(restored.status,200);assert.deepEqual((await restored.json()).path,pathItem());
 const replay=await service.get('/api/v1/paths',{method:'POST',headers,body});assert.equal(replay.headers.get('idempotency-replayed'),'true');
 const savedPlan=await service.get('/api/v1/plans',{method:'POST',headers:{...headers,'idempotency-key':'http-plan'},body:JSON.stringify({revision:1,plan:planItem()})});assert.equal(savedPlan.status,200);
 assert.equal((await service.get('/api/v1/plans/plan-1',{headers:{cookie}})).status,200);
 assert.equal((await service.get('/api/v1/paths/path-1')).status,401);
 console.log('PostgreSQL: actual HTTP, Node service restart, persisted session/data and retry receipts passed.');

 const request=async(route,method,payload,key)=>{
  const response=await service.get(route,{method,headers:{origin:service.origin,cookie,'content-type':'application/json',...(key?{'idempotency-key':key}:{})},...(payload?{body:JSON.stringify(payload)}:{})});
  return {response,data:await response.json()};
 };
 const created=await request('/api/v1/growth-records','POST',{revision:2,record:growthItem()},'http-growth');
 assert.equal(created.response.status,200);
 const proofPayload={revision:3,confirmed:true,selection:{capital:'human',river:'ability',explanation:'合成验证依据'}};
 const confirmed=await request('/api/v1/growth-records/growth-1/proof','POST',proofPayload,'http-proof');
 assert.equal(confirmed.response.status,200);
 const proofSnapshot=confirmed.data.workspace.growth[0].proof;
 await service.stop();service=await startService();
 const proofReplay=await request('/api/v1/growth-records/growth-1/proof','POST',proofPayload,'http-proof');
 assert.equal(proofReplay.response.headers.get('idempotency-replayed'),'true');
 const exported=await request('/api/v1/data/export','GET');
 assert.equal(exported.response.status,200);
 assert.match(exported.response.headers.get('content-disposition'),/attachment/);
 assert.deepEqual(exported.data.data.workspace.growth[0].proof,proofSnapshot);
 const subjectId=exported.data.subject.id;
 const staleDelete=await request('/api/v1/data','DELETE',{confirmed:true,subjectId,revision:3});
 assert.equal(staleDelete.response.status,409);
 const removed=await request('/api/v1/data','DELETE',{confirmed:true,subjectId,revision:4});
 assert.equal(removed.response.status,200);assert.equal(removed.data.deleted,true);
 await service.stop();service=await startService();
 assert.equal((await service.get('/api/v1/data/export',{headers:{cookie}})).status,401);
 assert.equal(await repository.readBootstrap(subjectId),null);
 console.log('PostgreSQL: HTTP growth/proof replay, export, stale deletion rejection and deletion across restart passed.');
 const logoutSession=await service.get('/api/v1/session',{method:'POST',headers:{origin:service.origin}});
 const logoutCookie=logoutSession.headers.get('set-cookie').split(';')[0];
 const logoutSubject=(await logoutSession.json()).session.subject.id;
 const logout=await service.get('/api/v1/session',{method:'DELETE',headers:{origin:service.origin,cookie:logoutCookie}});
 assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 await service.stop();service=await startService();
 assert.equal((await service.get('/api/v1/session',{headers:{cookie:logoutCookie}})).status,401);
 assert.ok(await repository.readBootstrap(logoutSubject));
 assert.equal((await service.get('/api/v1/session',{method:'DELETE',headers:{origin:service.origin,cookie:logoutCookie}})).status,200);
 console.log('PostgreSQL: session revocation preserves data and persists across Node restart.');


}finally{
 if(service)await service.stop();
 await Promise.all([pool.end(),pool2.end()]);
 // Only the schema generated by this invocation is removed.
 if(schemaCreated)await admin.query('DROP SCHEMA '+schema+' CASCADE');
 await admin.end();
}
