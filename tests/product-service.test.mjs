import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createMemoryProductRepository,createProductService} from '../backend/product-service.mjs';
import {emptyWorkspace} from '../shared/workspace.js';

async function request(service,{method='GET',url='/api/v1/health',cookie='',origin='http://127.0.0.1:4173',body,rawBody,headers={}}={}){
 const req=Readable.from(rawBody===undefined?(body===undefined?[]:[JSON.stringify(body)]):[rawBody]);req.method=method;req.url=url;req.headers={host:'127.0.0.1:4173',origin,...(body===undefined&&rawBody===undefined?{}:{'content-type':'application/json'}),...(cookie?{cookie}:{}),...headers};
 const res=new EventEmitter();
 res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};
 res.end=value=>{res.body=value?JSON.parse(value):null;};
 await service(req,res);return res;
}

test('product API reports an explicit non-AI, volatile development mode',async()=>{
 const service=createProductService();
 const health=await request(service),capabilities=await request(service,{url:'/api/v1/capabilities'});
 assert.equal(health.status,200);assert.equal(health.body.apiVersion,'1');
 assert.equal(capabilities.status,200);assert.deepEqual(capabilities.body.analysis.availableModes,['rules','manual']);
 assert.equal(capabilities.body.analysis.model,'disabled');assert.equal(capabilities.body.persistence.durable,false);
});

test('anonymous sessions are server assigned, cookie scoped and isolated',async()=>{
 let token=0,id=0;
 const repository=createMemoryProductRepository({tokenFactory:()=>`token-${++token}`,idFactory:()=>`subject-${++id}`});
 const service=createProductService({repository});
 const rejected=await request(service,{method:'POST',url:'/api/v1/session',origin:'https://elsewhere.invalid'});
 assert.equal(rejected.status,403);
 const first=await request(service,{method:'POST',url:'/api/v1/session'}),second=await request(service,{method:'POST',url:'/api/v1/session'});
 assert.equal(first.status,201);assert.equal(second.status,201);
 assert.notEqual(first.body.session.subject.id,second.body.session.subject.id);
 const firstCookie=first.headers['Set-Cookie'].split(';')[0],secondCookie=second.headers['Set-Cookie'].split(';')[0];
 assert.match(first.headers['Set-Cookie'],/HttpOnly/);assert.match(first.headers['Set-Cookie'],/SameSite=Lax/);
 const firstSession=await request(service,{url:'/api/v1/session',cookie:firstCookie}),secondSession=await request(service,{url:'/api/v1/session',cookie:secondCookie});
 assert.equal(firstSession.body.session.subject.id,'subject-1');assert.equal(secondSession.body.session.subject.id,'subject-2');
 assert.equal((await request(service,{url:'/api/v1/session',cookie:'moat_session=unknown'})).status,401);
});

test('bootstrap derives ownership from the server session and starts with valid empty data',async()=>{
 const service=createProductService({repository:createMemoryProductRepository({tokenFactory:()=> 'known-token',idFactory:()=> 'known-subject'})});
 const created=await request(service,{method:'POST',url:'/api/v1/session'}),cookie=created.headers['Set-Cookie'].split(';')[0];
 const bootstrap=await request(service,{url:'/api/v1/bootstrap?subject=someone-else',cookie});
 assert.equal(bootstrap.status,200);assert.equal(bootstrap.body.subject.id,'known-subject');
 assert.deepEqual(bootstrap.body.data.workspace,{version:1,revision:0,paths:[],plans:[],growth:[]});
 assert.deepEqual(bootstrap.body.data.profile,{evidence:{},capitalLinks:{},riverLinks:{},unknowns:{},appliedChangeSets:[]});
 assert.equal((await request(service,{url:'/api/v1/bootstrap'})).status,401);
});

test('product API errors have stable machine codes without internal details',async()=>{
 const response=await request(createProductService(),{url:'/api/v1/missing'});
 assert.equal(response.status,404);assert.deepEqual(Object.keys(response.body.error),['code','message','retryable']);
 assert.equal(response.body.error.code,'not_found');
});


