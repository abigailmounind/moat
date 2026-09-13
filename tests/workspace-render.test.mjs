import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_KEY,emptyWorkspace,newPath,newPlan} from '../frontend/src/workspace-model.js';

test('路径与计划页面按三河轴渲染空态',async()=>{
 for(const view of ['paths','plans']){
  const listeners={},app={innerHTML:'',addEventListener:(type,handler)=>{listeners[type]=handler;}},previous=Object.fromEntries(['document','window','location','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
   const path={...newPath(),name:'概览路径',river:'ability'},plan={...newPlan(),name:'概览计划',river:'ability',pathIds:[path.id],capitals:['human']},orphan={...newPlan(),name:'待归属计划',capitals:['human']},stored={...emptyWorkspace(),paths:[path],plans:view==='plans'?[plan,orphan]:[]};
   Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:selector=>selector==='#app'?app:{focus(){}}}});
   Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},confirm:()=>true}});
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search:`?view=${view}&item=${view==='plans'?plan.id:path.id}`}});
   Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key===WORKSPACE_KEY?JSON.stringify(stored):null}});
   await import(`../frontend/src/workspaces.js?axis=${view}`);
   assert.ok(app.innerHTML.includes('river-axis'));
   for(const river of ['生存之河','能力之河','热爱之河'])assert.ok(app.innerHTML.includes(river));
   assert.ok(listeners.click&&listeners.submit&&listeners.change);
   assert.ok(app.innerHTML.includes('river-tone-ability'));
   assert.ok(app.innerHTML.includes('workspace-river-meta'));
   assert.ok(app.innerHTML.includes('workspace-axis-node path-axis-node selected')||app.innerHTML.includes('workspace-axis-node plan-axis-node selected'));
   assert.ok(app.innerHTML.includes('＋ 新建'+(view==='plans'?'计划':'路径')));
   assert.ok(app.innerHTML.includes('data-collapse-detail'));
   assert.ok(app.innerHTML.includes('收起详情'));
   const click=(dataset={},attributes=[])=>listeners.click({target:{closest:()=>({tagName:'BUTTON',dataset,hasAttribute:name=>attributes.includes(name)})}});
   click({},['data-edit']);
   assert.ok(app.innerHTML.includes('data-save-overview'));
   assert.ok(app.innerHTML.includes('保存并查看概览'));
   if(view==='plans'){
    assert.ok(app.innerHTML.includes('name="river"'));
    assert.ok(!app.innerHTML.includes('workspace-locked-field'));
   }
   click({},['data-overview']);
   assert.ok(app.innerHTML.includes('workspace-layout is-overview'));
   assert.ok(!app.innerHTML.includes('workspace-paper'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node path-axis-node selected'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node plan-axis-node selected'));
   click({select:view==='plans'?plan.id:path.id});
   assert.ok(!app.innerHTML.includes('workspace-layout is-overview'));
   assert.ok(app.innerHTML.includes('workspace-paper'));
   click({},['data-collapse-detail']);
   assert.ok(app.innerHTML.includes('workspace-layout is-overview'));
   assert.ok(app.innerHTML.includes(view==='plans'?'workspace-axis-node plan-axis-node selected':'workspace-axis-node path-axis-node selected'));
   click({},['data-overview']);
   assert.ok(app.innerHTML.includes('workspace-layout is-overview'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node path-axis-node selected'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node plan-axis-node selected'));
   assert.equal((app.innerHTML.match(/aria-expanded="true"/g)??[]).length,view==='plans'?4:3);
   if(view==='plans'){
    assert.ok(!app.innerHTML.includes('这些旧计划没有唯一的同河路径'));
   }
  }finally{for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
 }
});

test('从主导航进入路径与计划时先显示无选中态概览',async()=>{
 for(const view of ['paths','plans']){
  const app={innerHTML:'',addEventListener(){}},previous=Object.fromEntries(['document','window','location','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
   const path={...newPath(),name:'默认概览路径',river:'ability'},plan={...newPlan(),name:'默认概览计划',river:'ability',pathIds:[path.id],capitals:['human']},stored={...emptyWorkspace(),paths:[path],plans:[plan]};
   Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:selector=>selector==='#app'?app:{focus(){}}}});
   Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},confirm:()=>true}});
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search:`?view=${view}`}});
   Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key===WORKSPACE_KEY?JSON.stringify(stored):null}});
   await import(`../frontend/src/workspaces.js?default-overview=${view}`);
   assert.ok(app.innerHTML.includes('workspace-layout is-overview'));
   assert.ok(!app.innerHTML.includes('workspace-paper'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node path-axis-node selected'));
   assert.ok(!app.innerHTML.includes('workspace-axis-node plan-axis-node selected'));
  }finally{for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
 }
});

test('计划新建入口在空工作区可见，已有路径时要求明确选择归属',async()=>{
 for(const withPath of [false,true]){
  const listeners={},app={innerHTML:'',addEventListener:(type,handler)=>{listeners[type]=handler;}},previous=Object.fromEntries(['document','window','location','localStorage'].map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  try{
   const path={...newPath(),name:'可选路径',river:'love'},stored={...emptyWorkspace(),paths:withPath?[path]:[]};
   Object.defineProperty(globalThis,'document',{configurable:true,value:{querySelector:selector=>selector==='#app'?app:{focus(){}}}});
   Object.defineProperty(globalThis,'window',{configurable:true,value:{addEventListener(){},confirm:()=>true}});
   Object.defineProperty(globalThis,'location',{configurable:true,value:{search:'?view=plans'}});
   Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>key===WORKSPACE_KEY?JSON.stringify(stored):null}});
   await import(`../frontend/src/workspaces.js?plan-entry=${withPath}`);
   assert.ok(app.innerHTML.includes('data-create-plan'));
   await listeners.click({target:{closest:()=>({tagName:'BUTTON',dataset:{},hasAttribute:name=>name==='data-create-plan'})}});
   if(withPath){
    assert.ok(app.innerHTML.includes('name="pathId"><option value="">请选择所属路径</option>'));
    assert.ok(app.innerHTML.includes(`value="${path.id}" >可选路径`));
    assert.ok(app.innerHTML.includes('value="love" selected'));
   }else{
    assert.ok(app.innerHTML.includes('先为计划建立一条路径'));
    assert.ok(app.innerHTML.includes('/?view=paths&river=love&new=1'));
    assert.ok(!app.innerHTML.includes('id="workspace-form"'));
   }
  }finally{for(const [key,value] of Object.entries(previous))if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}
 }
});
