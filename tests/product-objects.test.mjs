import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createProductService} from '../backend/product-service.mjs';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {emptyWorkspace,validWorkspace} from '../shared/workspace.js';
import {createGrowthProof} from '../frontend/src/growth-proof.js';
import {pathItem,planItem,growthItem} from './fixtures/product-workspace.mjs';

async function session(repository=createMemoryProductRepository()){
 const service=createProductService({repository}),created=await repository.createAnonymousSession();
 const cookie='moat_session='+created.token;
 const request=async({method='GET',route='/paths',body,headers={}}={})=>{
  const req=Readable.from(body===undefined?[]:[JSON.stringify(body)]);
  Object.assign(req,{method,url:'/api/v1'+route,headers:{host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173',cookie,'content-type':'application/json','idempotency-key':'test-key',...headers}});
  const res={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
  await service(req,res);return res;
 };
 return {repository,subject:created.subject,request};
}

test('object API creates, reads, updates, deletes and replays without undoing newer edits',async()=>{
 const {request}=await session(),path=pathItem();
 const create=()=>request({method:'POST',body:{revision:0,path}});
 const saved=await create();assert.equal(saved.status,200);assert.equal(saved.body.workspace.revision,1);
 const read=await request({route:'/paths/path-1'});assert.deepEqual(read.body.path,path);
 const update=await request({method:'PATCH',route:'/paths/path-1',body:{revision:1,path:{...path,notes:'自己的编辑'}},headers:{'idempotency-key':'edit'}});
 assert.equal(update.body.workspace.revision,2);
 const replay=await create();assert.equal(replay.headers['Idempotency-Replayed'],'true');assert.deepEqual(replay.body,saved.body);
 assert.equal((await request()).body.paths[0].notes,'自己的编辑');
 const deleted=await request({method:'DELETE',route:'/paths/path-1',body:{revision:2},headers:{'idempotency-key':'delete'}});
 assert.equal(deleted.body.workspace.paths.length,0);
 assert.equal((await request({route:'/paths/path-1'})).status,404);
 assert.equal((await request({method:'DELETE',route:'/paths/path-1',body:{revision:2},headers:{'idempotency-key':'delete'}})).headers['Idempotency-Replayed'],'true');
});

test('object API rejects malformed input, invalid placement and missing keys without consuming a key',async()=>{
 const {request}=await session();
 for(const plan of [null,{},planItem(),{...planItem(),pathIds:null},{...planItem(),milestones:null}]){
  assert.equal((await request({method:'POST',route:'/plans',body:{revision:0,plan}})).status,422);
 }
 assert.equal((await request({method:'POST',body:{revision:0,path:pathItem()},headers:{'idempotency-key':undefined}})).status,400);
 assert.equal((await request({method:'POST',body:{revision:0,path:pathItem()}})).status,200);
 for(const pathIds of [[],['missing'],['path-1','path-1']])assert.equal((await request({method:'POST',route:'/plans',body:{revision:1,plan:{...planItem(),pathIds}},headers:{'idempotency-key':'plan'}})).status,422);
 assert.equal((await request({method:'POST',route:'/plans',body:{revision:1,plan:{...planItem(),river:'love'}},headers:{'idempotency-key':'plan'}})).status,422);
 assert.equal((await request({method:'POST',route:'/plans',body:{revision:1,plan:planItem()},headers:{'idempotency-key':'plan'}})).status,200);
});

test('object writes require ownership, accepted origin and matching route id',async()=>{
 const {request}=await session();
 for(const [headers,status] of [[{cookie:''},401],[{cookie:'moat_session=unknown'},401],[{origin:'https://elsewhere.invalid'},403],[{'content-type':'text/plain'},415]])assert.equal((await request({method:'POST',body:{revision:0,path:pathItem()},headers})).status,status);
 assert.equal((await request({method:'PATCH',route:'/paths/other',body:{revision:0,path:pathItem()}})).status,422);
 assert.equal((await request({method:'POST',body:{revision:0,path:pathItem()}})).status,200);
 assert.equal((await request({route:'/paths/%invalid'})).status,400);
 assert.equal((await request({method:'POST',route:'/plans',body:{revision:0,plan:planItem()}})).body.error.code,'idempotency_conflict');
});

test('repository commands preserve move/delete relationships and confirmed historical proofs',async()=>{
 const {repository,subject}=await session(),growth=growthItem();growth.proof=createGrowthProof(growth);
 const base={...emptyWorkspace(),paths:[pathItem()],plans:[planItem()],growth:[growth]};
 await repository.writeWorkspace(subject.id,0,base);
 const move=await repository.mutateWorkspace(subject.id,1,{kind:'paths',action:'update',itemId:'path-1',item:{...pathItem(),river:'love'}},{idempotencyKey:'move'});
 assert.equal(move.workspace.plans[0].river,'love');assert.deepEqual(move.workspace.growth[0].proof,growth.proof);
 const removeMilestone=await repository.mutateWorkspace(subject.id,2,{kind:'plans',action:'update',itemId:'plan-1',item:{...planItem(),river:'love',milestones:[]}},{idempotencyKey:'milestone'});
 assert.equal(removeMilestone.workspace.growth[0].milestoneId,'');assert.equal(removeMilestone.workspace.growth[0].milestoneName,'完成初稿');
 const deletedPath=await repository.mutateWorkspace(subject.id,3,{kind:'paths',action:'delete',itemId:'path-1'},{idempotencyKey:'delete-path'});
 assert.deepEqual(deletedPath.workspace.plans[0].pathIds,[]);assert.equal(deletedPath.workspace.growth[0].context[0].river,'love');
 const deletedPlan=await repository.mutateWorkspace(subject.id,4,{kind:'plans',action:'delete',itemId:'plan-1'},{idempotencyKey:'delete-plan'});
 assert.equal(deletedPlan.workspace.growth[0].planId,'');assert.deepEqual(deletedPlan.workspace.growth[0].proof,growth.proof);assert.ok(validWorkspace(deletedPlan.workspace));
 assert.deepEqual(base.plans[0].pathIds,['path-1']);
});

test('legacy shared plans can keep their placement; new sharing and duplicate source directions are rejected',async()=>{
 const {repository,subject}=await session();
 const paths=[{...pathItem(),sourceDirectionId:'direction-1'},pathItem('path-2')];
 const base={...emptyWorkspace(),paths,plans:[{...planItem(),pathIds:['path-1','path-2']} ]};
 await repository.writeWorkspace(subject.id,0,base);
 const command=(item,kind='plans',action='create')=>repository.mutateWorkspace(subject.id,1,{kind,action,itemId:action==='update'?item.id:'',item},{idempotencyKey:'change'});
 assert.equal((await command({...planItem('new-plan'),pathIds:['path-1','path-2']})).code,'multiple_paths_not_allowed');
 assert.equal((await command({...pathItem('new-path'),sourceDirectionId:'direction-1'},'paths')).code,'source_direction_conflict');
 assert.equal((await command({...base.plans[0],notes:'继续编辑'},'plans','update')).ok,true);
});

test('failed command response can replay; independent stale writes conflict and other subjects remain empty',async()=>{
 const repository=createMemoryProductRepository(),write=repository.mutateWorkspace;let lose=true;
 repository.mutateWorkspace=(...args)=>{const result=write(...args);if(lose){lose=false;throw Error('private storage error');}return result;};
 const {request,subject}=await session(repository);
 const create=()=>request({method:'POST',body:{revision:0,path:pathItem()}});
 const failed=await create();assert.equal(failed.status,503);assert.ok(!JSON.stringify(failed.body).includes('private storage'));
 assert.equal((await create()).headers['Idempotency-Replayed'],'true');
 const stale=await request({method:'POST',body:{revision:0,path:pathItem('another')},headers:{'idempotency-key':'another'}});
 assert.equal(stale.body.error.code,'revision_conflict');
 const other=await session(repository);assert.deepEqual((await other.request()).body.paths,[]);
 assert.equal((await other.request({route:'/paths/path-1'})).status,404);
 assert.equal((await repository.readWorkspace(subject.id)).paths.length,1);
});

test('growth HTTP confirmation and empty import require explicit consent, keys and isolated ownership',async()=>{
 const {request,repository}=await session();
 const workspace={...emptyWorkspace(),paths:[pathItem()],plans:[planItem()],growth:[]};
 const imported=()=>request({method:'POST',route:'/imports/workspace',body:{revision:0,workspace,confirmed:true}});
 assert.equal((await request({method:'POST',route:'/imports/workspace',body:{revision:0,workspace}})).body.error.code,'invalid_import');
 assert.equal((await imported()).status,200);assert.equal((await imported()).headers['Idempotency-Replayed'],'true');
 const record=growthItem();
 assert.equal((await request({method:'POST',route:'/growth-records',body:{revision:1,record},headers:{'idempotency-key':'record'}})).status,200);
 const proof=body=>request({method:'POST',route:'/growth-records/growth-1/proof',body:{revision:2,...body},headers:{'idempotency-key':'proof'}});
 assert.equal((await proof({selection:{}})).body.error.code,'confirmation_required');
 for(const selection of [[], 'bad', {capital:'financial'}])assert.equal((await proof({confirmed:true,selection})).body.error.code,'invalid_proof');
 assert.equal((await proof({confirmed:true,selection:{}})).status,200);
 assert.equal((await proof({confirmed:true,selection:{}})).headers['Idempotency-Replayed'],'true');
 const other=await session(repository);
 assert.equal((await other.request({route:'/growth-records/growth-1'})).status,404);
 assert.equal((await other.request({method:'DELETE',route:'/growth-records/growth-1/proof',body:{revision:0}})).status,404);
 assert.equal((await request({method:'DELETE',route:'/growth-records/growth-1/proof',body:{revision:3},headers:{'idempotency-key':'revoke'}})).status,200);
 assert.equal((await request({route:'/growth-records/growth-1'})).body.record.proof,undefined);
});

test('durable HTTP disables aggregate bypass while preserving explicit empty import',async()=>{
 const repository=createMemoryProductRepository();repository.durable=true;
 const {request}=await session(repository);
 assert.equal((await request({method:'PUT',route:'/workspace',body:{revision:0,workspace:emptyWorkspace()}})).body.error.code,'aggregate_write_disabled');
 assert.equal((await request({method:'POST',route:'/imports/workspace',body:{revision:0,workspace:emptyWorkspace(),confirmed:true}})).status,200);
});

test('data export and deletion enforce scope, origin, confirmation, revisions and session revocation',async()=>{
 const {request,subject}=await session();
 await request({method:'POST',body:{revision:0,path:pathItem()}});
 const exported=await request({route:'/data/export'});
 assert.equal(exported.status,200);assert.equal(exported.body.subject.id,subject.id);
 assert.equal(exported.body.data.workspace.revision,1);assert.equal(exported.headers['Cache-Control'],'no-store');
 assert.match(exported.headers['Content-Disposition'],/attachment/);
 assert.equal((await request({route:'/data/export',headers:{cookie:''}})).status,401);
 const body={revision:1,subjectId:subject.id,confirmed:true};
 assert.equal((await request({route:'/data',method:'DELETE',body:{...body,confirmed:false}})).status,422);
 assert.equal((await request({route:'/data',method:'DELETE',body:{...body,subjectId:'other'}})).status,422);
 assert.equal((await request({route:'/data',method:'DELETE',body,headers:{origin:'http://elsewhere.invalid'}})).status,403);
 assert.equal((await request({route:'/data',method:'DELETE',body:{...body,revision:0}})).status,409);
 const deleted=await request({route:'/data',method:'DELETE',body});assert.equal(deleted.body.deleted,true);
 assert.match(deleted.headers['Set-Cookie'],/Max-Age=0/);
 assert.equal((await request({route:'/data/export'})).status,401);
 assert.equal((await request({route:'/data',method:'DELETE',body})).status,401);
});

test('deletion storage failure cannot report success or clear the cookie',async()=>{
 const repository=createMemoryProductRepository();
 repository.deleteSubject=async()=>{throw Error('private failure');};
 const {request,subject}=await session(repository);
 const failed=await request({route:'/data',method:'DELETE',body:{confirmed:true,subjectId:subject.id,revision:0}});
 assert.equal(failed.status,503);assert.equal(failed.headers['Set-Cookie'],undefined);
 assert.ok(!JSON.stringify(failed.body).includes('private failure'));
 assert.equal((await request({route:'/data/export'})).status,200);
});