test('workspace API enforces ownership, validation and optimistic concurrency',async()=>{
 let token=0,id=0;
 const repository=createMemoryProductRepository({tokenFactory:()=>'workspace-token-'+(++token),idFactory:()=>'workspace-subject-'+(++id)});
 const service=createProductService({repository});
 const first=await request(service,{method:'POST',url:'/api/v1/session'});
 const second=await request(service,{method:'POST',url:'/api/v1/session'});
 const firstCookie=first.headers['Set-Cookie'].split(';')[0];
 const secondCookie=second.headers['Set-Cookie'].split(';')[0];
 const initial=await request(service,{url:'/api/v1/workspace',cookie:firstCookie});
 assert.equal(initial.status,200);assert.equal(initial.body.workspace.revision,0);
 const saved=await request(service,{method:'PUT',url:'/api/v1/workspace',cookie:firstCookie,body:{revision:0,workspace:initial.body.workspace}});
 assert.equal(saved.status,200);assert.equal(saved.body.workspace.revision,1);
 const stale=await request(service,{method:'PUT',url:'/api/v1/workspace',cookie:firstCookie,body:{revision:0,workspace:initial.body.workspace}});
 assert.equal(stale.status,409);assert.equal(stale.body.error.code,'revision_conflict');assert.equal(stale.body.workspace.revision,1);
 const other=await request(service,{url:'/api/v1/workspace',cookie:secondCookie});
 assert.equal(other.status,200);assert.equal(other.body.workspace.revision,0);
 const invalid=await request(service,{method:'PUT',url:'/api/v1/workspace',cookie:firstCookie,body:{revision:1,workspace:{version:1,revision:1,paths:[],plans:[],growth:[{id:'bad'}]}}});
 assert.equal(invalid.status,422);assert.equal(invalid.body.error.code,'invalid_workspace');
 const rejected=await request(service,{method:'PUT',url:'/api/v1/workspace',cookie:firstCookie,origin:'https://elsewhere.invalid',body:{revision:1,workspace:saved.body.workspace}});
 assert.equal(rejected.status,403);assert.equal(rejected.body.error.code,'origin_rejected');
});

const asyncRepository=repository=>Object.fromEntries(Object.entries(repository).map(([key,value])=>[key,typeof value==='function'?async(...args)=>{await new Promise(resolve=>setImmediate(resolve));return value(...args);}:value]));
async function signedIn(repository=createMemoryProductRepository()){
 const service=createProductService({repository}),session=await request(service,{method:'POST',url:'/api/v1/session'});
 const cookie=session.headers['Set-Cookie'].split(';')[0];
 const put=({revision=0,workspace=emptyWorkspace(),key='operation-1',...rest}={})=>request(service,{method:'PUT',url:'/api/v1/workspace',cookie,body:{revision,workspace},headers:{'idempotency-key':key},...rest});
 return {service,cookie,put};
}

test('async repositories support all session, read and write endpoints',async()=>{
 const {service,cookie,put}=await signedIn(asyncRepository(createMemoryProductRepository()));
 const current=await request(service,{url:'/api/v1/session',cookie});assert.equal(current.status,200);
 const resumed=await request(service,{method:'POST',url:'/api/v1/session',cookie});assert.equal(resumed.status,200);assert.deepEqual(resumed.body,current.body);
 assert.equal((await request(service,{url:'/api/v1/bootstrap',cookie})).body.data.workspace.revision,0);
 assert.equal((await put()).body.workspace.revision,1);
 assert.equal((await request(service,{url:'/api/v1/workspace',cookie})).body.workspace.revision,1);
});

test('concurrent retries have one commit and the same response, while independent stale writes conflict',async()=>{
 const {service,cookie,put}=await signedIn(asyncRepository(createMemoryProductRepository()));
 const retries=await Promise.all(Array.from({length:8},()=>put()));
 for(const result of retries){assert.equal(result.status,200);assert.equal(result.body.workspace.revision,1);assert.deepEqual(result.body,retries[0].body);}
 assert.equal(retries.filter(result=>result.headers['Idempotency-Replayed']==='false').length,1);
 assert.equal(retries.filter(result=>result.headers['Idempotency-Replayed']==='true').length,7);
 const workspace=retries[0].body.workspace;
 const writes=await Promise.all([put({revision:1,workspace,key:'new-1'}),put({revision:1,workspace,key:'new-2'})]);
 assert.deepEqual(writes.map(result=>result.status).sort(),[200,409]);
 assert.equal((await request(service,{url:'/api/v1/workspace',cookie})).body.workspace.revision,2);
 const replay=await put();assert.deepEqual(replay.body,retries[0].body);
 const conflict=await put({revision:1,workspace});assert.equal(conflict.status,409);assert.equal(conflict.body.error.code,'idempotency_conflict');assert.equal(conflict.body.error.retryable,false);
});

