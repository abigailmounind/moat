import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkspace,newPath,newPlan,newGrowth,planPlacement,upsertItem,deleteItem,growthContext,saveWorkspaceItem,WORKSPACE_KEY,validWorkspace} from '../frontend/src/workspace-model.js';
const setup=()=>{const p={...newPath(),name:'原路径'},q={...newPath(),name:'同河路径'},plan={...newPlan(),name:'计划',pathIds:[p.id],capitals:['human']},g={...newGrowth(),name:'成果',planId:plan.id,planName:plan.name};return {p,q,plan,g,data:{...emptyWorkspace(),paths:[p,q],plans:[plan],growth:[g]}};};
test('moving a path updates its plan, while deleting keeps growth grouping context',()=>{
 const {data,p,plan,g}=setup();const moved=upsertItem(data,'paths',{...p,river:'love'});
 assert.equal(moved.plans[0].river,'love');assert.ok(planPlacement(moved,moved.plans[0]).ok);
 const deleted=deleteItem(moved,'plans',plan.id);
 assert.equal(deleted.growth[0].planId,'');assert.deepEqual(growthContext(deleted,deleted.growth[0]),[{pathId:p.id,pathName:p.name,river:'love'}]);
 const pathDeleted=deleteItem(data,'paths',p.id);assert.equal(growthContext(pathDeleted,pathDeleted.growth[0])[0].pathName,p.name);
 assert.equal(g.planId,plan.id);assert.ok(validWorkspace(deleted));
 assert.equal(validWorkspace({...deleted,growth:[{...deleted.growth[0],context:[{river:'fourth'}]}]}),false);
});
test('legacy same-river shared plans remain editable; new shared plans are rejected',()=>{
 const {data,p,q,plan}=setup();data.plans[0].pathIds=[p.id,q.id];let raw=JSON.stringify(data);
 const storage={getItem:()=>raw,setItem:(key,value)=>{assert.equal(key,WORKSPACE_KEY);raw=value;}};
 assert.equal(planPlacement(data,data.plans[0]).shared,true);
 assert.equal(saveWorkspaceItem(storage,data,'plans',{...data.plans[0],notes:'保留关联'}).ok,true);
 const latest=JSON.parse(raw);assert.deepEqual(latest.plans[0].pathIds,[p.id,q.id]);
 assert.equal(saveWorkspaceItem(storage,latest,'plans',{...plan,id:'new',pathIds:[p.id,q.id]}).ok,false);
});
