import test from 'node:test';
import assert from 'node:assert/strict';
import {WORKSPACE_KEY,newPath,newPlan,newMilestone,newId,emptyWorkspace,readWorkspace,commitWorkspace,upsertItem,deleteItem,validWorkspace,saveWorkspaceItem,planPlacement} from '../frontend/src/workspace-model.js';
function memory(){const map=new Map();return {map,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
const path=()=>({...newPath(),name:'探索表达',support:'项目复盘',nextAction:'写一份清楚的总结'});
const plan=paths=>({...newPlan(),name:'持续表达练习',capitals:['human','psychological'],pathIds:paths.map(p=>p.id),milestones:[{...newMilestone(),name:'整理第一篇复盘',criterion:'可独立阅读',actions:[{id:newId(),text:'整理提纲',done:false}]}]});
test('两条路径与一个多路径计划可保存、刷新读取；编辑保留身份',()=>{
 const storage=memory(),a=path(),b={...path(),name:'研究方向'},p=plan([a,b]);let data=emptyWorkspace();
 for(const [kind,item] of [['paths',a],['paths',b],['plans',p]]){const result=commitWorkspace(storage,data,upsertItem(data,kind,item));assert.equal(result.ok,true);data=result.data;}
 const loaded=readWorkspace(storage).data;assert.equal(loaded.paths.length,2);assert.deepEqual(loaded.plans[0].pathIds,[a.id,b.id]);
 const updated=commitWorkspace(storage,loaded,upsertItem(loaded,'paths',{...a,notes:'保留我自己的表达'}));assert.equal(updated.ok,true);assert.equal(updated.data.paths.length,2);assert.equal(readWorkspace(storage).data.paths[0].notes,'保留我自己的表达');
});
test('删除路径仅解除计划关联；删除计划不影响其他路径',()=>{
 const a=path(),b=path(),p=plan([a,b]),data={...emptyWorkspace(),paths:[a,b],plans:[p]};
 const next=deleteItem(data,'paths',a.id);assert.deepEqual(next.plans[0].pathIds,[b.id]);assert.deepEqual(next.plans[0].milestones,p.milestones);assert.equal(data.paths.length,2);
 assert.equal(deleteItem(next,'plans',p.id).paths.length,1);
});
test('独立资本计划可以保存，行动完成不会改变路径或新增地图字段',()=>{
 const storage=memory(),p=plan([]),base={...emptyWorkspace(),plans:[p]};p.milestones[0].actions[0].done=true;
 const result=commitWorkspace(storage,emptyWorkspace(),base);assert.equal(result.ok,true);const loaded=readWorkspace(storage).data;assert.equal(loaded.plans[0].milestones[0].actions[0].done,true);assert.deepEqual(loaded.paths,[]);assert.equal('evidence' in loaded,false);
});
test('存储满时失败保持已保存内容，重试可成功',()=>{
 const storage=memory(),base=emptyWorkspace(),next=upsertItem(base,'paths',path());const failed={getItem:storage.getItem,setItem(){throw new Error('quota');}};
 assert.equal(commitWorkspace(failed,base,next).ok,false);assert.deepEqual(readWorkspace(storage).data,base);assert.equal(commitWorkspace(storage,base,next).ok,true);
});
test('旧版和损坏数据拒绝覆盖，其他存储不受影响',()=>{
 const storage=memory();storage.setItem('personal-moat:exploration-profile:v1','existing');
 for(const raw of ['broken','{"version":0}',JSON.stringify({...emptyWorkspace(),plans:[null]})]){storage.setItem(WORKSPACE_KEY,raw);assert.equal(readWorkspace(storage).ok,false);assert.equal(commitWorkspace(storage,emptyWorkspace(),upsertItem(emptyWorkspace(),'paths',path())).ok,false);assert.equal(storage.getItem(WORKSPACE_KEY),raw);}
 assert.equal(storage.getItem('personal-moat:exploration-profile:v1'),'existing');
});
test('陈旧页面拒绝覆盖较新版本',()=>{
 const storage=memory(),old=emptyWorkspace();assert.equal(commitWorkspace(storage,old,upsertItem(old,'paths',path())).ok,true);assert.equal(commitWorkspace(storage,old,upsertItem(old,'paths',path())).ok,false);assert.equal(readWorkspace(storage).data.paths.length,1);
});
test('拒绝无资本计划、悬空路径、第四条河与重复记录',()=>{
 const a=path();assert.equal(validWorkspace({...emptyWorkspace(),paths:[a,a]}),false);assert.equal(validWorkspace({...emptyWorkspace(),paths:[{...a,river:'fourth'}]}),false);
 const p=plan([]);assert.equal(validWorkspace({...emptyWorkspace(),plans:[{...p,capitals:[]}]}),false);assert.equal(validWorkspace({...emptyWorkspace(),plans:[{...p,pathIds:['missing']}]}),false);
});
test('新计划只属于一条路径并继承河流；旧错位计划仍可读取后修正',()=>{
 const storage=memory(),a=path(),b={...path(),river:'love',name:'热爱路径'};let base=commitWorkspace(storage,emptyWorkspace(),{...emptyWorkspace(),paths:[a,b]}).data;
 assert.equal(saveWorkspaceItem(storage,base,'plans',{...plan([a]),river:'love'}).ok,false);
 assert.equal(saveWorkspaceItem(storage,base,'plans',plan([a,b])).ok,false);
 const correct={...plan([a]),river:a.river};assert.equal(planPlacement(base,correct).ok,true);
 const saved=saveWorkspaceItem(storage,base,'plans',correct);assert.equal(saved.ok,true);assert.deepEqual(saved.data.plans[0].pathIds,[a.id]);
});
