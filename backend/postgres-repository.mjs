import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createPrototypeProfile} from '../shared/profile.js';
import {validWorkspace} from '../shared/workspace.js';
import {applyWorkspaceMutation} from '../shared/workspace-operations.js';
import {idempotencyPolicy,validIdempotencyKey} from './product-repository.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const canonical=value=>Array.isArray(value)?'['+value.map(canonical).join(',')+']':value&&typeof value==='object'?'{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonical(value[key])).join(',')+'}':JSON.stringify(value);
const validRevision=value=>Number.isSafeInteger(value)&&value>=0&&value<Number.MAX_SAFE_INTEGER;
const validSubject=value=>typeof value==='string'&&/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
const clone=value=>structuredClone(value);

// Every statement uses the transaction's dedicated connection.
async function transaction(pool,work,{readOnly=false}={}){
 const client=await pool.connect();let broken=false;
 try{
  await client.query(readOnly?'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY':'BEGIN');
  const result=await work(client);
  await client.query('COMMIT');return result;
 }catch(error){
  try{await client.query('ROLLBACK');}catch{broken=true;}
  throw error;
 }finally{client.release(broken);}
}

async function loadWorkspace(client,subjectId){
 const header=await client.query('SELECT version,revision FROM moat_workspaces WHERE subject_id=$1',[subjectId]);
 if(!header.rowCount)return null;
 const paths=await client.query('SELECT payload FROM moat_paths WHERE subject_id=$1 ORDER BY position',[subjectId]);
 const plans=await client.query('SELECT payload FROM moat_plans WHERE subject_id=$1 ORDER BY position',[subjectId]);
 const growth=await client.query('SELECT payload FROM moat_growth_records WHERE subject_id=$1 ORDER BY position',[subjectId]);
 const workspace={version:header.rows[0].version,revision:Number(header.rows[0].revision),paths:paths.rows.map(row=>row.payload),plans:plans.rows.map(row=>row.payload),growth:growth.rows.map(row=>row.payload)};
 if(!validWorkspace(workspace))throw new Error('invalid_stored_workspace');
 return workspace;
}

