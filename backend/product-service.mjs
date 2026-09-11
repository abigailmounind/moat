import {createMemoryProductRepository,idempotencyPolicy,validIdempotencyKey} from './product-repository.mjs';
export {createMemoryProductRepository} from './product-repository.mjs';

const API_VERSION='1';
const SESSION_COOKIE='moat_session';
const sessionMaxAge=60*60*24*30;
const maxWorkspaceBytes=256*1024;

async function readJsonBody(req,maxBytes=maxWorkspaceBytes){
 let size=0;const chunks=[];
 for await(const chunk of req){const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);size+=buffer.byteLength;if(size>maxBytes){const error=new Error('请求体过大。');error.code='body_too_large';throw error;}chunks.push(buffer);}
 if(!chunks.length){const error=new Error('请求体不能为空。');error.code='invalid_json';throw error;}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{const error=new Error('请求体不是有效 JSON。');error.code='invalid_json';throw error;}
}

function cookieValue(req,name){
 const raw=req.headers.cookie;
 if(typeof raw!=='string')return '';
 for(const part of raw.split(';')){
  const index=part.indexOf('=');
  if(index<0)continue;
  if(part.slice(0,index).trim()===name){try{return decodeURIComponent(part.slice(index+1).trim());}catch{return '';}}
 }
 return '';
}

function sameOrigin(req){
 const origin=req.headers.origin,host=req.headers.host;
 if(typeof origin!=='string'||typeof host!=='string')return false;
 try{const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&url.host===host;}catch{return false;}
}

