import assert from 'node:assert/strict';
import {emptyWorkspace} from '../../shared/workspace.js';
import {pathItem} from './product-workspace.mjs';

export async function checkSessionRevocation(repository){
 const first=await repository.createAnonymousSession(),other=await repository.createAnonymousSession();
 const workspace={...emptyWorkspace(),paths:[pathItem()]};
 const saved=await repository.writeWorkspace(first.subject.id,0,workspace,{idempotencyKey:'before-logout'});
 assert.equal(saved.ok,true);
 assert.equal((await repository.revokeSession(first.token)).ok,true);
 assert.equal(await repository.findSession(first.token),null);
 assert.deepEqual(await repository.readWorkspace(first.subject.id),saved.workspace);
 assert.equal((await repository.writeWorkspace(first.subject.id,0,workspace,{idempotencyKey:'before-logout'})).replayed,true);
 assert.ok(await repository.findSession(other.token));
 for(const token of [first.token,'missing','',null])assert.equal((await repository.revokeSession(token)).ok,true);
 assert.ok(await repository.findSession(other.token));
 const next=await repository.createAnonymousSession();
 assert.notEqual(next.subject.id,first.subject.id);
 assert.deepEqual(await repository.readWorkspace(next.subject.id),emptyWorkspace());
 return first;
}
