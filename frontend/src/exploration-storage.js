import {createPrototypeProfile,validatePrototypeProfile,applyMapChangeSet} from './exploration-domain.js';

export const storageKey='personal-moat:exploration-profile:v1';
export function browserStorage(){try{return globalThis.localStorage;}catch{return null;}}
const version=1;
const validProfile=value=>validatePrototypeProfile(value);

export function loadExplorationProfile(storage){
 try{
  const raw=storage?.getItem(storageKey);if(!raw)return {ok:true,profile:createPrototypeProfile(),found:false};
  const envelope=JSON.parse(raw);
  if(envelope.version!==version||envelope.kind!=='user_local'||!validProfile(envelope.profile))throw new Error('unsupported_local_profile');
  return {ok:true,profile:envelope.profile,found:true};
 }catch{return {ok:false,profile:createPrototypeProfile(),found:false,error:'local_profile_unavailable'};}
}

export function saveExplorationProfile(storage,profile){
 try{
  if(!validProfile(profile))return {ok:false,profile,error:'invalid_local_profile'};
  const envelope={version,kind:'user_local',savedAt:new Date().toISOString(),profile};
  storage.setItem(storageKey,JSON.stringify(envelope));
  return {ok:true,profile};
 }catch{return {ok:false,profile,error:'local_save_failed'};}
}

export function removeLocalEvidence(profile,evidenceId){
 const next=structuredClone(profile);delete next.evidence[evidenceId];
 for(const [id,link] of Object.entries(next.capitalLinks))if(link.evidence_id===evidenceId)delete next.capitalLinks[id];
 for(const [id,link] of Object.entries(next.riverLinks))if(link.evidence_id===evidenceId)delete next.riverLinks[id];
 next.appliedChangeSets=[];
 return next;
}
// Merge other sessions, but refuse to resurrect an item changed/deleted elsewhere.
export function commitExplorationChange(storage,base,changeSet){
 const loaded=loadExplorationProfile(storage);if(!loaded.ok)return loaded;
 for(const [key,ids] of Object.entries(changeSet.scope??{}))for(const id of ids)
  if(JSON.stringify(base[key]?.[id])!==JSON.stringify(loaded.profile[key]?.[id]))return {ok:false,error:'local_conflict',profile:base};
 const result=applyMapChangeSet(loaded.profile,changeSet);
 return result.ok?saveExplorationProfile(storage,result.profile):result;
}
