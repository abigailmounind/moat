import {validWorkspace} from './workspace.js';
import {createGrowthProof} from './growth-proof.js';

const clone=value=>structuredClone(value);

export function planPlacement(data,plan){
 if(!Array.isArray(plan?.pathIds))return {ok:false,reason:'missing_path'};
 const paths=plan.pathIds.map(id=>data.paths.find(path=>path.id===id)).filter(Boolean);
 if(paths.length!==plan.pathIds.length)return {ok:false,reason:'missing_path'};
 if(!paths.length)return {ok:false,reason:'unassigned'};
 if(new Set(paths.map(path=>path.river)).size>1)return {ok:false,reason:'cross_river'};
 if(paths[0].river!==plan.river)return {ok:false,reason:'river_mismatch'};
 return {ok:true,path:paths[0],paths,shared:paths.length>1};
}

export function growthContext(data,record){
 const plan=data.plans.find(item=>item.id===record.planId);
 if(plan){const paths=data.paths.filter(path=>plan.pathIds.includes(path.id));if(paths.length)return paths.map(path=>({pathId:path.id,pathName:path.name,river:path.river}));}
 const path=data.paths.find(item=>item.id===record.pathId);
 if(path)return [{pathId:path.id,pathName:path.name,river:path.river}];
 if(record.context?.length)return record.context;
 return record.river?[{pathId:'',pathName:'未关联路径',river:record.river}]:[];
}

function preserveContexts(data){for(const record of data.growth??[])record.context=growthContext(data,record);}

export function upsertWorkspaceItem(data,kind,item){
 if(!['paths','plans','growth'].includes(kind))throw new Error('invalid_kind');
 const next=clone({...data,growth:data.growth??[]});preserveContexts(next);const index=next[kind].findIndex(value=>value.id===item.id);
 if(index<0)next[kind].push(clone(item));else next[kind][index]=clone(item);
 if(kind==='growth'){const saved=next.growth.find(record=>record.id===item.id);saved.context=growthContext(next,saved);}
 if(kind==='paths')for(const plan of next.plans)if(plan.pathIds.includes(item.id)){
  const rivers=new Set(plan.pathIds.map(id=>next.paths.find(path=>path.id===id)?.river));
  if(rivers.size===1)plan.river=item.river;
 }
 if(kind==='plans')for(const record of next.growth??[])if(record.planId===item.id&&record.milestoneId&&!item.milestones.some(milestone=>milestone.id===record.milestoneId))record.milestoneId='';
 return next;
}

export function deleteWorkspaceItem(data,kind,id){
 if(!['paths','plans','growth'].includes(kind))throw new Error('invalid_kind');
 const next=clone({...data,growth:data.growth??[]});preserveContexts(next);next[kind]=next[kind].filter(item=>item.id!==id);
 if(kind==='paths')for(const plan of next.plans)plan.pathIds=plan.pathIds.filter(pathId=>pathId!==id);
 if(kind==='plans')for(const record of next.growth??[])if(record.planId===id){record.planId='';record.milestoneId='';}
 return next;
}

export function validateWorkspaceMutation(current,kind,item,{creating=false}={}){
 if(!validWorkspace(current)||!['paths','plans'].includes(kind)||!item||typeof item.id!=='string'||!item.id)return {ok:false,code:'invalid_item'};
 const existing=current[kind].find(value=>value.id===item.id);
 if(creating&&existing)return {ok:false,code:'already_exists'};
 if(!creating&&!existing)return {ok:false,code:'not_found'};
 // Validate shape before operations dereference pathIds or milestones.
 const candidate={version:1,revision:0,paths:kind==='paths'?[item]:current.paths,plans:kind==='plans'?[item]:[],growth:[]};
 if(!validWorkspace(candidate))return {ok:false,code:'invalid_item'};
 if(kind==='paths'&&item.sourceDirectionId&&current.paths.some(path=>path.sourceDirectionId===item.sourceDirectionId&&path.id!==item.id))return {ok:false,code:'source_direction_conflict'};
 if(kind==='plans'){
  const placement=planPlacement(current,item);
  if(!placement.ok)return {ok:false,code:placement.reason};
  if(item.pathIds.length>1&&(!existing||JSON.stringify(existing.pathIds)!==JSON.stringify(item.pathIds)))return {ok:false,code:'multiple_paths_not_allowed'};
 }
 const workspace=upsertWorkspaceItem(current,kind,item);
 return validWorkspace(workspace)?{ok:true,workspace}:{ok:false,code:'invalid_item'};
}

