import assert from 'node:assert/strict';
import {emptyWorkspace} from '../../shared/workspace.js';
import {pathItem,planItem,growthItem} from './product-workspace.mjs';

// Reused against memory and real PostgreSQL, with a fresh isolated subject.
export async function checkGrowthCommands(repository){
 const {subject}=await repository.createAnonymousSession();
 const base={...emptyWorkspace(),paths:[pathItem()],plans:[planItem()],growth:[]};
 const run=(revision,mutation,key)=>repository.mutateWorkspace(subject.id,revision,mutation,{idempotencyKey:key});
 const imported=await run(0,{kind:'workspace',action:'import',workspace:base,confirmed:true},'import');
 assert.equal(imported.ok,true);assert.equal(imported.workspace.revision,1);
 assert.equal((await run(0,{kind:'workspace',action:'import',workspace:base,confirmed:true},'import')).replayed,true);
 assert.equal((await run(1,{kind:'workspace',action:'import',workspace:base,confirmed:true},'again')).code,'import_requires_empty');
 const record=growthItem();
 assert.equal((await run(1,{kind:'growth',action:'create',item:record},'growth')).ok,true);
 const proof={kind:'growth',action:'confirm-proof',itemId:record.id,confirmed:true,selection:{capital:'human',river:'ability',explanation:'合成成果支持这项练习'}};
 assert.equal((await run(2,{...proof,confirmed:false},'proof')).code,'confirmation_required');
 assert.equal((await run(2,{...proof,selection:{river:'fourth',explanation:'无效'}},'proof')).code,'invalid_proof');
 const confirmed=await run(2,proof,'proof');assert.equal(confirmed.ok,true);
 const snapshot=structuredClone(confirmed.workspace.growth[0].proof);
 const edited={...record,result:'新的成果，尚未重新确认'};
 assert.equal((await run(3,{kind:'growth',action:'update',itemId:record.id,item:{...edited,proof:{}}},'edit')).code,'confirmation_required');
 const saved=await run(3,{kind:'growth',action:'update',itemId:record.id,item:edited},'edit');
 assert.equal(saved.ok,true);assert.deepEqual(saved.workspace.growth[0].proof,snapshot);
 assert.equal((await run(3,proof,'stale')).code,'revision_conflict');
 assert.equal((await run(2,proof,'proof')).replayed,true);
 assert.equal((await repository.readWorkspace(subject.id)).growth[0].result,edited.result);
 const revoked=await run(4,{kind:'growth',action:'revoke-proof',itemId:record.id},'revoke');
 assert.equal(revoked.ok,true);assert.equal(revoked.workspace.growth[0].proof,undefined);
 const deleted=await run(5,{kind:'growth',action:'delete',itemId:record.id},'delete');
 assert.equal(deleted.ok,true);assert.equal(deleted.workspace.growth.length,0);
 const other=await repository.createAnonymousSession();
 assert.equal((await repository.mutateWorkspace(other.subject.id,0,proof,{idempotencyKey:'proof'})).code,'not_found');
 assert.equal((await repository.readWorkspace(other.subject.id)).revision,0);
}
