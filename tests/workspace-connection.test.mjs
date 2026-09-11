import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {createWorkspaceConnection,CONNECTION_KEY} from '../frontend/src/workspace-connection.js';
import {WORKSPACE_KEY} from '../frontend/src/workspace-model.js';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {createProductService} from '../backend/product-service.mjs';
import {emptyWorkspace} from '../shared/workspace.js';
import {pathItem} from './fixtures/product-workspace.mjs';

async function setup(){
 const repository=createMemoryProductRepository();repository.durable=true;
 const session=repository.createAnonymousSession(),service=createProductService({repository});
 const local={...emptyWorkspace(),paths:[pathItem('local')]},values=new Map([[WORKSPACE_KEY,JSON.stringify(local)]]);
 let failAfterWrite=false,failCache=false,loseResponse=false,failRead=false,cookie='moat_session='+session.token,key=0,queue=Promise.resolve();
 const calls=[];
 const storage={removeItem(k){if(failCache)throw Error('quota');values.delete(k);},getItem:k=>values.get(k)??null,setItem(k,v){if(failCache)throw Error('quota');values.set(k,v);}};
 const locks={request(name,work){const result=queue.then(work,work);queue=result.catch(()=>{});return result;}};
 const fetcher=async(route,options)=>{
  calls.push({route,...options});
  if(failRead&&route==='/api/v1/workspace')return {ok:false,status:404,json:async()=>({error:{code:'subject_not_found'}})};
  const req=Readable.from(options.body?[options.body]:[]);
  Object.assign(req,{method:options.method,url:route,headers:{host:'localhost',origin:'http://localhost',cookie,...Object.fromEntries(Object.entries(options.headers).map(([k,v])=>[k.toLowerCase(),v]))}});
  const res={writeHead(status){this.status=status;},end(body){this.body=JSON.parse(body);}};
  await service(req,res);
  if(failAfterWrite&&(options.headers['Idempotency-Key']||route==='/api/v1/data'))failCache=true;
  if(loseResponse&&(options.headers['Idempotency-Key']||route==='/api/v1/data')){loseResponse=false;throw Error('response lost');}
  return {ok:res.status<400,status:res.status,json:async()=>res.body};
 };
 const create=(lockProvider=()=>locks)=>createWorkspaceConnection({storage,fetcher,newKey:()=>`key-${++key}`,locks:lockProvider});
 const connection=create(),preview=await connection.preview();assert.equal(preview.ok,true);
 assert.equal((await connection.enable(preview)).ok,true);
 return {connection,create,repository,subject:session.subject,values,calls,local,setFailAfterWrite:v=>{failAfterWrite=v;},setFailCache:v=>{failCache=v;},loseNext:()=>{loseResponse=true;},setFailRead:v=>{failRead=v;},setCookie:v=>{cookie=v;}};
}

test('响应丢失后重建连接，用原请求重试并读取最新版本，保留本地副本',async()=>{
 const h=await setup(),base=h.connection.readActive().data;
 h.loseNext();assert.equal((await h.connection.saveItem(base,'paths',pathItem())).code,'network');
 const pending=h.connection.status().state.pending;
 assert.equal((await h.repository.readWorkspace(h.subject.id)).revision,1);
 assert.equal((await h.connection.useLocal()).code,'pending');
 await h.repository.mutateWorkspace(h.subject.id,1,{kind:'paths',action:'update',itemId:'path-1',item:{...pathItem(),notes:'服务器后续修改'}},{idempotencyKey:'external'});
 const retry=await h.create().retry();assert.equal(retry.ok,true);assert.equal(retry.data.paths[0].notes,'服务器后续修改');
 const requests=h.calls.filter(c=>c.headers['Idempotency-Key']===pending.key);assert.equal(requests.length,2);assert.equal(requests[0].body,requests[1].body);
 assert.equal(h.values.get(WORKSPACE_KEY),JSON.stringify(h.local));
});

