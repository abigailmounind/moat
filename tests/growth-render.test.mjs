import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_KEY,emptyWorkspace,newGrowth} from '../frontend/src/workspace-model.js';
import {CONNECTION_KEY} from '../frontend/src/workspace-connection.js';

test('成长页可加载，并按当前连接状态读取本地或服务器记录',async()=>{
 const previous=Object.fromEntries(['document','window','location','localStorage'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 const local={...emptyWorkspace(),growth:[{...newGrowth(),name:'本地专属记录'}]};
 const remote={...emptyWorkspace(),growth:[{...newGrowth(),name:'服务器专属记录'}]};
 try{
  for(const enabled of [false,true]){
   const app={innerHTML:'',addEventListener(){}};
   const values=new Map([[WORKSPACE_KEY,JSON.stringify(local)],[CONNECTION_KEY,JSON.stringify({kind:'server_workspace',version:1,enabled,subjectId:'growth-render-subject',cache:remote})]]);
   Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:selector=>selector==='#app'?app:{focus(){}}}});
   Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){}}});
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search:'?view=growth'}});
   Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>values.get(key)??null}});
   await import(`../frontend/src/growth.js?render-source=${enabled}`);
   assert.ok(app.innerHTML.includes('<h1>成长记录</h1>'));
   assert.ok(app.innerHTML.includes(enabled?'服务器专属记录':'本地专属记录'));
   assert.ok(!app.innerHTML.includes(enabled?'本地专属记录':'服务器专属记录'));
  }
 }finally{
  for(const [key,descriptor] of Object.entries(previous)){
   if(descriptor)Object.defineProperty(globalThis,key,descriptor);
   else delete globalThis[key];
  }
 }
});
