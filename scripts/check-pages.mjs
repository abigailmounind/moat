import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

const origin=new URL(process.argv[2]).origin;
const get=async route=>{
 const response=await fetch(origin+route,{signal:AbortSignal.timeout(15000)});
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
