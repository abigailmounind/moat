import {mkdtemp,mkdir,copyFile,cp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../../',import.meta.url));
// Packaging only. The CLI runs all checks before calling this; integration tests
// call it directly to avoid recursive test execution. Always create a fresh tree.
export async function packagePages({withApi=false}={}){
 const output=await mkdtemp(path.join(tmpdir(),'moat-pages-'));
 try{
  await cp(path.join(root,'frontend'),path.join(output,'frontend'),{recursive:true});
  await cp(path.join(root,'shared'),path.join(output,'shared'),{recursive:true});
  await copyFile(path.join(root,'frontend/index.html'),path.join(output,'index.html'));
  for(const file of ['three-rivers/terrain-v1.png','three-rivers/rivers-watercolor-hires-clean.svg','fonts/LXGWWenKaiLite-Regular.ttf','fonts/OFL.txt']){
   const target=path.join(output,'assets',file);
   await mkdir(path.dirname(target),{recursive:true});await copyFile(path.join(root,'assets',file),target);
  }
  if(withApi){
   await copyFile(path.join(root,'cloudflare/pages-worker.mjs'),path.join(output,'_worker.js'));
   await copyFile(path.join(root,'cloudflare/pages-routes.json'),path.join(output,'_routes.json'));
  }
  return output;
 }catch(error){await rm(output,{recursive:true,force:true});throw error;}
}
