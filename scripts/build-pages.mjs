import {mkdtemp,mkdir,copyFile,cp,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const tests=(await readdir(path.join(root,'tests'))).filter(file=>file.endsWith('.test.mjs')).sort().map(file=>'tests/'+file);
for(const args of [['--test',...tests],['scripts/check.mjs']]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
// Each build gets a fresh directory; never clean or upload the repository root.
const output=await mkdtemp(path.join(tmpdir(),'moat-pages-'));
await cp(path.join(root,'frontend'),path.join(output,'frontend'),{recursive:true});
await cp(path.join(root,'shared'),path.join(output,'shared'),{recursive:true});
await copyFile(path.join(root,'frontend/index.html'),path.join(output,'index.html'));
for(const file of ['three-rivers/terrain-v1.png','three-rivers/rivers-watercolor-hires-clean.svg','fonts/LXGWWenKaiLite-Regular.ttf','fonts/OFL.txt']){
 const target=path.join(output,'assets',file);
 await mkdir(path.dirname(target),{recursive:true});
 await copyFile(path.join(root,'assets',file),target);
}
console.log(`Pages output: ${output}`);
