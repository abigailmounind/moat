import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createPrototypeProfile} from '../shared/profile.js';
import {emptyWorkspace,validWorkspace} from '../shared/workspace.js';
import {applyWorkspaceMutation} from '../shared/workspace-operations.js';

export const idempotencyPolicy=Object.freeze({retentionSeconds:24*60*60,maxKeysPerSubject:100,maxKeyLength:128});
export const validIdempotencyKey=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
const hash=value=>createHash('sha256').update(value).digest('hex');
const clone=value=>structuredClone(value);
// JSON object property order is irrelevant; array order and every value remain significant.
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);

// Repository methods may return values or promises. A persistent adapter must commit
// the revision change and its replay receipt in the same transaction.
export function createMemoryProductRepository({tokenFactory=()=>randomBytes(32).toString('base64url'),idFactory=()=>randomUUID(),now=()=>Date.now(),maxKeysPerSubject=idempotencyPolicy.maxKeysPerSubject}={}){
 if(!Number.isSafeInteger(maxKeysPerSubject)||maxKeysPerSubject<1)throw new TypeError('invalid_idempotency_capacity');
 const sessions=new Map(),subjects=new Map();
 return {
  kind:'memory',durable:false,idempotency:Object.freeze({...idempotencyPolicy,maxKeysPerSubject}),
  createAnonymousSession(){
   const token=tokenFactory(),subject={id:idFactory(),kind:'anonymous',createdAt:new Date(now()).toISOString()};
   sessions.set(hash(token),subject.id);
   subjects.set(subject.id,{subject,profile:createPrototypeProfile(),workspace:emptyWorkspace(),receipts:new Map()});
   return {token,subject:clone(subject)};
  },
  findSession(token){
   if(typeof token!=='string'||!token)return null;
   const record=subjects.get(sessions.get(hash(token)));
   return record?clone(record.subject):null;
  },
  revokeSession(token){
   if(typeof token==='string'&&token)sessions.delete(hash(token));
   return {ok:true};
  },
  readBootstrap(subjectId){
   const record=subjects.get(subjectId);
   return record?clone({profile:record.profile,workspace:record.workspace}):null;
  },
  readWorkspace(subjectId){
   const record=subjects.get(subjectId);
   return record?clone(record.workspace):null;
  },
  deleteSubject(subjectId,revision){
   const record=subjects.get(subjectId);
   if(!record)return {ok:false,code:'subject_not_found'};
   if(!Number.isSafeInteger(revision)||revision<0)return {ok:false,code:'invalid_workspace'};
   if(record.workspace.revision!==revision)return {ok:false,code:'revision_conflict'};
   for(const [tokenHash,id] of sessions)if(id===subjectId)sessions.delete(tokenHash);
   subjects.delete(subjectId);
   return {ok:true};
  },
  writeWorkspace(subjectId,revision,workspace,{idempotencyKey}={}){
   const record=subjects.get(subjectId);
   if(!record)return {ok:false,code:'subject_not_found'};
   if(idempotencyKey!==undefined&&!validIdempotencyKey(idempotencyKey))return {ok:false,code:'invalid_idempotency_key'};
   if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER||!validWorkspace(workspace)||workspace.revision!==revision)return {ok:false,code:'invalid_workspace'};
   let fingerprint;
   const timestamp=now();
   if(idempotencyKey!==undefined){
    fingerprint=hash(canonical({revision,workspace}));
    for(const [key,receipt] of record.receipts)if(receipt.expiresAt<=timestamp)record.receipts.delete(key);
    const receipt=record.receipts.get(idempotencyKey);
    if(receipt)return receipt.fingerprint===fingerprint?{ok:true,workspace:clone(receipt.workspace),replayed:true}:{ok:false,code:'idempotency_conflict'};
   }
   if(record.workspace.revision!==revision)return {ok:false,code:'revision_conflict',workspace:clone(record.workspace)};
   if(idempotencyKey!==undefined&&record.receipts.size>=maxKeysPerSubject)return {ok:false,code:'idempotency_capacity'};
   const next={...clone(workspace),revision:revision+1};
   const result={ok:true,workspace:clone(next),replayed:false};
   const receipt=idempotencyKey===undefined?null:{fingerprint,workspace:clone(next),expiresAt:timestamp+idempotencyPolicy.retentionSeconds*1000};
   // No await between the version check, workspace replacement and receipt write.
   record.workspace=next;
   if(receipt)record.receipts.set(idempotencyKey,receipt);
   return result;
  },
  mutateWorkspace(subjectId,revision,mutation,{idempotencyKey}={}){
   const record=subjects.get(subjectId);
   if(!record)return {ok:false,code:'subject_not_found'};
   if(!validIdempotencyKey(idempotencyKey))return {ok:false,code:'invalid_idempotency_key'};
   if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER)return {ok:false,code:'invalid_workspace'};
   const timestamp=now(),fingerprint=hash(canonical({operation:'object',revision,mutation}));
   for(const [key,receipt] of record.receipts)if(receipt.expiresAt<=timestamp)record.receipts.delete(key);
   const receipt=record.receipts.get(idempotencyKey);
   if(receipt)return receipt.fingerprint===fingerprint?{ok:true,workspace:clone(receipt.workspace),replayed:true}:{ok:false,code:'idempotency_conflict'};
   if(record.workspace.revision!==revision)return {ok:false,code:'revision_conflict',workspace:clone(record.workspace)};
   if(record.receipts.size>=maxKeysPerSubject)return {ok:false,code:'idempotency_capacity'};
   const checked=applyWorkspaceMutation(record.workspace,mutation);
   if(!checked.ok)return checked;
   const next={...checked.workspace,revision:revision+1};
   const savedReceipt={fingerprint,workspace:clone(next),expiresAt:timestamp+idempotencyPolicy.retentionSeconds*1000};
   record.workspace=next;record.receipts.set(idempotencyKey,savedReceipt);
   return {ok:true,workspace:clone(next),replayed:false};
  }
 };
}