test('提交前缓存失败不发送写请求；会话失效或换主体不提交数据',async()=>{
 const h=await setup(),base=h.connection.readActive().data;
 h.setFailCache(true);assert.equal((await h.connection.saveItem(base,'paths',pathItem())).code,'cache_failed');
 assert.equal(h.calls.filter(c=>c.headers['Idempotency-Key']).length,0);
 h.setFailCache(false);h.setCookie('');assert.equal((await h.connection.saveItem(base,'paths',pathItem())).code,'session_required');
 const other=h.repository.createAnonymousSession();h.setCookie('moat_session='+other.token);
 assert.equal((await h.connection.retry()).code,'subject_changed');
 assert.equal((await h.repository.readWorkspace(other.subject.id)).revision,0);
});

test('共享锁下两个标签的陈旧提交被拒绝，不覆盖已保存编辑',async()=>{
 const h=await setup(),second=h.create(),base=h.connection.readActive().data;
 const results=await Promise.all([h.connection.saveItem(base,'paths',pathItem()),second.saveItem(base,'paths',pathItem('second'))]);
 assert.equal(results[0].ok,true);assert.equal(results[1].code,'local_changed');
 assert.equal((await h.repository.readWorkspace(h.subject.id)).paths.length,1);
});

test('服务已提交但后续读取失败仍保留原回执，恢复后安全重试',async()=>{
 const h=await setup(),base=h.connection.readActive().data;
 h.setFailRead(true);assert.equal((await h.connection.saveItem(base,'paths',pathItem())).ok,false);
 assert.ok(h.connection.status().state.pending);
 h.setFailRead(false);assert.equal((await h.connection.retry()).ok,true);
 assert.equal((await h.repository.readWorkspace(h.subject.id)).revision,1);
});


test('服务提交后的缓存失败保留旧缓存与待提交记录，恢复后不重复创建',async()=>{
 const h=await setup(),base=h.connection.readActive().data;
 h.setFailAfterWrite(true);
 assert.equal((await h.connection.saveItem(base,'paths',pathItem())).code,'cache_failed');
 assert.equal(h.connection.status().state.cache.revision,0);
 assert.ok(h.connection.status().state.pending);
 h.setFailAfterWrite(false);h.setFailCache(false);
 assert.equal((await h.create().retry()).ok,true);
 assert.equal((await h.repository.readWorkspace(h.subject.id)).revision,1);
});

test('导入响应丢失期间保持本地模式，重试成功才启用服务器且保留原件',async()=>{
 const h=await setup();await h.connection.useLocal();
 const preview=await h.connection.preview();h.loseNext();
 assert.equal((await h.connection.enable(preview,{importLocal:true})).code,'network');
 assert.equal(h.connection.active(),false);assert.ok(h.connection.status().state.pending);
 const restored=h.create();assert.equal((await restored.retry()).ok,true);assert.equal(restored.active(),true);
 assert.deepEqual(restored.readActive().data.paths,h.local.paths);
 assert.equal(h.values.get(WORKSPACE_KEY),JSON.stringify(h.local));
});


test('缺失、读取异常或取得锁失败时，不联网也不更改连接和待重试记录',async()=>{
 const h=await setup(),base=h.connection.readActive().data;
 h.loseNext();await h.connection.saveItem(base,'paths',pathItem());
 const before=JSON.stringify([...h.values]),calls=h.calls.length;
 for(const provider of [()=>undefined,()=>{throw Error('denied');},()=>({request:async()=>{throw Error('denied');}})]){
  const c=h.create(provider);
  for(const operation of [()=>c.refresh(),()=>c.preview(),()=>c.retry(),()=>c.useLocal(),()=>c.enable({}),()=>c.saveItem(base,'paths',pathItem('new'))]){
   const result=await operation();assert.equal(result.code,'lock_unavailable');
  }
  assert.deepEqual(c.readActive().data,base);
 }
 assert.equal(JSON.stringify([...h.values]),before);assert.equal(h.calls.length,calls);
 assert.equal((await h.connection.retry()).ok,true);
});

test('无 Web Locks 的纯本地读写仍可用，不触发服务器连接',async()=>{
 const h=await setup();await h.connection.useLocal();
 const c=h.create(()=>undefined),calls=h.calls.length,base=c.readActive().data;
 assert.equal((await c.refresh()).ok,true);
 const saved=c.saveItem(base,'paths',pathItem('offline'));
 assert.equal(saved.ok,true);assert.ok(saved.data.paths.some(p=>p.id==='offline'));
 assert.equal(h.calls.length,calls);
});


