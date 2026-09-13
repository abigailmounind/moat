import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const args=process.argv.slice(2);
if(!args[0]||args.length>2||(args[1]&&args[1]!=='--require-api'))throw Error('Usage: node scripts/check-pages.mjs <origin> [--require-api]');
const base=new URL(args[0]);
assert.ok(['http:','https:'].includes(base.protocol)&&!base.username&&!base.password,'Expected a site URL without credentials');
const origin=base.origin;
const get=async route=>{
 const response=await fetch(origin+route,{signal:AbortSignal.timeout(15000),redirect:'error'});
 assert.equal(response.status,200,`${route}: HTTP ${response.status}`);
 return response;
};
for(const view of ['','?demo=1','?view=explore','?view=paths','?view=plans','?view=growth','?view=sync']){
 const response=await get('/'+view);
 assert.match(response.headers.get('content-type')||'',/text\/html/);
 assert.match(await response.text(),/src="\/frontend\/src\/main.js"/);
}
const queue=['/frontend/src/main.js'],seen=new Set();
while(queue.length){
 const route=queue.shift();if(seen.has(route))continue;seen.add(route);
 const response=await get(route);
 assert.match(response.headers.get('content-type')||'',/(java|ecma)script/,route);
 const source=await response.text();
 const parsed=spawnSync(process.execPath,['--input-type=module','--check'],{input:source,encoding:'utf8'});
 assert.equal(parsed.status,0,`${route}: ${parsed.stderr||parsed.error||''}`);
 for(const [,dependency] of source.matchAll(/['"]((?:\.{1,2}\/)[^'"]+\.js)['"]/g))queue.push(new URL(dependency,origin+route).pathname);
}
assert.ok(seen.has('/frontend/src/growth.js'));
for(const [route,type] of [
 ['/frontend/src/styles.css','text/css'],['/frontend/src/workspaces.css','text/css'],
 ['/assets/three-rivers/terrain-v1.png','image/png'],
 ['/assets/three-rivers/rivers-watercolor-hires-clean.svg','image/svg+xml'],
 ['/assets/fonts/LXGWWenKaiLite-Regular.ttf','font/ttf']
])assert.ok((await get(route)).headers.get('content-type')?.startsWith(type),route);
console.log(`Pages HTTP checks passed: 7 routes, ${seen.size} parsed modules and 5 resources (${origin}).`);
if(args[1]==='--require-api'){
 // Read-only first-stage release gate: no session creation, personal data writes,
 // or model invocation. The rules-only staging deployment must stay model-off.
 const health=await get('/api/v1/health');assert.match(health.headers.get('content-type')||'',/application\/json/);assert.equal((await health.json()).status,'ok');
 const capsResponse=await get('/api/v1/capabilities');assert.match(capsResponse.headers.get('content-type')||'',/application\/json/);
 assert.equal(capsResponse.headers.get('Cache-Control'),'no-store');assert.equal(capsResponse.headers.has('Set-Cookie'),false);
 const caps=await capsResponse.json();assert.equal(caps.apiVersion,'1');assert.equal(caps.persistence?.mode,'d1');assert.equal(caps.persistence?.durable,true);
 assert.equal(caps.analysis?.model,'disabled');assert.ok(caps.analysis?.serviceModes?.includes('rules'));assert.equal(caps.workspaceWrites?.aggregateEnabled,false);
 const anonymous=await fetch(origin+'/api/v1/workspace',{signal:AbortSignal.timeout(15000),redirect:'error'});assert.equal(anonymous.status,401);assert.equal((await anonymous.json()).error.code,'session_required');
 const missing=await fetch(origin+'/api/v1/not-a-route',{signal:AbortSignal.timeout(15000),redirect:'error'});assert.equal(missing.status,404);assert.equal((await missing.json()).error.code,'not_found');
 console.log('Pages read-only API gate passed: same-origin JSON, D1 capability, rules-only, anonymous isolation and unknown-route handling. No database writes or model calls.');
}
