import {readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {packagePages} from './lib/pages-package.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if(args.length>1||args.some(arg=>arg!=='--with-api'))throw Error('Usage: node scripts/build-pages.mjs [--with-api]');
const tests=(await readdir(path.join(root,'tests'))).filter(file=>file.endsWith('.test.mjs')).sort().map(file=>'tests/'+file);
for(const args of [['--test',...tests],['scripts/check.mjs']]){
 const result=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
 if(result.error)throw result.error;
 if(result.status!==0)process.exit(result.status||1);
}
const output=await packagePages({withApi:args.includes('--with-api')});
console.log(`Pages output: ${output}`);
console.log(args.includes('--with-api')?'API mode: requires MOAT_API service binding; no deployment performed.':'Static mode: no Worker or API binding added.');
