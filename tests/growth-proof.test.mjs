import test from 'node:test';
import assert from 'node:assert/strict';
import {createGrowthProof,profileWithGrowth,growthEvidenceId} from '../frontend/src/growth-proof.js';
import {createPrototypeProfile} from '../frontend/src/exploration-domain.js';
import {newGrowth,newPlan,newMilestone,emptyWorkspace,saveWorkspaceItem,readWorkspace,deleteItem,commitWorkspace,validWorkspace} from '../frontend/src/workspace-model.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const record=()=>({...newGrowth(),name:'访谈总结',action:'完成三次访谈并整理',result:'形成问题清单',source:'我的访谈笔记'});
test('成果经确认才进入地图，重复提交唯一，更新前保持快照',()=>{
 const storage=memory(),r=record();let data=saveWorkspaceItem(storage,emptyWorkspace(),'growth',r).data;
 const exploration=createPrototypeProfile();assert.equal(Object.keys(profileWithGrowth(exploration,data).evidence).length,0);
 let item={...r,proof:createGrowthProof(r,{capital:'human',river:'ability',explanation:'整理方法已形成可复用记录'})};
 data=saveWorkspaceItem(storage,data,'growth',item).data;
 data=saveWorkspaceItem(storage,data,'growth',item).data;
 let map=profileWithGrowth(exploration,readWorkspace(storage).data);assert.equal(Object.keys(map.evidence).length,1);assert.equal(Object.keys(map.riverLinks).length,1);
 item={...item,result:'修改后的新成果'};data=saveWorkspaceItem(storage,data,'growth',item).data;
 assert.equal(profileWithGrowth(exploration,data).evidence[growthEvidenceId(r.id)].result,r.result);
 item.proof=createGrowthProof(item);data=saveWorkspaceItem(storage,data,'growth',item).data;
 map=profileWithGrowth(exploration,data);assert.equal(map.evidence[growthEvidenceId(r.id)].result,item.result);assert.equal(Object.keys(map.capitalLinks).length,0);
 assert.deepEqual(exploration,createPrototypeProfile());
});
test('撤回、删除记录均移除地图证明；删除计划保留已确认快照',()=>{
 const p={...newPlan(),name:'访谈练习',capitals:['human'],milestones:[{...newMilestone(),name:'完成初访'}]};
 const r={...record(),planId:p.id,planName:p.name,milestoneId:p.milestones[0].id,milestoneName:p.milestones[0].name};r.proof=createGrowthProof(r);
 const data={...emptyWorkspace(),plans:[p],growth:[r]};assert.ok(validWorkspace(data));
 const removed=deleteItem(data,'plans',p.id);assert.ok(validWorkspace(removed));assert.equal(removed.growth[0].planId,'');assert.ok(removed.growth[0].proof);
 assert.equal(Object.keys(profileWithGrowth(createPrototypeProfile(),deleteItem(data,'growth',r.id)).evidence).length,0);
 const storage=memory();let saved=commitWorkspace(storage,emptyWorkspace(),data).data;const item={...r};delete item.proof;saved=saveWorkspaceItem(storage,saved,'growth',item).data;
 assert.equal(saved.growth.length,1);assert.equal(Object.keys(profileWithGrowth(createPrototypeProfile(),saved).evidence).length,0);
});
test('拒绝缺少行动成果、无解释关联和非法河流',()=>{
 assert.throws(()=>createGrowthProof({...record(),action:''}));assert.throws(()=>createGrowthProof({...record(),result:''}));assert.throws(()=>createGrowthProof(record(),{river:'ability'}));assert.throws(()=>createGrowthProof(record(),{river:'fourth',explanation:'测试'}));
});
test('写入失败不出现证明，陈旧确认不得恢复已撤回或删除记录',()=>{
 const storage=memory(),r=record();const data=saveWorkspaceItem(storage,emptyWorkspace(),'growth',r).data,item={...r,proof:createGrowthProof(r)};
 const failed={getItem:storage.getItem,setItem(){throw new Error('quota');}};
 assert.equal(saveWorkspaceItem(failed,data,'growth',item).ok,false);assert.equal(readWorkspace(storage).data.growth[0].proof,undefined);
 const published=saveWorkspaceItem(storage,data,'growth',item).data;
 const revoked=saveWorkspaceItem(storage,published,'growth',r).data;
 assert.equal(saveWorkspaceItem(storage,published,'growth',item).ok,false);
 commitWorkspace(storage,revoked,deleteItem(revoked,'growth',r.id));assert.equal(saveWorkspaceItem(storage,revoked,'growth',item).ok,false);
});