test('导出后删除只清服务器连接缓存，本地副本保持不变',async()=>{
 const h=await setup(),exported=await h.connection.exportData();assert.equal(exported.ok,true);
 assert.equal((await h.connection.deleteData(exported.snapshot)).ok,false);
 assert.equal((await h.connection.deleteData(exported.snapshot,{confirmed:true})).deleted,true);
 assert.equal(h.values.has(CONNECTION_KEY),false);assert.equal(h.values.get(WORKSPACE_KEY),JSON.stringify(h.local));
 assert.equal(await h.repository.readWorkspace(h.subject.id),null);
});

test('删除响应丢失保留标记且阻止新会话和写入，用户可单独清理缓存',async()=>{
 const h=await setup(),exported=await h.connection.exportData();h.loseNext();
 const result=await h.connection.deleteData(exported.snapshot,{confirmed:true});assert.equal(result.ok,false);assert.equal(result.deleted,undefined);
 assert.equal(h.connection.status().state.deletion,'pending');
 const calls=h.calls.length;assert.equal((await h.connection.preview()).code,'deletion_pending');assert.equal(h.calls.length,calls);
 assert.equal((await h.create().detachDeleted({confirmed:true})).ok,true);
 assert.equal(h.values.get(WORKSPACE_KEY),JSON.stringify(h.local));
});

test('导出后出现新版本则拒绝删除，保留连接与服务端内容',async()=>{
 const h=await setup(),exported=await h.connection.exportData();
 await h.connection.saveItem(h.connection.readActive().data,'paths',pathItem());
 assert.equal((await h.connection.deleteData(exported.snapshot,{confirmed:true})).code,'revision_conflict');
 assert.equal(h.connection.status().state.deletion,null);assert.ok(await h.repository.readWorkspace(h.subject.id));
});


test('服务确认删除但缓存清理失败时如实报告并允许独立清理',async()=>{
 const h=await setup(),exported=await h.connection.exportData();h.setFailAfterWrite(true);
 const result=await h.connection.deleteData(exported.snapshot,{confirmed:true});
 assert.equal(result.ok,false);assert.equal(result.deleted,true);assert.equal(result.code,'cache_failed');
 assert.ok(h.connection.status().state.deletion);assert.equal(await h.repository.readWorkspace(h.subject.id),null);
 h.setFailCache(false);assert.equal((await h.connection.detachDeleted({confirmed:true})).ok,true);
 assert.equal(h.values.get(WORKSPACE_KEY),JSON.stringify(h.local));
});


test('另一标签删除连接后，旧服务器草稿不得转存原始本地工作区',async()=>{
 const h=await setup(),other=h.create(),old=other.readActive().data;
 const snapshot=(await h.connection.exportData()).snapshot;
 await h.connection.deleteData(snapshot,{confirmed:true});
 const before=h.values.get(WORKSPACE_KEY);
 for(const attempt of [()=>other.saveItem(old,'paths',pathItem('stale')),()=>other.deleteRecord(old,'paths','local'),()=>other.confirmProof(old,'missing',{}),()=>other.revokeProof(old,'missing')]){
  assert.equal((await attempt()).code,'local_changed');
 }
 assert.equal(h.values.get(WORKSPACE_KEY),before);
 const current=other.readActive().data;assert.equal((await other.saveItem(current,'paths',pathItem('fresh'))).ok,true);
});

test('切换保存位置后旧本地草稿也不能写入服务器，保存结果继续带来源',async()=>{
 const h=await setup();await h.connection.useLocal();
 const local=h.connection.readActive().data;
 const saved=await h.connection.saveItem(local,'paths',pathItem('local-edit'));
 const preview=await h.connection.preview();await h.connection.enable(preview);
 assert.equal((await h.connection.saveItem(saved.data,'paths',pathItem('stale'))).code,'local_changed');
 assert.equal((await h.repository.readWorkspace(h.subject.id)).paths.length,0);
});
