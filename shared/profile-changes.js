import {validatePrototypeProfile} from './profile.js';

const idPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const targets={add_evidence:'evidence',link_capital:'capitalLinks',link_river:'riverLinks',keep_unknown:'unknowns',save_direction:'directions'};
const scopeKeys=new Set(Object.values(targets));
const isRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const validIds=value=>Array.isArray(value)&&value.length<=100&&new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&idPattern.test(id));

export function validateProfileChangeSet(changeSet){
 if(!isRecord(changeSet)||typeof changeSet.id!=='string'||!idPattern.test(changeSet.id)||typeof changeSet.sessionId!=='string'||!changeSet.sessionId.trim()||changeSet.sessionId.length>100||!isRecord(changeSet.scope)||!Array.isArray(changeSet.operations)||changeSet.operations.length>250)return false;
 if(Object.keys(changeSet.scope).some(key=>!scopeKeys.has(key))||Object.values(changeSet.scope).some(value=>!validIds(value)))return false;
 const operationIds=new Set();
 for(const operation of changeSet.operations){
  if(!isRecord(operation)||!Object.hasOwn(targets,operation.type)||typeof operation.entityId!=='string'||!idPattern.test(operation.entityId)||operationIds.has(operation.entityId)||!isRecord(operation.payload)||operation.payload.id!==operation.entityId)return false;
  const target=targets[operation.type];
  if(!changeSet.scope[target]?.includes(operation.entityId))return false;
  operationIds.add(operation.entityId);
 }
 return true;
}

export function applyProfileChangeSet(profile,changeSet,{fail=false}={}){
 if(fail)return {ok:false,code:'profile_commit_failed',error:'prototype_commit_failed',profile};
 if(!validatePrototypeProfile(profile)||!validateProfileChangeSet(changeSet))return {ok:false,code:'invalid_profile_change',error:'invalid_map_change',profile};
 const next=structuredClone(profile);next.directions??={};
 for(const [target,ids] of Object.entries(changeSet.scope))for(const id of ids)delete next[target][id];
 for(const operation of changeSet.operations)next[targets[operation.type]][operation.entityId]=structuredClone(operation.payload);
 if(!validatePrototypeProfile(next))return {ok:false,code:'invalid_profile_change',error:'invalid_map_change',profile};
 const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
 if(['evidence','capitalLinks','riverLinks','unknowns','directions'].every(key=>canonical(next[key]??{})===canonical(profile[key]??{})))return {ok:true,duplicate:true,profile};
 if(!next.appliedChangeSets.includes(changeSet.id))next.appliedChangeSets.push(changeSet.id);
 return {ok:true,duplicate:false,profile:next};
}
