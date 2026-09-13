// Two real local Workers joined by a service binding. Only synthetic data; never
// read deployment config/secrets or access the deployed Pages site.
import assert from 'node:assert/strict';
import {readFile,readdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {packagePages} from './lib/pages-package.mjs';
import {runPagesConnections} from '../tests/fixtures/pages-connection-check.mjs';

const require=createRequire(import.meta.resolve('wrangler'));
const {Miniflare,convertV4MiniflareOptions}=require('miniflare'),{build}=require('esbuild');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=await packagePages({withApi:true});let staticOutput,runtime;
const run=(script,url,...flags)=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[script,url,...flags],{cwd:root,stdio:'inherit'});
 const timer=setTimeout(()=>{child.kill();reject(Error(`${script}: timed out`));},60000);
 child.once('error',error=>{clearTimeout(timer);reject(error);});
 child.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(Error(`${script}: exit ${code}`));});
});
try{
 // Pages removes its special files from static serving; the local asset binding
 // uses a static-only copy to reproduce this, without exposing _worker.js.
 staticOutput=await packagePages();
 const proxy=await readFile(path.join(output,'_worker.js'),'utf8');
 const routes=JSON.parse(await readFile(path.join(output,'_routes.json'),'utf8'));
 assert.deepEqual(routes,{version:1,include:['/api','/api/*'],exclude:[]});
 const bundle=await build({absWorkingDir:root,entryPoints:['cloudflare/worker.mjs'],bundle:true,format:'esm',platform:'browser',write:false});
 const options={host:'127.0.0.1',port:0,workers:[
  {name:'moat-pages-local',modules:true,script:proxy,compatibilityDate:'2026-09-12',serviceBindings:{MOAT_API:'moat-pages-api'},assets:{directory:staticOutput,binding:'ASSETS',run_worker_first:routes.include,routerConfig:{has_user_worker:true}}},
  {name:'moat-pages-api',modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-12',d1Databases:{DB:'moat-pages-local-d1'},bindings:{MOAT_PUBLIC_API_ENABLED:'true',MOAT_MODEL_ENABLED:'false'},ratelimits:{API_RATE_LIMITER:{namespace_id:'2101',simple:{limit:120,period:60}},SESSION_RATE_LIMITER:{namespace_id:'2102',simple:{limit:10,period:60}}}}
 ]};
 runtime=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
 const base=await runtime.ready,db=await runtime.getD1Database('DB','moat-pages-api');
 const migrations=new URL('../cloudflare/migrations/',import.meta.url);
 for(const name of (await readdir(migrations)).filter(name=>name.endsWith('.sql')).sort()){
  const sql=await readFile(new URL(name,migrations),'utf8');await db.batch(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>db.prepare(s)));
 }
 await run('scripts/check-pages.mjs',base.origin,'--require-api');
 const probe=await fetch(new URL('/api/v1/health',base),{signal:AbortSignal.timeout(10000)});
 assert.equal(probe.status,200,`Local service-binding health: ${await probe.text()}`);
 await run('scripts/check-cloudflare-local.mjs',base.origin);
 await runPagesConnections(base);
 const get=(route,options={})=>fetch(new URL(route,base),{...options,signal:AbortSignal.timeout(10000),redirect:'manual'});
 const caps=await get('/api/v1/capabilities');assert.equal((await caps.json()).analysis.model,'disabled');
 const denied=await get('/api/v1/session',{method:'POST',headers:{Origin:'https://foreign.invalid'}});assert.equal(denied.status,403);assert.equal((await denied.json()).error.code,'origin_rejected');
 const anonymous=await get('/api/v1/workspace');assert.equal(anonymous.status,401);
 const missing=await get('/api/v1/missing');assert.equal(missing.status,404);assert.match(missing.headers.get('content-type'),/application\/json/);
 let limited=false;
 for(let i=0;i<12;i++){
  const response=await get('/api/v1/session',{method:'POST',headers:{Origin:base.origin}});
  if(response.status===429){assert.equal((await response.json()).error.code,'rate_limited');limited=true;break;}
  assert.equal(response.status,201);
 }
 assert.equal(limited,true,'Real service-bound requests must reach the session rate limiter');
 assert.equal((await get('/?view=sync')).status,200,'Static pages remain available after API throttling');
 console.log('Pages API integration passed: packaged proxy, real service binding/D1, static modules, frontend connections, CSRF, cookies and edge throttling. Model disabled.');
}finally{
 try{await runtime?.dispose();}finally{
  await rm(output,{recursive:true,force:true});if(staticOutput)await rm(staticOutput,{recursive:true,force:true});
 }
}
