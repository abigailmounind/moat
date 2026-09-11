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
const moduleCount=await checkModules(path.join(root,'frontend/src'))+await checkModules(path.join(root,'shared'));
console.log(`Browser module syntax checked: ${moduleCount} files.`);
for(const file of ['shared/profile.js','shared/workspace.js','shared/workspace-operations.js','backend/product-repository.mjs','backend/postgres-repository.mjs','backend/postgres-migrations.mjs','backend/product-runtime.mjs','scripts/check-product-http.mjs','scripts/check-postgres.mjs'])await access(path.join(root,file));
for(const file of ['backend/server.mjs','backend/product-service.mjs','backend/analysis-service.mjs','frontend/index.html','frontend/src/main.js','frontend/src/app.js','frontend/src/sidebar.js','frontend/src/exploration.js','frontend/src/exploration-state.js','frontend/src/exploration-domain.js','frontend/src/exploration-analysis.js','frontend/src/exploration-storage.js','frontend/src/workspaces.js','frontend/src/workspace-model.js','frontend/src/workspaces.css','frontend/src/growth.js','frontend/src/workspace-form.js','frontend/src/data.js','frontend/src/state.js','frontend/src/map.js','frontend/src/styles.css','assets/three-rivers/terrain-v1.png'])await access(path.join(root,file));
const app=await readFile(path.join(root,'frontend/src/app.js'),'utf8'),exploration=await readFile(path.join(root,'frontend/src/exploration.js'),'utf8'),css=await readFile(path.join(root,'frontend/src/styles.css'),'utf8');
assert.ok(css.includes('prefers-reduced-motion'));assert.ok(app.includes('visibilitychange'));
assert.ok(css.includes(".explore-shell:before")&&css.includes("url('/assets/three-rivers/terrain-v1.png')"));
assert.ok(exploration.includes('data-understanding-card')&&exploration.includes('preventScroll:true'));
assert.ok(!app.includes('data-toast'));console.log('Entry, assets and motion safeguards checked.');
