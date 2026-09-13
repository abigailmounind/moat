import {validatePrototypeProfile} from '../shared/profile.js';
import {applyProfileChangeSet,validateProfileChangeSet} from '../shared/profile-changes.js';
import {analysisCapabilities,analyzeWithModel,runRulesAnalysis,validateRulesSession} from './model-gateway.mjs';
import {edgeGuard,readBoundedJson} from './request-guards.mjs';
import {commitDocument} from './d1-commit.mjs';
import {validWorkspace} from '../shared/workspace.js';
import {applyWorkspaceMutation} from '../shared/workspace-operations.js';

const apiVersion='1',cookieName='moat_session',sessionSeconds=60*60*24*30,maxBodyBytes=256*1024;
const headers={'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const json=(value,status=200,extra={})=>new Response(JSON.stringify(value),{status,headers:{...headers,...extra}});
const failure=(status,code,message,retryable=false)=>json({error:{code,message,retryable}},status);
const cookie=(token,maxAge=sessionSeconds)=>`${cookieName}=${encodeURIComponent(token)}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const tokenFrom=request=>{const raw=request.headers.get('Cookie')||'';for(const part of raw.split(';')){const [name,...rest]=part.trim().split('=');if(name===cookieName){try{return decodeURIComponent(rest.join('='));}catch{return '';}}}return '';};
const digest=async value=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return [...new Uint8Array(bytes)].map(byte=>byte.toString(16).padStart(2,'0')).join('');};
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
const validKey=value=>typeof value==='string'&&/^[A-Za-z0-9._:-]{1,128}$/.test(value);
const sameOrigin=request=>{const origin=request.headers.get('Origin');if(!origin)return false;try{return new URL(origin).origin===new URL(request.url).origin;}catch{return false;}};
const d1Limit=error=>/exceeded D1's free tier daily row (read|write) limit|Exceeded maximum DB size/i.test(String(error?.message||error));
const cleanPlace=value=>typeof value==='string'?value.trim().slice(0,80):'';
const coordinate=(value,min,max)=>{if(value===null||value===undefined||value==='')return null;const number=Number(value);return Number.isFinite(number)&&number>=min&&number<=max?Math.round(number*10)/10:null;};

async function recordVisit(request,db){
 if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
 const cf=request.cf??{},now=new Date(),cutoff=new Date(now.getTime()-30*24*60*60*1000).toISOString();
 const latitude=coordinate(cf.latitude,-90,90),longitude=coordinate(cf.longitude,-180,180);
 await db.batch([
  db.prepare('DELETE FROM visitor_events WHERE visited_at<?1').bind(cutoff),
  db.prepare('INSERT INTO visitor_events(id,visited_at,country_code,region,city,latitude,longitude) VALUES(?1,?2,?3,?4,?5,?6,?7)').bind(crypto.randomUUID(),now.toISOString(),cleanPlace(cf.country).toUpperCase(),cleanPlace(cf.region),cleanPlace(cf.city),latitude,longitude)
 ]);
 return json({apiVersion,recorded:true},201);
}

async function visitorStats(request,env){
 const authorization=request.headers.get('Authorization')||'',expected=env.VISITOR_STATS_ADMIN_KEY;
 if(!expected||authorization!==`Bearer ${expected}`)return failure(401,'admin_required','需要有效的管理密钥。');
 const cutoff=new Date(Date.now()-30*24*60*60*1000).toISOString();
 const [countResult,result]=await env.DB.batch([
  env.DB.prepare('SELECT count(*) AS total FROM visitor_events WHERE visited_at>=?1').bind(cutoff),
  env.DB.prepare('SELECT visited_at AS visitedAt,country_code AS countryCode,region,city,latitude,longitude FROM visitor_events WHERE visited_at>=?1 ORDER BY visited_at DESC LIMIT 500').bind(cutoff)
 ]);
 const visits=(result?.results??[]).map(row=>({...row,latitude:Number(row.latitude),longitude:Number(row.longitude)}));
 return json({apiVersion,retentionDays:30,total:Number(countResult?.results?.[0]?.total??0),returned:visits.length,limit:500,visits});
}

async function subjectFor(request,db){
 const token=tokenFrom(request);if(!token)return null;
 const tokenHash=await digest(token),now=new Date().toISOString();
 return db.prepare('SELECT s.id, s.kind, s.created_at AS createdAt FROM sessions x JOIN subjects s ON s.id=x.subject_id WHERE x.token_hash=?1 AND x.expires_at>?2').bind(tokenHash,now).first();
}

async function createSession(request,db){
 if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
 const current=await subjectFor(request,db);if(current)return json({session:{subject:current}});
 const subjectId=crypto.randomUUID(),token=crypto.randomUUID()+crypto.randomUUID().replaceAll('-',''),tokenHash=await digest(token),now=new Date(),expires=new Date(now.getTime()+sessionSeconds*1000);
 await db.batch([
  db.prepare('INSERT INTO subjects(id,kind,created_at) VALUES(?1,?2,?3)').bind(subjectId,'anonymous',now.toISOString()),
  db.prepare('INSERT INTO sessions(token_hash,subject_id,created_at,expires_at) VALUES(?1,?2,?3,?4)').bind(tokenHash,subjectId,now.toISOString(),expires.toISOString()),
  db.prepare('INSERT INTO profiles(subject_id,revision,content_json) VALUES(?1,0,?2)').bind(subjectId,JSON.stringify({evidence:{},capitalLinks:{},riverLinks:{},unknowns:{},appliedChangeSets:[]})),
  db.prepare('INSERT INTO workspaces(subject_id,revision,content_json) VALUES(?1,0,?2)').bind(subjectId,JSON.stringify({version:1,revision:0,paths:[],plans:[],growth:[]}))
 ]);
 return json({session:{subject:{id:subjectId,kind:'anonymous',createdAt:now.toISOString()}}},201,{'Set-Cookie':cookie(token)});
}

const corrupt=()=>{const error=new Error('stored_data_invalid');error.code='stored_data_invalid';throw error;};
function profileRow(row){
 if(!row)return null;let profile;try{profile=JSON.parse(row.contentJson);}catch{corrupt();}
 if(!Number.isSafeInteger(row.revision)||row.revision<0||!validatePrototypeProfile(profile))corrupt();return {profile,revision:row.revision};
}
function workspaceRow(row){
 if(!row)return null;let workspace;try{workspace=JSON.parse(row.contentJson);}catch{corrupt();}
 if(!Number.isSafeInteger(row.revision)||row.revision<0||workspace?.revision!==row.revision||!validWorkspace(workspace))corrupt();return workspace;
}
async function readProfile(db,subjectId){
 const row=await db.prepare('SELECT revision, content_json AS contentJson FROM profiles WHERE subject_id=?1').bind(subjectId).first();
 return profileRow(row);
}
async function readWorkspace(db,subjectId){
 const row=await db.prepare('SELECT revision, content_json AS contentJson FROM workspaces WHERE subject_id=?1').bind(subjectId).first();
 return workspaceRow(row);
}
async function readBootstrap(db,subjectId){
 const [profileResult,workspaceResult]=await db.batch([
  db.prepare('SELECT revision, content_json AS contentJson FROM profiles WHERE subject_id=?1').bind(subjectId),
  db.prepare('SELECT revision, content_json AS contentJson FROM workspaces WHERE subject_id=?1').bind(subjectId)
 ]);
 const profile=profileRow(profileResult?.results?.[0]??null),workspace=workspaceRow(workspaceResult?.results?.[0]??null);
 return profile&&workspace?{profile:profile.profile,profileRevision:profile.revision,workspace}:null;
}

const bodyJson=(request,limit=maxBodyBytes)=>readBoundedJson(request,limit);

async function receipt(db,subjectId,key){
 const row=await db.prepare('SELECT fingerprint, response_json AS responseJson FROM idempotency_receipts WHERE subject_id=?1 AND operation_key=?2 AND expires_at>?3').bind(subjectId,key,new Date().toISOString()).first();
 if(!row)return null;try{return {fingerprint:row.fingerprint,response:JSON.parse(row.responseJson)};}catch{corrupt();}
}

async function replayResponse(db,subjectId,key,fingerprint){
 const prior=await receipt(db,subjectId,key);
 return prior?(prior.fingerprint===fingerprint?json(prior.response,200,{'Idempotency-Replayed':'true'}):failure(409,'idempotency_conflict','这个幂等键已用于不同内容，请使用新键。')):null;
}

async function writeProfile(request,db,subject){
 if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
 const key=request.headers.get('Idempotency-Key');if(!validKey(key))return failure(400,'invalid_idempotency_key','请提供有效的幂等键。');
 let body;try{body=await bodyJson(request);}catch(error){const map={unsupported_media_type:[415,'unsupported_media_type','请使用 application/json 提交内容。'],body_too_large:[413,'body_too_large','请求体过大。'],invalid_json:[400,'invalid_json','请求体不是有效 JSON。']};return failure(...map[error.code]);}
 if(!Number.isSafeInteger(body?.revision)||body.revision<0||body.revision===Number.MAX_SAFE_INTEGER||!validateProfileChangeSet(body.changeSet))return failure(422,'invalid_profile','请提供有效的档案版本与确认变更集。');
 const fingerprint=await digest(canonical({operation:'profile-change',revision:body.revision,changeSet:body.changeSet})),prior=await receipt(db,subject.id,key);
 if(prior)return prior.fingerprint===fingerprint?json(prior.response,200,{'Idempotency-Replayed':'true'}):failure(409,'idempotency_conflict','这个幂等键已用于不同内容，请为新的提交使用新键。');
 const current=await readProfile(db,subject.id);if(!current)return failure(404,'subject_not_found','当前会话的数据不存在。');
 // A matching request may have committed between the receipt and document reads.
 if(current.revision!==body.revision)return await replayResponse(db,subject.id,key,fingerprint)??json({error:{code:'revision_conflict',message:'探索档案已有更新，请保留当前确认并核对最新版本。',retryable:true},profile:current.profile,revision:current.revision},409);
 const applied=applyProfileChangeSet(current.profile,body.changeSet);if(!applied.ok)return failure(422,'invalid_profile_change','请核对逐条确认内容和引用关系。');
 const nextRevision=applied.duplicate?current.revision:current.revision+1;
 const result=await commitDocument(db,{table:'profiles',subjectId:subject.id,revision:current.revision,nextRevision,content:applied.profile,key,fingerprint,response:{apiVersion,profile:applied.profile,revision:nextRevision,duplicate:applied.duplicate}});
 if(result.response)return json(result.response,200,{'Idempotency-Replayed':String(result.replayed)});
 if(result.code==='idempotency_conflict')return failure(409,result.code,'这个幂等键已用于不同内容，请使用新键。');
 if(result.code==='idempotency_capacity')return failure(503,result.code,'可保留的重试记录已满，请稍后重试。',true);
 const latest=await readProfile(db,subject.id);return latest?json({error:{code:'revision_conflict',message:'探索档案已有更新，请核对最新版本。',retryable:true},...latest},409):failure(404,'subject_not_found','当前会话的数据不存在。');
}

const workspaceErrors={not_found:[404,'没有找到这条内容。'],idempotency_conflict:[409,'这个幂等键已用于不同内容，请为新的提交使用新键。'],already_exists:[409,'相同标识的内容已经存在。'],source_direction_conflict:[409,'这条方向已经建立了路径。'],import_requires_empty:[409,'服务器已有工作区内容，不能用本地副本覆盖。'],invalid_item:[422,'请检查记录内容、路径归属和河流。'],invalid_import:[422,'请核对本地工作区并明确确认导入。'],confirmation_required:[422,'成果证明需要单独确认或撤回。'],invalid_proof:[422,'请补齐行动、成果及关联解释，再确认保存。'],missing_path:[422,'关联路径不存在。'],unassigned:[422,'请选择所属路径。'],cross_river:[422,'请选择同河流路径。'],river_mismatch:[422,'计划河流与路径不一致。'],multiple_paths_not_allowed:[422,'新计划只能属于一条路径。']};
async function mutateWorkspace(request,db,subject,mutation){
 if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
 const key=request.headers.get('Idempotency-Key');if(!validKey(key))return failure(400,'invalid_idempotency_key','请提供有效的幂等键。');
 let body;try{body=await bodyJson(request);}catch(error){const map={unsupported_media_type:[415,'unsupported_media_type','请使用 application/json 提交内容。'],body_too_large:[413,'body_too_large','请求体过大。'],invalid_json:[400,'invalid_json','请求体不是有效 JSON。']};return failure(...map[error.code]);}
 if(!Number.isSafeInteger(body?.revision)||body.revision<0||body.revision===Number.MAX_SAFE_INTEGER)return failure(422,'invalid_workspace','请提供有效的工作区版本。');
 const operation=mutation(body);if(!operation)return failure(422,'invalid_item','请检查对象标识与内容。');
 const fingerprint=await digest(canonical({operation:'object',revision:body.revision,mutation:operation})),prior=await receipt(db,subject.id,key);
 if(prior)return prior.fingerprint===fingerprint?json(prior.response,200,{'Idempotency-Replayed':'true'}):failure(409,'idempotency_conflict',workspaceErrors.idempotency_conflict[1]);
 const current=await readWorkspace(db,subject.id);if(!current)return failure(404,'subject_not_found','当前会话的数据不存在。');
 if(current.revision!==body.revision)return await replayResponse(db,subject.id,key,fingerprint)??json({error:{code:'revision_conflict',message:'服务器已有更新，请保留当前输入并核对最新版本。',retryable:true},workspace:current},409);
 const applied=applyWorkspaceMutation(current,operation);if(!applied.ok){const [status,message]=workspaceErrors[applied.code]??[422,'请检查对象内容。'];return failure(status,applied.code,message);}
 const workspace={...applied.workspace,revision:current.revision+1};
 const result=await commitDocument(db,{table:'workspaces',subjectId:subject.id,revision:current.revision,nextRevision:workspace.revision,content:workspace,key,fingerprint,response:{apiVersion,workspace}});
 if(result.response)return json(result.response,200,{'Idempotency-Replayed':String(result.replayed)});
 if(result.code==='idempotency_conflict')return failure(409,result.code,workspaceErrors.idempotency_conflict[1]);
 if(result.code==='idempotency_capacity')return failure(503,result.code,'可保留的重试记录已满，请稍后重试。',true);
 const latest=await readWorkspace(db,subject.id);return latest?json({error:{code:'revision_conflict',message:'服务器已有更新，请核对最新版本。',retryable:true},workspace:latest},409):failure(404,'subject_not_found','当前会话的数据不存在。');
}

async function workspaceObject(request,db,subject,path){
 const match=path.match(/^\/api\/v1\/(paths|plans|growth-records)(?:\/([^/]+))?$/);if(!match)return null;
 const [,resource,encodedId]=match,kind=resource==='growth-records'?'growth':resource,key=kind==='paths'?'path':kind==='plans'?'plan':'record';let itemId='';try{itemId=encodedId?decodeURIComponent(encodedId):'';}catch{return failure(400,'invalid_item','对象标识无效。');}
 if(request.method==='GET'){
  const workspace=await readWorkspace(db,subject.id);if(!workspace)return failure(404,'subject_not_found','当前会话的数据不存在。');const items=workspace[kind]??[];
  if(itemId){const item=items.find(value=>value.id===itemId);return item?json({apiVersion,revision:workspace.revision,[key]:item}):failure(404,'not_found','没有找到这条内容。');}
  return json({apiVersion,revision:workspace.revision,[kind]:items});
 }
 if(!['POST','PATCH','DELETE'].includes(request.method)||(request.method==='POST'&&itemId)||(request.method!=='POST'&&!itemId))return failure(405,'method_not_allowed','请求方法或对象地址不受支持。');
 return mutateWorkspace(request,db,subject,body=>{const item=body[key],action=request.method==='POST'?'create':request.method==='PATCH'?'update':'delete';if(action==='update'&&item?.id!==itemId)return null;return {kind,action,itemId,item};});
}

async function exportData(db,subject){
 const data=await readBootstrap(db,subject.id);if(!data)return failure(404,'subject_not_found','当前会话的数据不存在。');
 const date=new Date().toISOString(),filename=`personal-moat-${date.slice(0,10)}.json`;
 return json({format:'personal-moat-server-export',version:1,exportedAt:date,subject,data},200,{'Content-Disposition':`attachment; filename="${filename}"`});
}

async function deleteData(request,db,subject){
 if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
 let body;try{body=await bodyJson(request,4*1024);}catch(error){const map={unsupported_media_type:[415,'unsupported_media_type','请使用 application/json 提交内容。'],body_too_large:[413,'body_too_large','请求体过大。'],invalid_json:[400,'invalid_json','请求体不是有效 JSON。']};return failure(...map[error.code]);}
 if(body?.confirmed!==true||body.subjectId!==subject.id||!Number.isSafeInteger(body.revision)||body.revision<0)return failure(422,'deletion_confirmation_required','请重新核对删除范围并明确确认。');
 const workspace=await readWorkspace(db,subject.id);if(!workspace)return failure(404,'subject_not_found','当前会话的数据不存在。');
 if(workspace.revision!==body.revision)return json({error:{code:'revision_conflict',message:'服务器数据已有更新，请重新核对删除范围。',retryable:true},workspace},409);
 const result=await db.prepare('DELETE FROM subjects WHERE id=?1 AND EXISTS (SELECT 1 FROM workspaces WHERE subject_id=?1 AND revision=?2)').bind(subject.id,body.revision).run(),changes=Number(result?.meta?.changes??result?.changes??0);
 if(changes<1){const latest=await readWorkspace(db,subject.id);return latest?json({error:{code:'revision_conflict',message:'服务器数据已有更新，请重新核对删除范围。',retryable:true},workspace:latest},409):failure(404,'subject_not_found','当前会话的数据不存在。');}
 return json({apiVersion,deleted:true,scope:'server_subject'},200,{'Set-Cookie':cookie('',0)});
}

export function createWorker({modelFetcher=globalThis.fetch}={}){
 return {async fetch(request,env){
  const path=new URL(request.url).pathname;
  const limited=await edgeGuard(request,env??{});
  if(limited)return json({error:{code:limited.code,message:limited.status===429?'请求较频繁，请稍后重试。':'请求保护暂不可用，请稍后重试。',retryable:true}},limited.status,{'Retry-After':'60'});
  if(path==='/api/v1/health'&&['GET','HEAD'].includes(request.method)){const response=json({status:'ok',apiVersion});return request.method==='HEAD'?new Response(null,{status:response.status,headers:response.headers}):response;}
  if(path==='/api/v1/capabilities'&&request.method==='GET')return json({apiVersion,persistence:{mode:'d1',durable:true,freeTierFailClosed:true},profileWrites:{changeSets:true,revisionScope:'profile',idempotencyRequired:true},workspaceWrites:{aggregateEnabled:false},objectWrites:{resources:['paths','plans','growth-records'],proofConfirmation:true,emptyWorkspaceImport:true,revisionScope:'workspace',idempotencyRequired:true},identity:{anonymousSession:true,account:false},analysis:analysisCapabilities(env??{})});
  if(!env?.DB)return failure(503,'storage_unavailable','数据服务尚未配置。',true);
  try{
   if(path==='/api/v1/session'&&request.method==='POST')return await createSession(request,env.DB);
   if(path==='/api/v1/visits')return request.method==='POST'?await recordVisit(request,env.DB):failure(405,'method_not_allowed','请求方法不受支持。');
   if(path==='/api/v1/admin/visits')return request.method==='GET'?await visitorStats(request,env):failure(405,'method_not_allowed','请求方法不受支持。');
   if(path==='/api/v1/session'&&request.method==='GET'){const subject=await subjectFor(request,env.DB);return subject?json({session:{subject}}):failure(401,'session_required','需要先建立产品会话。');}
   if(path==='/api/v1/session'&&request.method==='DELETE'){
    if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
    const token=tokenFrom(request);if(token)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?1').bind(await digest(token)).run();
    return json({apiVersion,signedOut:true,scope:'current_session'},200,{'Set-Cookie':cookie('',0)});
   }
   if(['/api/v1/profile','/api/v1/workspace','/api/v1/bootstrap'].includes(path)){
    if(request.method!=='GET')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');
    if(path==='/api/v1/profile'){const data=await readProfile(env.DB,subject.id);return data?json({apiVersion,...data}):failure(404,'subject_not_found','当前会话的数据不存在。');}
    if(path==='/api/v1/workspace'){const workspace=await readWorkspace(env.DB,subject.id);return workspace?json({apiVersion,workspace}):failure(404,'subject_not_found','当前会话的数据不存在。');}
    const data=await readBootstrap(env.DB,subject.id);
    return data?json({apiVersion,subject,data}):failure(404,'subject_not_found','当前会话的数据不存在。');
   }
   if(['/api/v1/analyses/rules','/api/v1/analyses/model'].includes(path)){
    if(request.method!=='POST')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');
    if(!sameOrigin(request))return failure(403,'origin_rejected','请求来源未通过校验。');
    let body;try{body=await bodyJson(request,64*1024);}catch(error){const status={unsupported_media_type:415,body_too_large:413,invalid_json:400}[error.code];if(!status)throw error;return failure(status,error.code,'请核对本轮整理输入。');}
    if(!validateRulesSession(body?.session).ok)return failure(422,'invalid_analysis_input','请补齐本轮经历、行动和成果输入。');
    if(path.endsWith('/rules'))return json({apiVersion,analysis:{mode:'rules',ruleVersion:'0.1',proposal:runRulesAnalysis(body.session)}});
    const result=await analyzeWithModel(env,subject.id,body.session,{fetcher:modelFetcher,signal:request.signal});
    if(result.error)return json({error:{code:result.error,message:result.status===429?'整理仍在进行或请求较频繁，请稍后再试。':'云端整理尚未启用。',retryable:true}},result.status,result.retryAfter?{'Retry-After':String(result.retryAfter)}:{});
    return json({apiVersion,analysis:result.analysis});
   }
   if(path==='/api/v1/profile/change-sets'){
    if(request.method!=='POST')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');
    return await writeProfile(request,env.DB,subject);
   }
   if(path==='/api/v1/data/export'){
    if(request.method!=='GET')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);return subject?await exportData(env.DB,subject):failure(401,'session_required','需要先建立产品会话。');
   }
   if(path==='/api/v1/data'){
    if(request.method!=='DELETE')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);return subject?await deleteData(request,env.DB,subject):failure(401,'session_required','需要先建立产品会话。');
   }
   if(path==='/api/v1/imports/workspace'){
    if(request.method!=='POST')return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');
    return await mutateWorkspace(request,env.DB,subject,body=>({kind:'workspace',action:'import',workspace:body.workspace,confirmed:body.confirmed}));
   }
   const proofRoute=path.match(/^\/api\/v1\/growth-records\/([^/]+)\/proof$/);
   if(proofRoute){
    if(!['POST','DELETE'].includes(request.method))return failure(405,'method_not_allowed','请求方法不受支持。');
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');let itemId;try{itemId=decodeURIComponent(proofRoute[1]);}catch{return failure(400,'invalid_item','对象标识无效。');}
    return await mutateWorkspace(request,env.DB,subject,body=>({kind:'growth',action:request.method==='POST'?'confirm-proof':'revoke-proof',itemId,confirmed:body.confirmed,selection:body.selection}));
   }
   if(/^\/api\/v1\/(paths|plans|growth-records)(?:\/[^/]+)?$/.test(path)){
    const subject=await subjectFor(request,env.DB);if(!subject)return failure(401,'session_required','需要先建立产品会话。');
    return await workspaceObject(request,env.DB,subject,path);
   }
   return failure(404,'not_found','接口不存在。');
  }catch(error){if(error?.code==='stored_data_invalid')return failure(503,'stored_data_invalid','服务器数据未通过结构校验，请保留本地内容并停止覆盖。');return d1Limit(error)?failure(503,'free_tier_exhausted','今日免费数据额度已用尽，请稍后再试。',true):failure(503,'storage_unavailable','数据服务暂时不可用，请保留当前输入后重试。',true);}
 }};
}

export default createWorker();