function sessionCookie(req,token){
 const secure=req.socket?.encrypted?'; Secure':'';
 return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${sessionMaxAge}; HttpOnly; SameSite=Lax${secure}`;
}

export function createProductService({repository=createMemoryProductRepository(),modelConfigured=false,allowAggregateWrites=repository.durable!==true}={}){
 return async function handleProduct(req,res){
  const send=(status,value,headers={})=>{
   res.writeHead(status,{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
   res.end(req.method==='HEAD'?undefined:JSON.stringify(value));
  };
  const fail=(status,code,message,retryable=false)=>send(status,{error:{code,message,retryable}});
  try{
  const route=req.url?.split('?')[0];
  if(route==='/api/v1/health'){
   if(!['GET','HEAD'].includes(req.method)){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   send(200,{status:'ok',apiVersion:API_VERSION});return;
  }
  if(route==='/api/v1/capabilities'){
   if(req.method!=='GET'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   send(200,{apiVersion:API_VERSION,persistence:{mode:repository.kind,durable:repository.durable===true},workspaceWrites:{aggregateEnabled:allowAggregateWrites,idempotency:{header:'Idempotency-Key',required:false,...(repository.idempotency??idempotencyPolicy)}},objectWrites:{resources:['paths','plans','growth-records'],proofConfirmation:true,emptyWorkspaceImport:true,revisionScope:'workspace',idempotencyRequired:true},identity:{anonymousSession:true,account:false},analysis:{availableModes:modelConfigured?['model','rules','manual']:['rules','manual'],model:modelConfigured?'configured':'disabled',defaultMode:modelConfigured?'model':'rules'}});return;
  }
  if(route==='/api/v1/session'&&req.method==='POST'){
   if(!sameOrigin(req)){fail(403,'origin_rejected','请求来源未通过校验。');return;}
   const current=await repository.findSession(cookieValue(req,SESSION_COOKIE));
   if(current){send(200,{session:{subject:current}});return;}
   const created=await repository.createAnonymousSession();
   send(201,{session:{subject:created.subject}},{'Set-Cookie':sessionCookie(req,created.token)});return;
  }
  if(route==='/api/v1/session'&&req.method==='DELETE'){
   if(!sameOrigin(req)){fail(403,'origin_rejected','请求来源未通过校验。');return;}
   const result=await repository.revokeSession(cookieValue(req,SESSION_COOKIE));
   if(!result?.ok){fail(503,'storage_unavailable','退出尚未确认完成，请重试。',true);return;}
   send(200,{apiVersion:API_VERSION,signedOut:true,scope:'current_session'},
    {'Set-Cookie':`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${req.socket?.encrypted?'; Secure':''}`});return;
  }
  const subject=await repository.findSession(cookieValue(req,SESSION_COOKIE));
  if(route==='/api/v1/session'){
   if(req.method!=='GET'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   send(200,{session:{subject}});return;
  }
  if(route==='/api/v1/data/export'){
   if(req.method!=='GET'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   const data=await repository.readBootstrap(subject.id);
   if(!data){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
   send(200,{format:'personal-moat-server-export',version:1,exportedAt:new Date().toISOString(),subject,data},
    {'Content-Disposition':'attachment; filename="personal-moat-server-data.json"'});return;
  }
  if(route==='/api/v1/data'){
   if(req.method!=='DELETE'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   if(!sameOrigin(req)){fail(403,'origin_rejected','请求来源未通过校验。');return;}
   if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json'){fail(415,'unsupported_media_type','请使用 application/json 提交内容。');return;}
   let body;
   try{body=await readJsonBody(req,4096);}catch(error){fail(error.code==='body_too_large'?413:400,error.code,'请检查删除请求。');return;}
   if(body?.confirmed!==true||body?.subjectId!==subject.id){fail(422,'deletion_confirmation_required','请核对当前主体并明确确认删除服务端数据。');return;}
   if(!Number.isSafeInteger(body.revision)||body.revision<0){fail(422,'invalid_workspace','请提供有效的工作区版本。');return;}
   const result=await repository.deleteSubject(subject.id,body.revision);
   if(!result.ok){
    if(result.code==='revision_conflict'){fail(409,'revision_conflict','服务器已有更新，请重新导出并核对删除范围。');return;}
    if(result.code==='subject_not_found'){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
    fail(503,'storage_unavailable','删除尚未确认完成，请保留本地内容后核对。',true);return;
   }
   send(200,{apiVersion:API_VERSION,deleted:true,scope:'server_subject'},
    {'Set-Cookie':`${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${req.socket?.encrypted?'; Secure':''}`});return;
  }
  async function command(build){
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   if(!sameOrigin(req)){fail(403,'origin_rejected','请求来源未通过校验。');return;}
   if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json'){fail(415,'unsupported_media_type','请使用 application/json 提交内容。');return;}
   const idempotencyKey=req.headers['idempotency-key'];
   if(!validIdempotencyKey(idempotencyKey)){fail(400,'invalid_idempotency_key','请提供有效的幂等键。');return;}
   let body;
   try{body=await readJsonBody(req);}catch(error){const tooLarge=error.code==='body_too_large';fail(tooLarge?413:400,tooLarge?'body_too_large':'invalid_json',tooLarge?'请求体过大。':'请求体不是有效 JSON。');return;}
   const revision=body?.revision;
   if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER){fail(422,'invalid_workspace','请提供有效的工作区版本。');return;}
   const mutation=build(body);
   if(!mutation){fail(422,'invalid_item','请检查对象标识与内容。');return;}
   const result=await repository.mutateWorkspace(subject.id,revision,mutation,{idempotencyKey});
   if(result.ok){send(200,{apiVersion:API_VERSION,workspace:result.workspace},{'Idempotency-Replayed':String(result.replayed===true)});return;}
   if(result.code==='revision_conflict'){send(409,{error:{code:result.code,message:'服务器已有更新，请保留当前输入并核对最新版本。',retryable:true},workspace:result.workspace});return;}
   const errors={
    not_found:[404,'没有找到这条内容。'],subject_not_found:[404,'当前会话的数据不存在。'],
    idempotency_conflict:[409,'这个幂等键已用于不同内容，请为新的提交使用新键。'],
    already_exists:[409,'相同标识的内容已经存在。'],source_direction_conflict:[409,'这条方向已经建立了路径。'],
    import_requires_empty:[409,'服务器已有工作区内容，不能用本地副本覆盖。'],
    invalid_idempotency_key:[400,'幂等键格式无效。'],invalid_item:[422,'请检查记录内容、路径归属和河流。'],
    invalid_import:[422,'请核对本地工作区并明确确认导入。'],confirmation_required:[422,'成果证明需要单独确认或撤回。'],
    invalid_proof:[422,'请补齐行动、成果及关联解释，再确认保存。'],
    missing_path:[422,'关联路径不存在。'],unassigned:[422,'请选择所属路径。'],cross_river:[422,'请选择同河流路径。'],
    river_mismatch:[422,'计划河流与路径不一致。'],multiple_paths_not_allowed:[422,'新计划只能属于一条路径。'],
    idempotency_capacity:[503,'可保留的重试记录已满，请保留输入后稍后重试。',true]
   };
   const [status,message,retryable=false]=errors[result.code]??[503,'数据服务暂时不可用，请保留当前输入后重试。',true];
   fail(status,errors[result.code]?result.code:'storage_unavailable',message,retryable);
  }
  if(route==='/api/v1/imports/workspace'){
   if(req.method!=='POST'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   await command(body=>({kind:'workspace',action:'import',workspace:body.workspace,confirmed:body.confirmed}));return;
  }
  const proofRoute=route?.match(/^\/api\/v1\/growth-records\/([^/]+)\/proof$/);
  if(proofRoute){
   if(!['POST','DELETE'].includes(req.method)){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   let itemId;try{itemId=decodeURIComponent(proofRoute[1]);}catch{fail(400,'invalid_item','对象标识无效。');return;}
   await command(body=>({kind:'growth',action:req.method==='POST'?'confirm-proof':'revoke-proof',itemId,confirmed:body.confirmed,selection:body.selection}));return;
  }
  const objectRoute=route?.match(/^\/api\/v1\/(paths|plans|growth-records)(?:\/([^/]+))?$/);
  if(objectRoute){
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   const [,resource,encodedId]=objectRoute,kind=resource==='growth-records'?'growth':resource,key=kind==='paths'?'path':kind==='plans'?'plan':'record';
   let itemId='';try{itemId=encodedId?decodeURIComponent(encodedId):'';}catch{fail(400,'invalid_item','对象标识无效。');return;}
   if(req.method==='GET'){
    const workspace=await repository.readWorkspace(subject.id);
    if(!workspace){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
    const items=workspace[kind]??[];
    if(itemId){const item=items.find(value=>value.id===itemId);if(!item){fail(404,'not_found','没有找到这条内容。');return;}send(200,{apiVersion:API_VERSION,revision:workspace.revision,[key]:item});return;}
    send(200,{apiVersion:API_VERSION,revision:workspace.revision,[kind]:items});return;
   }
   if(!['POST','PATCH','DELETE'].includes(req.method)||(req.method==='POST'&&itemId)||(req.method!=='POST'&&!itemId)){fail(405,'method_not_allowed','请求方法或对象地址不受支持。');return;}
   await command(body=>{
    const item=body[key],action=req.method==='POST'?'create':req.method==='PATCH'?'update':'delete';
    if(action==='update'&&item?.id!==itemId)return null;
    return {kind,action,itemId,item};
   });return;
  }
  if(route==='/api/v1/workspace'){
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   if(req.method==='GET'){
    const workspace=await repository.readWorkspace(subject.id);
    if(!workspace){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
    send(200,{apiVersion:API_VERSION,workspace});return;
   }
   if(req.method!=='PUT'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   if(!allowAggregateWrites){fail(405,'aggregate_write_disabled','请使用对象接口或空工作区导入。');return;}
   if(!sameOrigin(req)){fail(403,'origin_rejected','请求来源未通过校验。');return;}
   if(String(req.headers['content-type']||'').split(';')[0].trim().toLowerCase()!=='application/json'){fail(415,'unsupported_media_type','请使用 application/json 提交工作区。');return;}
   const idempotencyKey=req.headers['idempotency-key'];
   if(idempotencyKey!==undefined&&!validIdempotencyKey(idempotencyKey)){fail(400,'invalid_idempotency_key','幂等键需为 1–128 位字母、数字或 . _ : -。');return;}
   let body;
   try{body=await readJsonBody(req);}catch(error){
    const tooLarge=error.code==='body_too_large';
    fail(tooLarge?413:400,tooLarge?'body_too_large':'invalid_json',tooLarge?'请求体过大。':'请求体不是有效 JSON。');return;
   }
   const revision=body?.revision,workspace=body?.workspace;
   if(!Number.isSafeInteger(revision)||revision<0||revision===Number.MAX_SAFE_INTEGER||!workspace){fail(422,'invalid_workspace','请提供有效的工作区版本和内容。');return;}
   const result=await repository.writeWorkspace(subject.id,revision,workspace,{idempotencyKey});
   if(!result.ok&&result.code==='idempotency_conflict'){fail(409,'idempotency_conflict','这个幂等键已用于不同内容。请为新的提交使用新键。');return;}
   if(!result.ok&&result.code==='invalid_idempotency_key'){fail(400,'invalid_idempotency_key','幂等键格式无效。');return;}
   if(!result.ok&&result.code==='idempotency_capacity'){fail(503,'idempotency_capacity','当前可安全保留的重试记录已满。请保留输入，稍后重试。',true);return;}
   if(!result.ok&&result.code==='revision_conflict'){send(409,{error:{code:'revision_conflict',message:'工作区已在其他页面修改。请重新读取后再提交。',retryable:true},workspace:result.workspace});return;}
   if(!result.ok&&result.code==='invalid_workspace'){fail(422,'invalid_workspace','请检查路径、计划、里程碑和成长记录的内容。');return;}
   if(!result.ok&&result.code==='subject_not_found'){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
   if(!result.ok){fail(503,'storage_unavailable','数据服务暂时不可用，请保留当前输入后重试。',true);return;}
   send(200,{apiVersion:API_VERSION,workspace:result.workspace},idempotencyKey===undefined?{}:{'Idempotency-Replayed':String(result.replayed===true)});return;
  }
  if(route==='/api/v1/bootstrap'){
   if(req.method!=='GET'){fail(405,'method_not_allowed','请求方法不受支持。');return;}
   if(!subject){fail(401,'session_required','需要先建立产品会话。');return;}
   const data=await repository.readBootstrap(subject.id);
   if(!data){fail(404,'subject_not_found','当前会话的数据不存在。');return;}
   send(200,{apiVersion:API_VERSION,subject,data});return;
  }
  fail(404,'not_found','接口不存在。');
  }catch{
   fail(503,'storage_unavailable','数据服务暂时不可用，请保留当前输入后重试。',true);
  }
 };
}
