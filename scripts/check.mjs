import {readFile,access,readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Parse every browser module, including pages reached only by dynamic import.
// --check does not execute modules or require a DOM, storage, or a server.
async function checkModules(directory){
 let count=0;
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);
  if(entry.isDirectory())count+=await checkModules(file);
  else if(/\.(m?js)$/.test(entry.name)){
   const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
   assert.equal(result.status,0,`Module syntax failed: ${path.relative(root,file)}\n${result.stderr||result.error||''}`);
   count++;
  }
 }
 return count;
}
const moduleCount=await checkModules(path.join(root,'frontend/src'))+await checkModules(path.join(root,'shared'))+await checkModules(path.join(root,'cloudflare'));
console.log(`Browser module syntax checked: ${moduleCount} files.`);
for(const file of ['shared/profile.js','shared/profile-changes.js','shared/rules-analysis.js','shared/workspace.js','shared/workspace-operations.js','backend/product-repository.mjs','backend/postgres-repository.mjs','backend/postgres-migrations.mjs','backend/product-runtime.mjs','backend/aliyun-model-provider.mjs','scripts/check-product-http.mjs','scripts/check-postgres.mjs'])await access(path.join(root,file));
for(const file of ['wrangler.example.jsonc','.dev.vars.example','cloudflare/README.md','cloudflare/migrations/0001_foundation.sql','cloudflare/migrations/0002_release_guards.sql','scripts/check-cloudflare-local.mjs','scripts/check-cloudflare-release.mjs'])await access(path.join(root,file));
for(const file of ['scripts/check-cloudflare-release.mjs','tests/fixtures/cloudflare-release-check.mjs','scripts/build-pages.mjs','scripts/lib/pages-package.mjs','scripts/check-pages-api.mjs','scripts/check-pages.mjs','tests/fixtures/pages-connection-check.mjs']){
 const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});
 assert.equal(result.status,0,`Release check syntax failed: ${file}\n${result.stderr||result.error||''}`);
}
for(const file of ['cloudflare/pages-routes.json','wrangler.pages.example.jsonc','cloudflare/migrations/0003_visitor_stats.sql'])await access(path.join(root,file));
for(const file of ['backend/server.mjs','backend/product-service.mjs','backend/analysis-service.mjs','frontend/index.html','frontend/src/main.js','frontend/src/app.js','frontend/src/sidebar.js','frontend/src/exploration.js','frontend/src/exploration-state.js','frontend/src/exploration-domain.js','frontend/src/exploration-analysis.js','frontend/src/exploration-storage.js','frontend/src/workspaces.js','frontend/src/workspace-model.js','frontend/src/workspaces.css','frontend/src/growth.js','frontend/src/workspace-form.js','frontend/src/data.js','frontend/src/state.js','frontend/src/map.js','frontend/src/styles.css','assets/three-rivers/terrain-v1.png'])await access(path.join(root,file));
const app=await readFile(path.join(root,'frontend/src/app.js'),'utf8'),exploration=await readFile(path.join(root,'frontend/src/exploration.js'),'utf8'),css=await readFile(path.join(root,'frontend/src/styles.css'),'utf8');
assert.ok(css.includes('prefers-reduced-motion'));assert.ok(app.includes('visibilitychange'));
assert.ok(css.includes(".explore-shell:before")&&css.includes("url('/assets/three-rivers/terrain-v1.png')"));
assert.ok(exploration.includes('data-understanding-card')&&exploration.includes('preventScroll:true'));
assert.ok(exploration.includes('data-model-consent')&&exploration.includes('阿里云百炼新加坡')&&exploration.includes('不会发送已有个人档案'));
assert.ok(!app.includes('data-toast'));console.log('Entry, assets and motion safeguards checked.');