// The workspace remains the concurrency boundary. Separate object rows and
// relationship constraints preserve order and legacy shared plans.
async function replaceWorkspace(client,subjectId,workspace){
 await client.query('DELETE FROM moat_plan_paths WHERE subject_id=$1',[subjectId]);
 await client.query('DELETE FROM moat_growth_records WHERE subject_id=$1',[subjectId]);
 await client.query('DELETE FROM moat_plans WHERE subject_id=$1',[subjectId]);
 await client.query('DELETE FROM moat_paths WHERE subject_id=$1',[subjectId]);
 for(const [position,path] of workspace.paths.entries())await client.query('INSERT INTO moat_paths(subject_id,id,position,source_direction_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[subjectId,path.id,position,path.sourceDirectionId||null,JSON.stringify(path)]);
 for(const [position,plan] of workspace.plans.entries()){
  await client.query('INSERT INTO moat_plans(subject_id,id,position,payload) VALUES($1,$2,$3,$4::jsonb)',[subjectId,plan.id,position,JSON.stringify(plan)]);
  for(const [pathPosition,pathId] of plan.pathIds.entries())await client.query('INSERT INTO moat_plan_paths(subject_id,plan_id,path_id,position) VALUES($1,$2,$3,$4)',[subjectId,plan.id,pathId,pathPosition]);
 }
 for(const [position,record] of (workspace.growth??[]).entries())await client.query('INSERT INTO moat_growth_records(subject_id,id,position,plan_id,payload) VALUES($1,$2,$3,$4,$5::jsonb)',[subjectId,record.id,position,record.planId||null,JSON.stringify(record)]);
 await client.query('UPDATE moat_workspaces SET version=$2,revision=$3,updated_at=now() WHERE subject_id=$1',[subjectId,workspace.version,workspace.revision]);
}

export function createPostgresProductRepository({pool,tokenFactory=()=>randomBytes(32).toString('base64url'),idFactory=()=>randomUUID(),maxKeysPerSubject=idempotencyPolicy.maxKeysPerSubject}={}){
 if(!pool?.connect||!pool?.query)throw new TypeError('postgres_pool_required');
 if(!Number.isSafeInteger(maxKeysPerSubject)||maxKeysPerSubject<1)throw new TypeError('invalid_idempotency_capacity');
 const save=async(subjectId,revision,fingerprint,idempotencyKey,build)=>{
  if(!validSubject(subjectId))return {ok:false,code:'subject_not_found'};
  return transaction(pool,async client=>{
   // Serialize writers BEFORE inspecting receipts so a waiting retry sees the
   // preceding writer's committed receipt as well as its version.
   const locked=await client.query('SELECT revision FROM moat_workspaces WHERE subject_id=$1 FOR UPDATE',[subjectId]);
   if(!locked.rowCount)return {ok:false,code:'subject_not_found'};
   if(idempotencyKey!==undefined){
    await client.query('DELETE FROM moat_idempotency_receipts WHERE subject_id=$1 AND expires_at<=clock_timestamp()',[subjectId]);
    const receipt=await client.query('SELECT fingerprint,workspace FROM moat_idempotency_receipts WHERE subject_id=$1 AND operation_key=$2',[subjectId,idempotencyKey]);
    if(receipt.rowCount)return receipt.rows[0].fingerprint===fingerprint?{ok:true,workspace:receipt.rows[0].workspace,replayed:true}:{ok:false,code:'idempotency_conflict'};
   }
   const current=await loadWorkspace(client,subjectId);
   if(current.revision!==revision)return {ok:false,code:'revision_conflict',workspace:current};
   const built=build(current);if(!built.ok)return built;
   if(idempotencyKey!==undefined){
    const count=await client.query('SELECT count(*)::integer AS count FROM moat_idempotency_receipts WHERE subject_id=$1',[subjectId]);
    if(count.rows[0].count>=maxKeysPerSubject)return {ok:false,code:'idempotency_capacity'};
   }
   const next={...built.workspace,revision:revision+1};
   await replaceWorkspace(client,subjectId,next);
   if(idempotencyKey!==undefined)await client.query("INSERT INTO moat_idempotency_receipts(subject_id,operation_key,fingerprint,workspace,expires_at) VALUES($1,$2,$3,$4::jsonb,clock_timestamp()+($5*interval '1 second'))",[subjectId,idempotencyKey,fingerprint,JSON.stringify(next),idempotencyPolicy.retentionSeconds]);
   return {ok:true,workspace:clone(next),replayed:false};
  });
 };
 return {
  kind:'postgres',durable:true,idempotency:Object.freeze({...idempotencyPolicy,maxKeysPerSubject}),
  async createAnonymousSession(){
   const token=tokenFactory(),subject={id:idFactory(),kind:'anonymous',createdAt:new Date().toISOString()};
   await transaction(pool,async client=>{
    await client.query('INSERT INTO moat_subjects(id,kind,created_at) VALUES($1,$2,$3)',[subject.id,subject.kind,subject.createdAt]);
    await client.query("INSERT INTO moat_sessions(token_hash,subject_id,expires_at) VALUES($1,$2,clock_timestamp()+interval '30 days')",[hash(token),subject.id]);
    await client.query('INSERT INTO moat_profiles(subject_id,payload) VALUES($1,$2::jsonb)',[subject.id,JSON.stringify(createPrototypeProfile())]);
    await client.query('INSERT INTO moat_workspaces(subject_id,version,revision) VALUES($1,1,0)',[subject.id]);
   });
   return {token,subject};
  },
  async findSession(token){
   if(typeof token!=='string'||!token)return null;
   const result=await pool.query('SELECT s.id,s.kind,s.created_at FROM moat_sessions x JOIN moat_subjects s ON s.id=x.subject_id WHERE x.token_hash=$1 AND x.expires_at>clock_timestamp()',[hash(token)]);
   return result.rowCount?{id:result.rows[0].id,kind:result.rows[0].kind,createdAt:new Date(result.rows[0].created_at).toISOString()}:null;
  },
  async readBootstrap(subjectId){
   if(!validSubject(subjectId))return null;
   return transaction(pool,async client=>{
    const profile=await client.query('SELECT payload FROM moat_profiles WHERE subject_id=$1',[subjectId]);
    const workspace=await loadWorkspace(client,subjectId);
    return profile.rowCount&&workspace?{profile:profile.rows[0].payload,workspace}:null;
   },{readOnly:true});
  },
  async readWorkspace(subjectId){
   if(!validSubject(subjectId))return null;
   return transaction(pool,client=>loadWorkspace(client,subjectId),{readOnly:true});
  },
  async deleteSubject(subjectId,revision){
   if(!validSubject(subjectId))return {ok:false,code:'subject_not_found'};
   if(!Number.isSafeInteger(revision)||revision<0)return {ok:false,code:'invalid_workspace'};
   return transaction(pool,async client=>{
    // Use the same lock as writers; no write may slip past the deletion check.
    const locked=await client.query('SELECT revision FROM moat_workspaces WHERE subject_id=$1 FOR UPDATE',[subjectId]);
    if(!locked.rowCount)return {ok:false,code:'subject_not_found'};
    if(Number(locked.rows[0].revision)!==revision)return {ok:false,code:'revision_conflict'};
    // Remove referencing growth rows before plans; remaining ownership FKs cascade.
    await client.query('DELETE FROM moat_growth_records WHERE subject_id=$1',[subjectId]);
    await client.query('DELETE FROM moat_subjects WHERE id=$1',[subjectId]);
    return {ok:true};
   });
  },
  async writeWorkspace(subjectId,revision,workspace,{idempotencyKey}={}){
   if(idempotencyKey!==undefined&&!validIdempotencyKey(idempotencyKey))return {ok:false,code:'invalid_idempotency_key'};
   if(!validRevision(revision)||!validWorkspace(workspace)||workspace.revision!==revision)return {ok:false,code:'invalid_workspace'};
   const snapshot=clone(workspace);
   return save(subjectId,revision,hash(canonical({revision,workspace:snapshot})),idempotencyKey,()=>({ok:true,workspace:snapshot}));
  },
  async mutateWorkspace(subjectId,revision,mutation,{idempotencyKey}={}){
   if(!validIdempotencyKey(idempotencyKey))return {ok:false,code:'invalid_idempotency_key'};
   if(!validRevision(revision))return {ok:false,code:'invalid_workspace'};
   const snapshot=clone(mutation);
   return save(subjectId,revision,hash(canonical({operation:'object',revision,mutation:snapshot})),idempotencyKey,current=>applyWorkspaceMutation(current,snapshot));
  }
 };
}
