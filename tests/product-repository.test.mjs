import test from 'node:test';
import assert from 'node:assert/strict';
import {createMemoryProductRepository,idempotencyPolicy} from '../backend/product-repository.mjs';
import {emptyWorkspace} from '../shared/workspace.js';

const reversed=value=>Array.isArray(value)?value.map(reversed):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).reverse().map(([key,item])=>[key,reversed(item)])):value;
const setup=options=>{
 const repository=createMemoryProductRepository(options),{subject}=repository.createAnonymousSession();
 const workspace={...emptyWorkspace(),paths:[{id:'path-1',name:'验证路径',river:'ability',status:'exploring',goal:'练习',notes:'',support:'',gap:'',constraints:'',nextAction:''}]};
 const write=(revision,data=workspace,key='save-1')=>repository.writeWorkspace(subject.id,revision,data,{idempotencyKey:key});
 return {repository,subject,workspace,write};
};

test('idempotent retries replay the original response without reverting later edits',()=>{
 const {repository,subject,workspace,write}=setup();
 const first=write(0);
 assert.equal(first.ok,true);assert.equal(first.workspace.revision,1);assert.equal(first.replayed,false);
 const later=structuredClone(first.workspace);later.paths[0].notes='后来的编辑';
 assert.equal(write(1,later,'save-2').workspace.revision,2);
 const replay=write(0,reversed(workspace));
 assert.deepEqual(replay.workspace,first.workspace);assert.equal(replay.replayed,true);
 assert.equal(repository.readWorkspace(subject.id).paths[0].notes,'后来的编辑');
 assert.equal(repository.readWorkspace(subject.id).revision,2);
});

test('key conflicts preserve data, while failed validation and revision checks do not consume keys',()=>{
 const {repository,subject,workspace,write}=setup();
 assert.equal(write(0,{...workspace,paths:[null]}).code,'invalid_workspace');
 assert.equal(write(1,{...workspace,revision:1}).code,'revision_conflict');
 const first=write(0);assert.equal(first.ok,true);
 assert.equal(write(0,{...workspace,paths:[]}).code,'idempotency_conflict');
 assert.equal(write(1,first.workspace).code,'idempotency_conflict');
 assert.deepEqual(repository.readWorkspace(subject.id),first.workspace);
});

test('receipts are isolated by subject, including equal keys with different data',()=>{
 const {repository,subject,workspace,write}=setup();
 const other=repository.createAnonymousSession();
 assert.equal(write(0).ok,true);
 assert.equal(repository.writeWorkspace(other.subject.id,0,emptyWorkspace(),{idempotencyKey:'save-1'}).ok,true);
 assert.equal(repository.readWorkspace(other.subject.id).paths.length,0);
 assert.equal(repository.readWorkspace(subject.id).paths.length,1);
 assert.equal(repository.writeWorkspace('missing',0,workspace,{idempotencyKey:'save-1'}).code,'subject_not_found');
});

test('retention is bounded without evicting live retry guarantees',()=>{
 let time=0;
 const {repository,subject,workspace,write}=setup({now:()=>time,maxKeysPerSubject:1});
 const first=write(0);
 assert.equal(write(1,first.workspace,'save-2').code,'idempotency_capacity');
 assert.equal(write(0).replayed,true);
 assert.equal(repository.readWorkspace(subject.id).revision,1);
 time=idempotencyPolicy.retentionSeconds*1000;
 assert.equal(write(0).code,'revision_conflict');
 assert.equal(write(1,first.workspace,'save-2').ok,true);
 assert.deepEqual(workspace.revision,0);
});

test('request, read, response and receipt snapshots cannot mutate stored state',()=>{
 const {repository,subject,workspace,write}=setup();
 const original=structuredClone(workspace),first=write(0);
 workspace.paths[0].name='修改输入';first.workspace.paths[0].name='修改响应';
 repository.readBootstrap(subject.id).workspace.paths[0].name='修改启动数据';
 repository.readWorkspace(subject.id).paths[0].name='修改读取值';
 const retry=write(0,original);retry.workspace.paths[0].name='修改重放值';
 assert.equal(write(0,original).workspace.paths[0].name,'验证路径');
 assert.equal(repository.readWorkspace(subject.id).paths[0].name,'验证路径');
});

test('version overflow and malformed keys never modify the workspace',()=>{
 const {repository,subject,workspace,write}=setup();
 for(const key of ['', 'a b','中文', 'x'.repeat(129),['key'],null])assert.equal(write(0,workspace,key).code,'invalid_idempotency_key');
 assert.equal(write(Number.MAX_SAFE_INTEGER,{...workspace,revision:Number.MAX_SAFE_INTEGER}).code,'invalid_workspace');
 assert.equal(repository.readWorkspace(subject.id).revision,0);
});
