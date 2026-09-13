import {createPrototypeProfile,validatePrototypeProfile} from '../../shared/profile.js';
import {applyProfileChangeSet} from '../../shared/profile-changes.js';
import {browserStorage,loadExplorationProfile,commitExplorationChange} from './exploration-storage.js';

export const PROFILE_CONNECTION_KEY='personal-moat:server-profile:v1';
const copy=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const same=(a,b)=>canonical(a)===canonical(b);
const errorText={lock_unavailable:'当前浏览器无法协调多个页面的服务器保存。已有内容和待提交记录仍保留。',revision_conflict:'服务器档案已有更新。当前确认内容已保留，请到“数据与同步”核对。',session_required:'服务器会话已失效。当前确认内容仍保留，请重新核对连接。',subject_changed:'服务器会话与此档案连接不一致，已停止提交。',not_durable:'服务器暂未启用持久保存，请继续使用浏览器档案。',local_changed:'档案已在其他页面更新，请保留当前内容并重新核对。',pending:'有一笔档案提交尚未核对，请先重试。',cache_failed:'本机档案缓存未能保存，当前内容仍保留。',network:'暂时无法连接服务器，当前内容和重试记录仍保留。',invalid_response:'服务器返回的档案无法读取，原有内容已保留。'};

export function createExplorationProfileConnection({storage=browserStorage,fetcher=(...args)=>globalThis.fetch(...args),newKey=()=>crypto.randomUUID(),locks=()=>globalThis.navigator?.locks}={}){
 let issue='',queue=Promise.resolve();
 const store=()=>typeof storage==='function'?storage():storage;
 const failure=error=>({ok:false,code:error.message,error:errorText[error.message]||error.messageText||'档案操作未完成，当前内容已保留。'});
 function read(){
  const raw=store()?.getItem(PROFILE_CONNECTION_KEY);if(raw==null)return null;
  const state=JSON.parse(raw);
  if(state?.version!==1||state.kind!=='server_profile'||typeof state.enabled!=='boolean'||typeof state.subjectId!=='string'||!state.subjectId||!Number.isSafeInteger(state.revision)||state.revision<0||!validatePrototypeProfile(state.cache))throw Error('cache_failed');
  if(state.pending&&(!Number.isSafeInteger(state.pending.body?.revision)||!validateChange(state.pending.body.changeSet)||typeof state.pending.key!=='string'))throw Error('cache_failed');
  return state;
 }
 function write(state){try{store().setItem(PROFILE_CONNECTION_KEY,JSON.stringify(state));}catch{throw Error('cache_failed');}}
 const serial=work=>{const run=async()=>{let manager;try{manager=locks();}catch{return failure(Error('lock_unavailable'));}if(typeof manager?.request!=='function')return failure(Error('lock_unavailable'));let entered=false;try{return await manager.request('moat-server-workspace',()=>{entered=true;return work();});}catch(error){return failure(entered?error:Error('lock_unavailable'));}};const result=queue.then(run,run);queue=result.catch(()=>{});return result;};
 async function request(route,{method='GET',body,key}={}){let response;try{response=await fetcher(route,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});}catch{throw Error('network');}let value;try{value=await response.json();}catch{throw Error('invalid_response');}if(!response.ok){const error=Error(value.error?.code||'network');error.status=response.status;error.messageText=value.error?.message;error.current=value;throw error;}return value;}
 async function durable(){const value=await request('/api/v1/capabilities');if(!value.persistence?.durable)throw Error('not_durable');}
 async function checkSession(subjectId){const value=await request('/api/v1/session');if(value.session?.subject?.id!==subjectId)throw Error('subject_changed');}
 async function remote(){const value=await request('/api/v1/profile');if(!validatePrototypeProfile(value.profile)||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('invalid_response');return {profile:value.profile,revision:value.revision};}
 function active(){try{return read()?.enabled===true;}catch{return true;}}
 function readActive(){try{const state=read();if(!state?.enabled)return loadExplorationProfile(store());const error=issue||(state.pending?errorText.pending:'');return {ok:!error,profile:copy(state.cache),revision:state.revision,source:'server',...(error?{error}:{})};}catch{return {ok:false,profile:createPrototypeProfile(),source:'server',error:errorText.cache_failed};}}
 async function refresh(){if(!active())return readActive();return serial(async()=>{try{const state=read();if(!state?.enabled)return readActive();if(state.pending)throw Error('pending');await durable();await checkSession(state.subjectId);const value=await remote();write({...state,cache:value.profile,revision:value.revision});issue='';return {ok:true,profile:copy(value.profile),revision:value.revision,source:'server'};}catch(error){const failed=failure(error);issue=failed.error;return failed;}});}
 async function settle(state){const pending=copy(state.pending);let submitting=false;try{await durable();await checkSession(state.subjectId);submitting=true;await request('/api/v1/profile/change-sets',{method:'POST',body:pending.body,key:pending.key});submitting=false;const value=await remote();write({...state,enabled:state.enabled||pending.enableAfter===true,cache:value.profile,revision:value.revision,pending:null,failed:null});issue='';return {ok:true,profile:copy(value.profile),revision:value.revision,source:'server'};}catch(error){const failed=failure(error);issue=failed.error;if(submitting&&error.status&&[400,403,404,405,409,413,415,422].includes(error.status)){try{write({...state,pending:null,failed:{...pending,error:failed.error}});}catch{}}return failed;}}
 async function preview(){return serial(async()=>{try{const state=read();if(state?.pending)throw Error('pending');await durable();const session=await request('/api/v1/session',{method:'POST',body:{}}),subjectId=session.session?.subject?.id;if(!subjectId)throw Error('invalid_response');if(state?.enabled&&state.subjectId!==subjectId)throw Error('subject_changed');const value=await remote(),local=loadExplorationProfile(store());return {ok:true,subjectId,profile:value.profile,revision:value.revision,local};}catch(error){return failure(error);}});}
 async function enable(previewValue,{importLocal=false}={}){return serial(async()=>{try{const previous=read();if(previous?.pending)throw Error('pending');await durable();await checkSession(previewValue.subjectId);const value=await remote();if(value.revision!==previewValue.revision||!same(value.profile,previewValue.profile))throw Error('local_changed');const state={version:1,kind:'server_profile',enabled:!importLocal,subjectId:previewValue.subjectId,cache:copy(value.profile),revision:value.revision,pending:null};if(importLocal){const local=loadExplorationProfile(store());if(!local.ok||!previewValue.local.ok||!same(local.profile,previewValue.local.profile)||value.revision!==0||!emptyProfile(value.profile))throw Error('local_changed');const changeSet=profileImportChangeSet(local.profile);if(!changeSet.operations.length){state.enabled=true;write(state);return {ok:true,profile:copy(value.profile),revision:0,source:'server'};}state.pending={key:newKey(),enableAfter:true,body:{revision:0,changeSet}};write(state);return settle(state);}write(state);issue='';return {ok:true,profile:copy(value.profile),revision:value.revision,source:'server'};}catch(error){return failure(error);}});}
 async function commit(base,changeSet){if(!active())return commitExplorationChange(store(),base,changeSet);return serial(async()=>{try{const state=read();if(!state?.enabled)throw Error('local_changed');if(state.pending)throw Error('pending');if(!same(base,state.cache))throw Error('local_changed');const applied=applyProfileChangeSet(base,changeSet);if(!applied.ok)throw Error('local_changed');const next={...state,pending:{key:newKey(),body:{revision:state.revision,changeSet:copy(changeSet)}},failed:null};write(next);return settle(next);}catch(error){return failure(error);}});}
 async function retry(){return serial(async()=>{try{const state=read();if(!state?.pending)throw Error('local_changed');return settle(state);}catch(error){return failure(error);}});}
 async function useLocal(){return serial(async()=>{try{const state=read();if(state?.pending)throw Error('pending');if(state)write({...state,enabled:false});issue='';return {ok:true};}catch(error){return failure(error);}});}
 async function detachDeletedSubject(subjectId,{confirmed=false}={}){return serial(async()=>{try{const state=read();if(!confirmed||!state||state.subjectId!==subjectId)throw Error('local_changed');store().removeItem(PROFILE_CONNECTION_KEY);issue='';return {ok:true};}catch(error){return failure(error);}});}
 function status(){try{return {ok:true,state:read(),issue};}catch{return {ok:false,issue:errorText.cache_failed};}}
 return {active,readActive,refresh,preview,enable,commit,retry,useLocal,detachDeletedSubject,status};
}

function validateChange(value){return Boolean(value&&typeof value==='object'&&Array.isArray(value.operations)&&value.scope&&typeof value.scope==='object');}
function emptyProfile(profile){return ['evidence','capitalLinks','riverLinks','unknowns','directions'].every(key=>!Object.keys(profile[key]??{}).length);}
function profileImportChangeSet(profile){
 const definitions=[['evidence','add_evidence'],['capitalLinks','link_capital'],['riverLinks','link_river'],['unknowns','keep_unknown'],['directions','save_direction']];
 const scope={},operations=[];
 for(const [target,type] of definitions){const entries=Object.entries(profile[target]??{});if(entries.length)scope[target]=entries.map(([id])=>id);for(const [entityId,payload] of entries)operations.push({type,entityId,payload:copy(payload)});}
 return {id:'change_import_local_profile',sessionId:'local-profile-import',scope,operations};
}

export const explorationProfileConnection=createExplorationProfileConnection();
