import test from 'node:test';
import assert from 'node:assert/strict';
import {workspaceConnection as connection} from '../frontend/src/workspace-connection.js';
import {explorationProfileConnection as profileConnection} from '../frontend/src/exploration-connection.js';
import {emptyWorkspace} from '../shared/workspace.js';
import {createPrototypeProfile} from '../shared/profile.js';

test('同步页面先预览再确认，取消不提交，失败保留入口，重试期间拒绝重复操作',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),original={...connection},originalProfile={...profileConnection};
 let handler,calls=0,release;
 const app={innerHTML:'',setAttribute(){},querySelectorAll:()=>[],addEventListener:(name,fn)=>{handler=fn;}};
 const click=action=>handler({target:{closest:()=>({dataset:{action}})}});
 try{
  Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>app}});
  connection.status=()=>({ok:true,state:null});
  profileConnection.status=()=>({ok:true,state:null});
  profileConnection.preview=async()=>({ok:true,subjectId:'synthetic',profile:createPrototypeProfile(),revision:0,local:{ok:true,profile:createPrototypeProfile()}});
  profileConnection.enable=async(value,options)=>{calls++;assert.equal(value.subjectId,'synthetic');assert.equal(options.importLocal,true);return {ok:true,profile:createPrototypeProfile(),revision:0};};
  connection.preview=async()=>({ok:true,subjectId:'synthetic',workspace:emptyWorkspace(),local:{ok:true,data:emptyWorkspace()}});
  connection.enable=async(value,options)=>{calls++;assert.equal(value.subjectId,'synthetic');assert.equal(options.importLocal,true);return {ok:false,error:'合成保存失败'};};
  await import('../frontend/src/sync.js?test');
  assert.ok(!app.innerHTML.includes('data-action="import"'));
  await click('preview');assert.ok(app.innerHTML.includes('data-action="import"'));assert.equal(calls,0);
  await click('cancel');assert.equal(calls,0);assert.ok(!app.innerHTML.includes('data-action="import"'));
  await click('preview');await click('import');assert.equal(calls,1);assert.ok(app.innerHTML.includes('合成保存失败'));assert.ok(app.innerHTML.includes('data-action="preview"'));
  await click('profile-preview');assert.ok(app.innerHTML.includes('data-action="profile-import"'));
  await click('profile-import');assert.equal(calls,2);assert.ok(app.innerHTML.includes('服务器探索档案已核对并保存'));
  connection.status=()=>({ok:true,state:{enabled:true,pending:{}}});
  await click('preview');await click('cancel');
  connection.retry=()=>{calls++;return new Promise(resolve=>{release=resolve;});};
  const pending=click('retry');await click('retry');assert.equal(calls,3);
  release({ok:true});await pending;
 }finally{
  Object.assign(connection,original);Object.assign(profileConnection,originalProfile);
  if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;
 }
});

test('删除入口在导出之后出现，取消不删除，失败不能显示删除成功',async()=>{
 const previous=Object.getOwnPropertyDescriptor(globalThis,'document'),original={...connection};let handler,deleted=0,downloads=0;
 const app={innerHTML:'',setAttribute(){},querySelectorAll:()=>[],addEventListener:(name,fn)=>{handler=fn;}};
 const click=action=>handler({target:{closest:()=>({dataset:{action}})}});
 try{
  Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:()=>app,body:{append(){}},createElement:()=>({click(){downloads++;},remove(){}})}});
  connection.status=()=>({ok:true,state:{enabled:true}});
  connection.exportData=async()=>({ok:true,snapshot:{subject:{id:'synthetic'},data:{workspace:emptyWorkspace()}}});
  connection.deleteData=async()=>{deleted++;return {ok:false,error:'删除结果待核对'};};
  await import('../frontend/src/sync.js?deletion-test');
  assert.ok(!app.innerHTML.includes('data-action="delete"'));
  await click('export');assert.equal(downloads,1);assert.ok(app.innerHTML.includes('data-action="delete"'));
  await click('cancel-delete');assert.equal(deleted,0);assert.ok(!app.innerHTML.includes('data-action="delete"'));
  await click('export');await click('delete');assert.equal(deleted,1);
  assert.ok(app.innerHTML.includes('删除结果待核对'));assert.ok(!app.innerHTML.includes('服务端已确认删除'));
 }finally{Object.assign(connection,original);if(previous)Object.defineProperty(globalThis,'document',previous);else delete globalThis.document;}
});