export function applyWorkspaceMutation(current,mutation){
 const {kind,action,itemId,item}=mutation??{};
 if(kind==='workspace'&&action==='import'){
  if(mutation.confirmed!==true||!validWorkspace(mutation.workspace))return {ok:false,code:'invalid_import'};
  if(current.revision!==0||current.paths.length||current.plans.length||(current.growth??[]).length)return {ok:false,code:'import_requires_empty'};
  return {ok:true,workspace:clone({...mutation.workspace,revision:current.revision,growth:mutation.workspace.growth??[]})};
 }
 if(kind==='growth'&&['confirm-proof','revoke-proof'].includes(action)){
  const record=(current.growth??[]).find(value=>value.id===itemId);
  if(!record)return {ok:false,code:'not_found'};
  const next=clone(record);
  if(action==='revoke-proof')delete next.proof;
  else{
   if(mutation.confirmed!==true)return {ok:false,code:'confirmation_required'};
   const selection=mutation.selection;
   if(!selection||typeof selection!=='object'||Array.isArray(selection)||!['capital','river','explanation'].every(key=>selection[key]===undefined||(typeof selection[key]==='string'&&selection[key].length<=4000)))return {ok:false,code:'invalid_proof'};
   try{next.proof=createGrowthProof(record,selection);}catch{return {ok:false,code:'invalid_proof'};}
  }
  return {ok:true,workspace:upsertWorkspaceItem(current,'growth',next)};
 }
 if(!['paths','plans','growth'].includes(kind)||!['create','update','delete'].includes(action))return {ok:false,code:'invalid_item'};
 if(action==='delete'){
  if(!(current[kind]??[]).some(value=>value.id===itemId))return {ok:false,code:'not_found'};
  const workspace=deleteWorkspaceItem(current,kind,itemId);
  return validWorkspace(workspace)?{ok:true,workspace}:{ok:false,code:'invalid_item'};
 }
 if(action==='update'&&item?.id!==itemId)return {ok:false,code:'invalid_item'};
 if(action==='create'&&itemId)return {ok:false,code:'invalid_item'};
 if(kind==='growth')return saveGrowthRecord(current,item,{creating:action==='create'});
 return validateWorkspaceMutation(current,kind,item,{creating:action==='create'});
}

function saveGrowthRecord(current,item,{creating}){
 if(!item||typeof item.id!=='string'||!item.id)return {ok:false,code:'invalid_item'};
 const existing=(current.growth??[]).find(record=>record.id===item.id);
 if(creating&&existing)return {ok:false,code:'already_exists'};
 if(!creating&&!existing)return {ok:false,code:'not_found'};
 // Ordinary edits cannot introduce, replace or revoke a confirmed snapshot.
 if(Object.hasOwn(item,'proof')&&JSON.stringify(item.proof)!==JSON.stringify(existing?.proof))return {ok:false,code:'confirmation_required'};
 const fields=['id','name','date','type','action','result','reflection','source','planId','milestoneId'];
 if(!fields.every(key=>typeof item[key]==='string'))return {ok:false,code:'invalid_item'};
 if(!['action','result','reflection'].some(key=>item[key].trim()))return {ok:false,code:'invalid_item'};
 const next=Object.fromEntries(fields.map(key=>[key,item[key]]));
 const plan=current.plans.find(value=>value.id===next.planId),milestone=plan?.milestones.find(value=>value.id===next.milestoneId);
 if((next.planId&&!plan)||(next.milestoneId&&!milestone))return {ok:false,code:'invalid_item'};
 const samePlan=existing?.planId===next.planId;
 next.planName=plan?.name??(samePlan?existing?.planName??'':'');
 next.milestoneName=milestone?.name??(samePlan&&existing?.milestoneId===next.milestoneId?existing?.milestoneName??'':'');
 if(existing?.proof)next.proof=clone(existing.proof);
 if(samePlan&&existing?.context)next.context=clone(existing.context);
 const workspace=upsertWorkspaceItem(current,'growth',next);
 return validWorkspace(workspace)?{ok:true,workspace}:{ok:false,code:'invalid_item'};
}
