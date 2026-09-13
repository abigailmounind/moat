import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createExplorationProfileConnection,PROFILE_CONNECTION_KEY} from '../frontend/src/exploration-connection.js';
import {storageKey} from '../frontend/src/exploration-storage.js';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {createProductService} from '../backend/product-service.mjs';
import {createPrototypeProfile} from '../shared/profile.js';

const changeSet=id=>({id,sessionId:'browser-profile',scope:{unknowns:['browser_unknown']},operations:[{type:'keep_unknown',entityId:'browser_unknown',payload:{id:'browser_unknown',topic:'direction',reason:'not_asked',input_refs:[],explanation:'继续保持未知。',confirmation_status:'confirmed'}}]});

async function setup({localProfile=createPrototypeProfile()}={}){
 const repository=createMemoryProductRepository();repository.durable=true;
 const session=repository.createAnonymousSession(),service=createProductService({repository});
 const values=new Map([[storageKey,JSON.stringify({version:1,kind:'user_local',savedAt:'2026-09-12T00:00:00.000Z',profile:localProfile})]]);
 let cookie='moat_session='+session.token,loseResponse=false,key=0,queue=Promise.resolve();
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const locks={request(name,work){const result=queue.then(work,work);queue=result.catch(()=>{});return result;}};
 const fetcher=async(route,options)=>{
  const req=Readable.from(options.body?[options.body]:[]);Object.assign(req,{method:options.method,url:route,headers:{host:'localhost',origin:'http://localhost',cookie,...Object.fromEntries(Object.entries(options.headers).map(([k,v])=>[k.toLowerCase(),v]))}});
  const res={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};await service(req,res);
  if(loseResponse&&options.headers['Idempotency-Key']){loseResponse=false;throw Error('lost');}
  return {ok:res.status<400,status:res.status,json:async()=>res.body};
 };
 const create=()=>createExplorationProfileConnection({storage,fetcher,newKey:()=>`profile-${++key}`,locks:()=>locks});
 return {connection:create(),create,repository,session,values,lose:()=>{loseResponse=true;},setCookie:value=>{cookie=value;}};
}

test('档案连接先预览再启用，默认不改动浏览器档案',async()=>{
 const h=await setup(),before=h.values.get(storageKey),preview=await h.connection.preview();
 assert.equal(preview.ok,true);assert.equal(h.connection.active(),false);
 assert.equal((await h.connection.enable(preview)).ok,true);assert.equal(h.connection.active(),true);
 assert.equal(h.values.get(storageKey),before);assert.equal(h.connection.readActive().revision,0);
});

test('只复制确认档案，响应丢失后用原幂等请求安全恢复',async()=>{
 const local={...createPrototypeProfile(),unknowns:{browser_unknown:changeSet('seed').operations[0].payload}};
 const h=await setup({localProfile:local}),preview=await h.connection.preview();h.lose();
 assert.equal((await h.connection.enable(preview,{importLocal:true})).code,'network');
 assert.equal(h.connection.active(),false);assert.ok(h.connection.status().state.pending);
 const retried=await h.create().retry();assert.equal(retried.ok,true);assert.equal(retried.revision,1);
 assert.deepEqual((await h.repository.readProfile(h.session.subject.id)).profile.unknowns,local.unknowns);
 assert.ok(h.values.has(storageKey));
});

test('服务端档案提交使用独立版本，冲突与会话切换不覆盖内容',async()=>{
 const h=await setup(),preview=await h.connection.preview();await h.connection.enable(preview);
 const base=h.connection.readActive().profile;
 await h.repository.applyProfileChangeSet(h.session.subject.id,0,changeSet('change_external'),{idempotencyKey:'external'});
 const conflict=await h.connection.commit(base,changeSet('change_browser'));assert.equal(conflict.code,'revision_conflict');
 assert.equal(h.connection.status().state.pending,null);
 const other=h.repository.createAnonymousSession();h.setCookie('moat_session='+other.token);
 assert.equal((await h.connection.refresh()).code,'subject_changed');assert.equal((await h.repository.readProfile(other.subject.id)).revision,0);
});

test('未启用服务器时沿用本地冲突检查，缺少 Web Locks 不发起连接',async()=>{
 const h=await setup(),base=h.connection.readActive().profile;
 const local=await h.connection.commit(base,changeSet('change_local'));assert.equal(local.ok,true);assert.equal(h.connection.active(),false);
 const unavailable=createExplorationProfileConnection({storage:{getItem:k=>h.values.get(k)??null,setItem:(k,v)=>h.values.set(k,v)},fetcher:()=>{throw Error('should not fetch');},locks:()=>undefined});
 assert.equal((await unavailable.preview()).code,'lock_unavailable');
 assert.equal(h.values.has(PROFILE_CONNECTION_KEY),false);
});

test('服务端主体删除后显式清理档案缓存，浏览器原档案保留',async()=>{
 const h=await setup(),preview=await h.connection.preview();await h.connection.enable(preview);
 const local=h.values.get(storageKey);
 assert.equal((await h.connection.detachDeletedSubject(h.session.subject.id,{confirmed:true})).ok,true);
 assert.equal(h.values.has(PROFILE_CONNECTION_KEY),false);assert.equal(h.values.get(storageKey),local);
});
