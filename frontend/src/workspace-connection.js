import {emptyWorkspace,validWorkspace} from '../../shared/workspace.js';
import {readWorkspace,saveWorkspaceItem,commitWorkspace,deleteItem} from './workspace-model.js';
import {createGrowthProof} from '../../shared/growth-proof.js';
import {browserStorage} from './exploration-storage.js';

export const CONNECTION_KEY='personal-moat:server-workspace:v1';
const copy=value=>structuredClone(value);
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const same=(a,b)=>canonical(a)===canonical(b);
// Metadata stays in memory, never in exported or persisted personal data.
const snapshotSources=new WeakMap();
const resources={paths:['paths','path'],plans:['plans','plan'],growth:['growth-records','record']};
const pendingRoute=/^\/api\/v1\/(?:imports\/workspace|(?:paths|plans|growth-records)(?:\/[^/]+(?:\/proof)?)?)$/;
const errorText={deletion_pending:'服务端删除结果尚需核对。已暂停同步；会话失效不能证明删除成功。',lock_unavailable:'当前浏览器无法协调多个页面的服务器保存。请使用支持 Web Locks 的浏览器后重试；已有内容和待提交记录仍保留。',revision_conflict:'服务器已有更新。当前输入已保留，请到“数据与同步”核对最新内容。',session_required:'服务器会话已失效。原有内容仍保留，请到“数据与同步”重新核对。',subject_changed:'服务器会话与此工作区不一致，已停止提交。',not_durable:'服务器暂未启用持久保存，请继续使用本地工作区。',local_changed:'工作区已在其他页面更新，请保留输入并重新核对。',pending:'有一笔提交尚未核对，请到“数据与同步”重试。',cache_failed:'本机缓存未能保存。当前输入仍在，请到“数据与同步”核对。',network:'暂时无法连接服务器。当前输入已保留，可稍后重试。',invalid_response:'服务器返回的工作区无法读取，原有内容已保留。'};

