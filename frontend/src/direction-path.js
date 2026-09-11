import {newPath} from './workspace-model.js';

export function prepareDirectionPath(workspace,direction){
 if(!direction||!['confirmed','modified'].includes(direction.confirmation_status)||!['survival','ability','love'].includes(direction.river))return null;
 const existing=workspace.paths.find(p=>p.sourceDirectionId===direction.id);
 if(existing)return {existing:true,path:structuredClone(existing)};
 return {existing:false,path:{...newPath(),name:direction.name.slice(0,120),river:direction.river,goal:direction.name,support:direction.support,gap:direction.unknown,nextAction:direction.next_action,sourceDirectionId:direction.id}};
}
