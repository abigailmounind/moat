import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir,access,rm} from 'node:fs/promises';
import path from 'node:path';
import pages from '../cloudflare/pages-worker.mjs';
import {packagePages} from '../scripts/lib/pages-package.mjs';

test('Pages API preserves origin, cookie, body, idempotency, URL and response headers',async()=>{
 const request=new Request('https://preview.moat.test/api/v1/paths?next=https://untrusted.invalid',{method:'POST',headers:{Origin:'https://foreign.invalid',Cookie:'moat_session=synthetic','Idempotency-Key':'retry','CF-Connecting-IP':'192.0.2.10','Content-Type':'application/json'},body:'{"revision":0}'});
 const downstream=Response.json({revision:1},{headers:{'Set-Cookie':'moat_session=synthetic; HttpOnly; Secure; SameSite=Lax','Idempotency-Replayed':'true','Cache-Control':'no-store'}});
 const response=await pages.fetch(request,{MOAT_API:{async fetch(received){
  assert.equal(received.url,request.url);assert.equal(received.method,'POST');assert.equal(received.redirect,'manual');
  for(const key of ['Origin','Cookie','Idempotency-Key','CF-Connecting-IP','Content-Type'])assert.equal(received.headers.get(key),request.headers.get(key));
  assert.equal(await received.text(),'{"revision":0}');return downstream;
 }},ASSETS:{fetch(){throw Error('API must not fall through to assets');}}});
 assert.equal(response,downstream);
});

test('missing, failed, redirecting or HTML API bindings fail closed without leaking errors',async()=>{
 for(const MOAT_API of [undefined,{fetch:async()=>{throw Error('synthetic-private-error');}},{fetch:async()=>Response.redirect('https://untrusted.invalid')},{fetch:async()=>new Response('<html>SPA fallback</html>',{headers:{'Content-Type':'text/html'}})},{fetch:async()=>new Response('callback({})',{headers:{'Content-Type':'application/jsonp'}})}]){
  const response=await pages.fetch(new Request('https://moat.test/api/v1/session'),{MOAT_API,ASSETS:{fetch(){throw Error('must not fall back');}}});
  assert.equal(response.status,503);assert.equal(response.headers.get('Cache-Control'),'no-store');assert.equal(response.headers.get('Retry-After'),'60');
  const value=await response.json();assert.equal(value.error.code,'api_unavailable');assert.ok(!JSON.stringify(value).includes('synthetic-private-error'));
 }
});

test('staging examples separate the API/database from production and keep models off',async()=>{
 const api=JSON.parse(await readFile(new URL('../wrangler.example.jsonc',import.meta.url),'utf8'));
 const pageConfig=JSON.parse((await readFile(new URL('../wrangler.pages.example.jsonc',import.meta.url),'utf8')).replace(/^\s*\/\/.*$/gm,''));
 const staging=api.env.staging;
 assert.notEqual(staging.name,api.name);assert.equal(staging.workers_dev,false);assert.equal(staging.preview_urls,false);
 assert.notEqual(staging.d1_databases[0].database_id,api.d1_databases[0].database_id);
 assert.equal(staging.vars.MOAT_MODEL_ENABLED,'false');assert.equal(staging.vars.MOAT_PUBLIC_API_ENABLED,'true');
 assert.equal(pageConfig.services[0].service,staging.name);assert.equal(pageConfig.services[0].binding,'MOAT_API');
 assert.deepEqual(pageConfig.env.preview.services,pageConfig.services);
 assert.ok(!JSON.stringify(pageConfig).includes('ALIYUN_DASHSCOPE_API_KEY'));
});

test('backend 401/409/429 and export responses pass through unchanged; non-API stays static',async()=>{
 for(const status of [200,401,409,429,503]){
  const downstream=Response.json({status},{status,headers:{'Retry-After':'5','Content-Disposition':'attachment; filename="export.json"'}});
  assert.equal(await pages.fetch(new Request('https://moat.test/api'),{MOAT_API:{fetch:async()=>downstream}}),downstream);
 }
 for(const url of ['/?view=sync','/frontend/src/main.js','/assets/three-rivers/terrain-v1.png','/apiary']){
  const request=new Request(new URL(url,'https://moat.test')),staticResponse=new Response('asset');
  assert.equal(await pages.fetch(request,{MOAT_API:{fetch(){throw Error('no API request');}},ASSETS:{fetch:async received=>{assert.equal(received,request);return staticResponse;}}}),staticResponse);
 }
});

test('Pages packages preserve static default and isolate backend/config from both outputs',async()=>{
 for(const withApi of [false,true]){
  const output=await packagePages({withApi});
  try{
   assert.deepEqual((await readdir(output)).sort(),(withApi?['_routes.json','_worker.js','assets','frontend','index.html','shared']:['assets','frontend','index.html','shared']).sort());
   assert.equal(await readFile(path.join(output,'index.html'),'utf8'),await readFile(new URL('../frontend/index.html',import.meta.url),'utf8'));
   for(const file of ['backend','cloudflare','.env','.dev.vars','wrangler.jsonc','wrangler.pages.jsonc','node_modules'])await assert.rejects(access(path.join(output,file)),{code:'ENOENT'});
   if(withApi){
    assert.equal(await readFile(path.join(output,'_worker.js'),'utf8'),await readFile(new URL('../cloudflare/pages-worker.mjs',import.meta.url),'utf8'));
    assert.deepEqual(JSON.parse(await readFile(path.join(output,'_routes.json'),'utf8')),{version:1,include:['/api','/api/*'],exclude:[]});
   }
  }finally{await rm(output,{recursive:true,force:true});}
 }
});
