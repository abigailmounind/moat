import assert from 'node:assert/strict';
import {emptyWorkspace} from '../../shared/workspace.js';
import {pathItem,planItem,growthItem} from './product-workspace.mjs';

export async function checkDataLifecycle(repository){
 const {subject,token}=await repository.createAnonymousSession(),other=await repository.createAnonymousSession();
 const data={...emptyWorkspace(),paths:[pathItem()],plans:[planItem()],growth:[growthItem()]};
 assert.equal((await repository.writeWorkspace(subject.id,0,data,{idempotencyKey:'seed'})).ok,true);
 const exported=await repository.readBootstrap(subject.id);assert.deepEqual(exported.workspace.growth,data.growth);
 exported.workspace.paths[0].name='modified export';
 assert.equal((await repository.readWorkspace(subject.id)).paths[0].name,data.paths[0].name);
 assert.equal((await repository.deleteSubject(subject.id,-1)).code,'invalid_workspace');
 assert.equal((await repository.deleteSubject(subject.id,0)).code,'revision_conflict');
 assert.ok(await repository.findSession(token));
 assert.equal((await repository.deleteSubject(subject.id,1)).ok,true);
 assert.equal(await repository.findSession(token),null);
 assert.equal(await repository.readBootstrap(subject.id),null);
 assert.equal(await repository.readWorkspace(subject.id),null);
 assert.equal((await repository.writeWorkspace(subject.id,0,data,{idempotencyKey:'seed'})).code,'subject_not_found');
 assert.equal((await repository.deleteSubject(subject.id,1)).code,'subject_not_found');
 assert.ok(await repository.findSession(other.token));
 assert.deepEqual((await repository.readWorkspace(other.subject.id)),emptyWorkspace());
 return subject.id;
}