export function createWorkspaceConnection({storage=browserStorage,fetcher=(...args)=>globalThis.fetch(...args),newKey=()=>crypto.randomUUID(),locks=()=>globalThis.navigator?.locks}={}){
 let issue='',queue=Promise.resolve();
 const store=()=>typeof storage==='function'?storage():storage;
 function read(){
  const raw=store()?.getItem(CONNECTION_KEY);if(raw==null)return null;
  const state=JSON.parse(raw);
  if(state?.kind!=='server_workspace'||state.version!==1||typeof state.enabled!=='boolean'||typeof state.subjectId!=='string'||!state.subjectId||!validWorkspace(state.cache))throw Error('cache_failed');
  if(state.pending&&(!pendingRoute.test(state.pending.route)||!['POST','PATCH','DELETE'].includes(state.pending.method)||typeof state.pending.key!=='string'||!Number.isSafeInteger(state.pending.body?.revision)))throw Error('cache_failed');
  return state;
 }
 function write(state){try{store().setItem(CONNECTION_KEY,JSON.stringify(state));}catch{throw Error('cache_failed');}}
 // Connection cache and retry records must share one cross-tab critical section.
 const serial=(work,{allowDeletion=false}={})=>{
  const run=async()=>{
   let manager;
   try{manager=locks();}catch{return failure(Error('lock_unavailable'));}
   if(typeof manager?.request!=='function')return failure(Error('lock_unavailable'));
   let entered=false;
   try{return await manager.request('moat-server-workspace',()=>{entered=true;if(!allowDeletion&&read()?.deletion)return failure(Error('deletion_pending'));return work();});}
   catch(error){return failure(entered?error:Error('lock_unavailable'));}
  };
  const result=queue.then(run,run);queue=result.catch(()=>{});return result;
 };
 async function request(route,{method='GET',body,key}={}){
  let response;
  try{response=await fetcher(route,{method,credentials:'same-origin',headers:body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(8000)});}catch{throw Error('network');}
  let value;try{value=await response.json();}catch{throw Error('invalid_response');}
  if(!response.ok){const error=Error(value.error?.code||'network');error.status=response.status;error.messageText=value.error?.message;throw error;}
  return value;
 }
 const failure=error=>({ok:false,error:errorText[error.message]||error.messageText||'保存未完成，当前输入已保留。',code:error.message});
 async function checkSession(subjectId){
  const value=await request('/api/v1/session');
  if(!value.session?.subject?.id||value.session.subject.id!==subjectId)throw Error('subject_changed');
 }
 async function durable(){const caps=await request('/api/v1/capabilities');if(!caps.persistence?.durable)throw Error('not_durable');}
 async function remoteWorkspace(){const value=await request('/api/v1/workspace');if(!validWorkspace(value.workspace))throw Error('invalid_response');return value.workspace;}
 function source(){const state=read();return state?.enabled?'server:'+state.subjectId:'local';}
 function tagged(result,origin=source()){if(result?.data&&typeof result.data==='object')snapshotSources.set(result.data,origin);return result;}
 function guardSource(base,operation){
  let origin;
  try{origin=source();if(snapshotSources.has(base)&&snapshotSources.get(base)!==origin)return failure(Error('local_changed'));}
  catch{return failure(Error('cache_failed'));}
  const result=operation();return result instanceof Promise?result.then(value=>tagged(value,origin)):tagged(result,origin);
 }
 function active(){try{return read()?.enabled===true;}catch{return true;}}
 function readActive(){
  try{const state=read();if(!state?.enabled)return tagged(readWorkspace(store()));const error=issue||(state.deletion?errorText.deletion_pending:state.pending?errorText.pending:'');return tagged({ok:!error,data:copy(state.cache),...(error?{error}:{})});}
  catch{return {ok:false,data:emptyWorkspace(),error:errorText.cache_failed};}
 }
 async function refresh(){
  if(!active())return readActive();
  return serial(async()=>{
  try{
   const state=read();if(!state?.enabled)return readActive();
   if(state.pending)throw Error('pending');
   await durable();await checkSession(state.subjectId);
   const cache=await remoteWorkspace();write({...state,cache});issue='';return {ok:true,data:cache};
  }catch(error){const failed=failure(error);issue=failed.error;return failed;}
 });}
 async function settle(state){
  const pending=copy(state.pending);
  let submitting=false;
  try{
   await durable();await checkSession(state.subjectId);
   submitting=true;
   const saved=await request(pending.route,{method:pending.method,body:pending.body,key:pending.key});
   submitting=false;
   if(!validWorkspace(saved.workspace))throw Error('invalid_response');
   // A replay may be older than today's workspace: always read the latest data.
   const cache=await remoteWorkspace();
   write({...state,cache,enabled:state.enabled||pending.enableAfter===true,pending:null,failed:null});
   issue='';return {ok:true,data:copy(cache)};
  }catch(error){
   const failed=failure(error);issue=failed.error;
   // Only a definitive rejection of the mutation can retire its retry key.
   // Session checks and reads after a successful commit cannot prove rejection.
   if(submitting&&error.status&&[400,403,404,405,409,413,415,422].includes(error.status)){
    try{write({...state,pending:null,failed:{...pending,error:failed.error}});}catch{}
   }
   return failed;
  }
 }
 async function submit(base,operation){return serial(async()=>{
  try{
   const state=read();if(!state?.enabled)throw Error('local_changed');
   if(state.pending)throw Error('pending');
   if((snapshotSources.has(base)&&snapshotSources.get(base)!==source())||!same(base,state.cache))throw Error('local_changed');
   const pending={...operation,key:newKey(),body:{revision:base.revision,...operation.body}};
   const next={...state,pending,failed:null};write(next);
   return await settle(next);
  }catch(error){return failure(error);}
 });}
 function saveItem(base,kind,item){
  if(!active())return saveWorkspaceItem(store(),base,kind,item);
  const [resource,key]=resources[kind]??[];if(!resource)return {ok:false,error:'未知工作区类型。'};
  const exists=(base[kind]??[]).some(value=>value.id===item.id),body=copy(item);
  if(kind==='growth')delete body.proof;
  return submit(base,{method:exists?'PATCH':'POST',route:'/api/v1/'+resource+(exists?'/'+encodeURIComponent(item.id):''),body:{[key]:body}});
 }
 function deleteRecord(base,kind,id){
  if(!active())return commitWorkspace(store(),base,deleteItem(base,kind,id));
  const [resource]=resources[kind]??[];return submit(base,{method:'DELETE',route:'/api/v1/'+resource+'/'+encodeURIComponent(id),body:{}});
 }
 function confirmProof(base,id,selection){
  if(!active()){
   const item=base.growth.find(record=>record.id===id);
   try{return saveWorkspaceItem(store(),base,'growth',{...item,proof:createGrowthProof(item,selection)});}catch(error){return {ok:false,error:error.message};}
  }
  return submit(base,{method:'POST',route:'/api/v1/growth-records/'+encodeURIComponent(id)+'/proof',body:{confirmed:true,selection:copy(selection)}});
 }
 function revokeProof(base,id){
  if(!active()){const item=copy(base.growth.find(record=>record.id===id));delete item.proof;return saveWorkspaceItem(store(),base,'growth',item);}
  return submit(base,{method:'DELETE',route:'/api/v1/growth-records/'+encodeURIComponent(id)+'/proof',body:{}});
 }
 async function preview(){return serial(async()=>{
  try{
   const state=read();if(state?.pending)throw Error('pending');
   await durable();
   const value=await request('/api/v1/session',{method:'POST',body:{}}),subjectId=value.session?.subject?.id;
   if(typeof subjectId!=='string'||!subjectId)throw Error('invalid_response');
   if(state?.enabled&&state.subjectId!==subjectId)throw Error('subject_changed');
   const workspace=await remoteWorkspace(),local=readWorkspace(store());
   return {ok:true,subjectId,workspace,local};
  }catch(error){return failure(error);}
 });}
 async function enable(preview,{importLocal=false}={}){return serial(async()=>{
  try{
   const previous=read();if(previous?.pending)throw Error('pending');
   await durable();await checkSession(preview.subjectId);
   const cache=await remoteWorkspace();if(!same(cache,preview.workspace))throw Error('local_changed');
   const state={version:1,kind:'server_workspace',enabled:!importLocal,subjectId:preview.subjectId,cache,pending:null};
   if(importLocal){
    const local=readWorkspace(store());if(!local.ok||!preview.local.ok||!same(local.data,preview.local.data))throw Error('local_changed');
    if(cache.revision!==0||cache.paths.length||cache.plans.length||cache.growth.length)throw Error('local_changed');
    state.pending={method:'POST',route:'/api/v1/imports/workspace',key:newKey(),enableAfter:true,body:{revision:cache.revision,workspace:copy(local.data),confirmed:true}};
    write(state);return await settle(state);
   }
   write(state);issue='';return {ok:true,data:cache};
  }catch(error){return failure(error);}
 });}
 async function retry(){return serial(async()=>{try{const state=read();if(!state?.pending)throw Error('local_changed');return await settle(state);}catch(error){return failure(error);}});}
 async function useLocal(){return serial(async()=>{try{const state=read();if(state?.pending)throw Error('pending');if(state)write({...state,enabled:false});issue='';return {ok:true};}catch(error){return failure(error);}});}
 async function exportData(){return serial(async()=>{
  try{
   const state=read();if(!state||state.pending)throw Error('pending');
   await checkSession(state.subjectId);
   const snapshot=await request('/api/v1/data/export');
   if(snapshot?.subject?.id!==state.subjectId||snapshot.format!=='personal-moat-server-export'||snapshot.version!==1||!validWorkspace(snapshot.data?.workspace))throw Error('invalid_response');
   return {ok:true,snapshot};
  }catch(error){return failure(error);}
 });}
 async function deleteData(snapshot,{confirmed=false}={}){return serial(async()=>{
  let committed=false;
  try{
   const state=read();if(!state||state.pending)throw Error('pending');
   if(!confirmed||snapshot?.subject?.id!==state.subjectId||!validWorkspace(snapshot.data?.workspace))throw Error('local_changed');
   await checkSession(state.subjectId);
   write({...state,deletion:'pending'});
   let result;
   try{result=await request('/api/v1/data',{method:'DELETE',body:{confirmed:true,subjectId:state.subjectId,revision:snapshot.data.workspace.revision}});}
   catch(error){if(error.status&&[400,403,409,413,415,422].includes(error.status))write({...state,deletion:null});throw error;}
   if(result.deleted!==true||result.scope!=='server_subject')throw Error('invalid_response');
   committed=true;
   store().removeItem(CONNECTION_KEY);issue='';return {ok:true,deleted:true};
  }catch(error){
   if(committed)return {ok:false,deleted:true,code:'cache_failed',error:'服务端已确认删除，但本机连接缓存清理失败。请使用下方清理入口，原始本地工作区仍保留。'};
   return failure(error);
  }
 });}
 async function detachDeleted({confirmed=false}={}){return serial(async()=>{
  try{if(!confirmed||!read()?.deletion)throw Error('local_changed');store().removeItem(CONNECTION_KEY);issue='';return {ok:true};}
  catch{return failure(Error('cache_failed'));}
 },{allowDeletion:true});}
 function pendingDraft(kind){try{const state=read(),operation=state?.pending??state?.failed;const [resource,key]=resources[kind]??[];if(!operation||!operation.route.startsWith('/api/v1/'+resource))return null;return operation.body[key]?copy(operation.body[key]):null;}catch{return null;}}
 function status(){try{return {ok:true,state:read(),issue};}catch{return {ok:false,issue:errorText.cache_failed};}}
 return {active,readActive,refresh,preview,enable,retry,useLocal,pendingDraft,status,exportData,deleteData,detachDeleted,
  saveItem:(base,...args)=>guardSource(base,()=>saveItem(base,...args)),
  deleteRecord:(base,...args)=>guardSource(base,()=>deleteRecord(base,...args)),
  confirmProof:(base,...args)=>guardSource(base,()=>confirmProof(base,...args)),
  revokeProof:(base,...args)=>guardSource(base,()=>revokeProof(base,...args))};
}

export const workspaceConnection=createWorkspaceConnection();
export const readActiveWorkspace=()=>workspaceConnection.readActive();
export const activeWorkspaceLabel=()=>workspaceConnection.active()?'服务器工作区':'当前浏览器工作区';
