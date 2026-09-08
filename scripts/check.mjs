import {readFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
for(const file of ['index.html','src/app.js','src/data.js','src/state.js','src/map.js','src/styles.css','assets/three-rivers/terrain-v1.png'])await access(path.join(root,file));
const app=await readFile(path.join(root,'src/app.js'),'utf8'),css=await readFile(path.join(root,'src/styles.css'),'utf8');
assert.ok(css.includes('prefers-reduced-motion'));assert.ok(app.includes('visibilitychange'));
assert.ok(!app.includes('data-toast'));console.log('Entry, assets and motion safeguards checked.');
