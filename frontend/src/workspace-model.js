import {riverNames,capitalNames,statusNames,growthTypes,emptyWorkspace,validDate,validWorkspace} from '../../shared/workspace.js';
import {planPlacement,growthContext,upsertWorkspaceItem,deleteWorkspaceItem} from '../../shared/workspace-operations.js';
export {riverNames,capitalNames,statusNames,growthTypes,emptyWorkspace,validDate,validWorkspace} from '../../shared/workspace.js';
export {planPlacement,growthContext} from '../../shared/workspace-operations.js';
export const WORKSPACE_KEY='personal-moat:workspaces:v1';
export const newId=()=>crypto.randomUUID();
export function newPath(){return {id:newId(),name:'',river:'ability',status:'exploring',goal:'',support:'',gap:'',constraints:'',nextAction:'',notes:''};}
export function newPlan(){return {id:newId(),name:'',river:'ability',status:'active',goal:'',capitals:[],pathIds:[],milestones:[],notes:''};}
export function newMilestone(){return {id:newId(),name:'',criterion:'',actions:[],done:false};}
export function newGrowth(){const now=new Date();return {id:newId(),name:'',date:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,type:'action',action:'',result:'',reflection:'',source:'',planId:'',milestoneId:'',planName:'',milestoneName:''};}
export function readWorkspace(storage){
 try{if(!storage)return {ok:false,error:'当前浏览器无法使用本地保存。',data:emptyWorkspace()};const raw=storage.getItem(WORKSPACE_KEY);if(raw===null)return {ok:true,data:emptyWorkspace()};const data=JSON.parse(raw);if(!validWorkspace(data))throw new Error();return {ok:true,data:{...data,growth:data.growth??[]}};}
 catch{return {ok:false,error:'本地工作区暂时无法读取，原有数据已保留。',data:emptyWorkspace()};}
}
// Write only this workspace key; refuse stale tabs and invalid stored versions.
export function commitWorkspace(storage,current,next){
 const loaded=readWorkspace(storage);if(!loaded.ok)return loaded;
 if(loaded.data.revision!==current.revision)return {ok:false,error:'另一个页面已修改工作区。请保留当前文字，刷新后再编辑。'};
 const data={...next,revision:current.revision+1};
 if(!validWorkspace(data))return {ok:false,error:'请填写名称，并检查资本选择和里程碑内容。'};
 try{storage.setItem(WORKSPACE_KEY,JSON.stringify(data));return {ok:true,data};}
 catch{return {ok:false,error:'保存没有成功，当前编辑仍在。可以再次保存。'};}
}
export function upsertItem(data,kind,item){
 return upsertWorkspaceItem(data,kind,item);
}
export function saveWorkspaceItem(storage,base,kind,item){
 const latest=readWorkspace(storage);if(!latest.ok)return latest;
 if(kind==='paths'&&item.sourceDirectionId&&latest.data.paths.some(p=>p.sourceDirectionId===item.sourceDirectionId&&p.id!==item.id))return {ok:false,error:'这条方向已在另一个页面建立路径。请保留当前文字，打开已有路径继续编辑。'};
 const before=base[kind].find(x=>x.id===item.id),now=latest.data[kind].find(x=>x.id===item.id);
 if(JSON.stringify(before)!==JSON.stringify(now))return {ok:false,error:'这条内容已在其他页面修改或删除。当前草稿仍在，请核对后再保存。'};
 if(kind==='plans'&&item.pathIds.some(id=>!latest.data.paths.some(p=>p.id===id)))return {ok:false,error:'关联路径已被其他页面删除，请重新选择关联路径。'};
 if(kind==='plans'&&(!planPlacement(latest.data,item).ok||(item.pathIds.length>1&&(!before||JSON.stringify(before.pathIds)!==JSON.stringify(item.pathIds)))))return {ok:false,error:'请选择一条未来路径。计划会继承该路径所属的河流。'};
 if(kind==='growth'&&item.planId&&!latest.data.plans.some(p=>p.id===item.planId&&(!item.milestoneId||p.milestones.some(m=>m.id===item.milestoneId))))return {ok:false,error:'关联计划或里程碑已被其他页面移除，请重新选择。'};
 return commitWorkspace(storage,latest.data,upsertItem(latest.data,kind,item));
}
export function deleteItem(data,kind,id){
 return deleteWorkspaceItem(data,kind,id);
}
