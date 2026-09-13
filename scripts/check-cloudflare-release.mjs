// Local-only release check: disposable real D1/workerd, no .env, cloud or model calls.
import assert from 'node:assert/strict';
import {readFile,readdir,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {runReleaseGuards} from '../tests/fixtures/cloudflare-release-check.mjs';
import {runModelRuntimeCheck} from '../tests/fixtures/model-runtime-check.mjs';
import {reserveCounter} from '../cloudflare/model-gateway.mjs';

// Use Wrangler's installed toolchain, without relying on a global installation.
const require=createRequire(import.meta.resolve('wrangler'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const bundle=await build({absWorkingDir:root,entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
const temporary=await mkdtemp(join(tmpdir(),'moat-d1-release-'));
const options={name:'moat-release-test',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-12',host:'127.0.0.1',port:0,d1Databases:{DB:'moat-release-d1'},d1Persist:temporary};
const start=()=>new Miniflare(convertV4MiniflareOptions?{...convertV4MiniflareOptions(options),resourcePersistencePath:temporary,isolatedResourcePersistencePath:temporary}:options);
let runtime;
const runHttp=url=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('./check-cloudflare-local.mjs',import.meta.url)),url],{cwd:root,stdio:'inherit'});
 const timer=setTimeout(()=>{child.kill();reject(Error('Local HTTP check timed out'));},60000);
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`Local HTTP check exited ${code}`));});
});
try{
 await runModelRuntimeCheck({Miniflare,convertV4MiniflareOptions,build,root});
 runtime=start();
 const url=await runtime.ready,db=await runtime.getD1Database('DB');
 const migrations=new URL('../cloudflare/migrations/',import.meta.url);
 for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(name,migrations),'utf8');
  await db.batch(sql.split(';').map(part=>part.trim()).filter(Boolean).map(part=>db.prepare(part)));
  if(name==='0001_foundation.sql')await db.batch([
   db.prepare("INSERT INTO subjects(id,kind,created_at) VALUES('upgrade-test','anonymous','2026-09-12T00:00:00Z')"),
   db.prepare("INSERT INTO idempotency_receipts(subject_id,operation_key,fingerprint,response_json,expires_at) VALUES('upgrade-test','old-key','old-fingerprint','{}','2026-09-13T00:00:00Z')")
  ]);
 }
 const old=await db.prepare("SELECT fingerprint,owner FROM idempotency_receipts WHERE subject_id='upgrade-test'").first();
 assert.deepEqual(old,{fingerprint:'old-fingerprint',owner:null});
 await runHttp(url.href);
 await runReleaseGuards(db);
 const counters=(await db.prepare('SELECT scope,window,used,subject_id FROM model_counters ORDER BY scope,window').all()).results;
 assert.ok(counters.length>0);
 await runtime.dispose();runtime=start();await runtime.ready;
 const restarted=await runtime.getD1Database('DB');
 assert.deepEqual((await restarted.prepare('SELECT scope,window,used,subject_id FROM model_counters ORDER BY scope,window').all()).results,counters);
 const global=counters.find(row=>row.scope==='global');assert.ok(global);
 assert.equal(await reserveCounter(restarted,'global',global.window,global.used),false);
 console.log('Cloudflare release guards passed: migrations, real D1 transactions, runtime restart, durable model budgets and frontend adapter. No real provider requests.');
}finally{
 try{await runtime?.dispose();}finally{await rm(temporary,{recursive:true,force:true});}
}