test('replay still requires the original session and accepted origin',async()=>{
 const {put}=await signedIn();await put();
 assert.equal((await put({cookie:''})).status,401);
 assert.equal((await put({cookie:'moat_session=someone-else'})).status,401);
 assert.equal((await put({origin:'https://elsewhere.invalid'})).status,403);
});

test('repository failures return a safe retryable error and preserve the previous workspace',async()=>{
 const memory=createMemoryProductRepository(),repository=asyncRepository(memory);
 const {service,cookie,put}=await signedIn(repository);
 const write=repository.writeWorkspace;
 repository.writeWorkspace=async()=>{throw Error('secret database detail and private content');};
 const failed=await put();
 assert.equal(failed.status,503);assert.deepEqual(failed.body,{error:{code:'storage_unavailable',message:'数据服务暂时不可用，请保留当前输入后重试。',retryable:true}});
 assert.equal((await request(service,{url:'/api/v1/workspace',cookie})).body.workspace.revision,0);
 repository.writeWorkspace=write;
 assert.equal((await put()).body.workspace.revision,1);
 for(const [method,url,httpMethod] of [['readWorkspace','/api/v1/workspace','GET'],['readBootstrap','/api/v1/bootstrap','GET'],['findSession','/api/v1/session','GET'],['createAnonymousSession','/api/v1/session','POST']]){
  const broken={...asyncRepository(memory),[method]:async()=>{throw Error('private details');}};
  const result=await request(createProductService({repository:broken}),{method:httpMethod,url,cookie:method==='createAnonymousSession'?'':cookie});
  assert.equal(result.status,503);assert.equal(result.body.error.code,'storage_unavailable');assert.ok(!JSON.stringify(result.body).includes('private details'));
 }
});

test('a response lost after commit can be recovered with the same key',async()=>{
 const repository=asyncRepository(createMemoryProductRepository()),write=repository.writeWorkspace;
 let loseResponse=true;
 repository.writeWorkspace=async(...args)=>{const result=await write(...args);if(loseResponse){loseResponse=false;throw Error('response interrupted');}return result;};
 const {put}=await signedIn(repository);
 assert.equal((await put()).status,503);
 const retry=await put();assert.equal(retry.status,200);assert.equal(retry.body.workspace.revision,1);assert.equal(retry.headers['Idempotency-Replayed'],'true');
});

test('bad request bodies, content types, keys and revisions do not consume a retry key',async()=>{
 const {put}=await signedIn();
 for(const [options,status,code] of [
  [{rawBody:'{'},400,'invalid_json'],
  [{rawBody:'null'},422,'invalid_workspace'],
  [{rawBody:'x'.repeat(256*1024+1)},413,'body_too_large'],
  [{headers:{'content-type':'text/plain'}},415,'unsupported_media_type'],
  [{headers:{'content-type':'application/jsonp'}},415,'unsupported_media_type'],
  [{key:''},400,'invalid_idempotency_key'],
  [{key:['one','two']},400,'invalid_idempotency_key'],
  [{revision:-1},422,'invalid_workspace'],
  [{revision:Number.MAX_SAFE_INTEGER,workspace:{...emptyWorkspace(),revision:Number.MAX_SAFE_INTEGER}},422,'invalid_workspace'],
  [{workspace:{...emptyWorkspace(),plans:[null]}},422,'invalid_workspace']
 ]){const result=await put(options);assert.equal(result.status,status);assert.equal(result.body.error.code,code);}
 const saved=await put();assert.equal(saved.status,200);assert.equal(saved.body.workspace.revision,1);
});

test('capacity failures preserve live receipts and report a retryable response',async()=>{
 const {service,put}=await signedIn(createMemoryProductRepository({maxKeysPerSubject:1}));
 assert.equal((await request(service,{url:'/api/v1/capabilities'})).body.workspaceWrites.idempotency.maxKeysPerSubject,1);
 const saved=await put();
 const full=await put({revision:1,workspace:saved.body.workspace,key:'new'});
 assert.equal(full.status,503);assert.equal(full.body.error.code,'idempotency_capacity');assert.equal(full.body.error.retryable,true);
 assert.deepEqual((await put()).body,saved.body);
});
