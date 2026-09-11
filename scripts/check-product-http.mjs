import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {emptyWorkspace} from '../shared/workspace.js';

// Start an isolated ephemeral server; never reuse or stop a user's preview process.
const child=spawn(process.execPath,['scripts/serve.mjs'],{cwd:fileURLToPath(new URL('../',import.meta.url)),env:{...process.env,DATABASE_URL:'',MOAT_PREVIEW_PORT:'0'},stdio:['ignore','pipe','pipe']});
const closed=once(child,'close');
let stderr='';child.stderr.on('data',chunk=>{stderr+=chunk;});
try{
 const origin=await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('Product HTTP server startup timed out.')),10000);
  let output='';
  child.stdout.on('data',chunk=>{output+=chunk;const match=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(match){clearTimeout(timer);resolve(match[0]);}});
  child.once('error',error=>{clearTimeout(timer);reject(error);});
  child.once('exit',code=>{clearTimeout(timer);reject(Error(`Product HTTP server exited (${code}): ${stderr}`));});
 });
 const get=(route,options={})=>fetch(origin+route,{...options,signal:AbortSignal.timeout(5000)});
 assert.equal((await get('/')).status,200);
 const capabilities=await (await get('/api/v1/capabilities')).json();
 assert.equal(capabilities.persistence.durable,false);
 assert.equal(capabilities.workspaceWrites.idempotency.header,'Idempotency-Key');

 // Follow every module path (including the entry's conditional dynamic imports).
 const queue=['/shared/understanding.js','/frontend/src/main.js'],seen=new Set();
 while(queue.length){
  const route=queue.shift();if(seen.has(route))continue;seen.add(route);
  const response=await get(route);assert.equal(response.status,200,route);assert.match(response.headers.get('content-type'),/^text\/javascript/);
  const source=await response.text();
  for(const [,dependency] of source.matchAll(/['"]((?:\.{1,2}\/)[^'"]+\.js)['"]/g))queue.push(new URL(dependency,origin+route).pathname);
 }
 assert.ok(seen.has('/shared/understanding.js'));assert.ok(seen.has('/shared/profile.js'));assert.ok(seen.has('/shared/workspace.js'));assert.ok(seen.has('/shared/workspace-operations.js'));
 assert.deepEqual(capabilities.objectWrites.resources,['paths','plans','growth-records']);
 for(const route of ['/backend/product-repository.mjs','/shared/private.js','/AGENTS.md'])assert.equal((await get(route)).status,404);
 assert.equal((await get('/shared/workspace.js',{method:'POST'})).status,405);

 const session=await get('/api/v1/session',{method:'POST',headers:{origin}});assert.equal(session.status,201);
 const cookie=session.headers.get('set-cookie').split(';')[0];
 const headers={origin,cookie,'content-type':'application/json','idempotency-key':'http-smoke-1'};
 const body=JSON.stringify({revision:0,workspace:emptyWorkspace()});
 const saves=await Promise.all(Array.from({length:4},()=>get('/api/v1/workspace',{method:'PUT',headers,body})));
 for(const response of saves){assert.equal(response.status,200);assert.equal((await response.json()).workspace.revision,1);}
 assert.equal(saves.filter(response=>response.headers.get('idempotency-replayed')==='false').length,1);
 const conflict=await get('/api/v1/workspace',{method:'PUT',headers,body:JSON.stringify({revision:1,workspace:{...emptyWorkspace(),revision:1}})});
 assert.equal(conflict.status,409);assert.equal((await conflict.json()).error.code,'idempotency_conflict');
 const bootstrap=await get('/api/v1/bootstrap',{headers:{cookie}});assert.equal((await bootstrap.json()).data.workspace.revision,1);
 assert.equal((await get('/api/v1/workspace')).status,401);
 const other=await get('/api/v1/session',{method:'POST',headers:{origin}});
 const otherCookie=other.headers.get('set-cookie').split(';')[0];
 assert.equal((await (await get('/api/v1/workspace',{headers:{cookie:otherCookie}})).json()).workspace.revision,0);
 const exported=await get('/api/v1/data/export',{headers:{cookie}});assert.equal(exported.status,200);
 assert.match(exported.headers.get('content-disposition'),/attachment/);
 const snapshot=await exported.json();assert.equal(snapshot.data.workspace.revision,1);
 const removal=await get('/api/v1/data',{method:'DELETE',headers,body:JSON.stringify({confirmed:true,subjectId:snapshot.subject.id,revision:1})});
 assert.equal(removal.status,200);assert.equal((await removal.json()).deleted,true);
 assert.match(removal.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await get('/api/v1/data/export',{headers:{cookie}})).status,401);
 assert.equal((await get('/api/v1/workspace',{headers:{cookie:otherCookie}})).status,200);
 console.log(`Product HTTP checks passed: ${seen.size} browser modules, session isolation, concurrent retries, conflict handling, data export and deletion.`);
}finally{
 child.kill('SIGTERM');
 await closed;
}
