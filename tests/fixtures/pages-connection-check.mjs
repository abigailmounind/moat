import assert from 'node:assert/strict';
import {createWorkspaceConnection} from '../../frontend/src/workspace-connection.js';
import {createExplorationProfileConnection} from '../../frontend/src/exploration-connection.js';
import {createProductAnalysisAdapter} from '../../frontend/src/analysis-client.js';
import {analysisEvaluationCases} from './analysis-evaluation-cases.mjs';

export async function runPagesConnections(base){
 let cookie='',loseResponse=false;const values=new Map();
 const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 const locks=()=>({request:async(name,work)=>work()});
 const fetcher=async(route,options={})=>{
  const headers=new Headers(options.headers);headers.set('Origin',base.origin);if(cookie)headers.set('Cookie',cookie);
  const response=await fetch(new URL(route,base),{...options,headers,redirect:'manual',signal:options.signal??AbortSignal.timeout(10000)});
  if(response.headers.has('Set-Cookie')){
   const value=response.headers.get('Set-Cookie');assert.match(value,/HttpOnly/);assert.match(value,/Secure/);assert.match(value,/SameSite=Lax/);cookie=value.split(';')[0];
  }
  if(loseResponse&&headers.has('Idempotency-Key')){loseResponse=false;await response.arrayBuffer();throw Error('synthetic_lost_response');}
  return response;
 };
 const workspace=createWorkspaceConnection({storage,fetcher,locks});
 const preview=await workspace.preview();assert.equal(preview.ok,true,JSON.stringify(preview));assert.equal(workspace.active(),false);
 assert.equal((await workspace.enable(preview)).ok,true);assert.equal(workspace.active(),true);
 const profile=createExplorationProfileConnection({storage,fetcher,locks});
 const profilePreview=await profile.preview();assert.equal(profilePreview.ok,true,JSON.stringify(profilePreview));assert.equal(profilePreview.subjectId,preview.subjectId);
 assert.equal((await profile.enable(profilePreview)).ok,true);
 const changeSet={id:'pages-confirmed-change',sessionId:'pages-profile-session',scope:{unknowns:['pages-unknown']},operations:[{type:'keep_unknown',entityId:'pages-unknown',payload:{id:'pages-unknown',topic:'direction',reason:'not_asked',confirmation_status:'confirmed'}}]};
 loseResponse=true;
 const lost=await profile.commit(profile.readActive().profile,changeSet);assert.equal(lost.code,'network');assert.ok(profile.status().state.pending);
 const restored=createExplorationProfileConnection({storage,fetcher,locks});
 assert.equal((await restored.retry()).ok,true);assert.equal(restored.readActive().revision,1);assert.equal(restored.status().state.pending,null);
 assert.ok(restored.readActive().profile.unknowns['pages-unknown']);assert.equal(workspace.readActive().data.revision,0);
 const adapter=createProductAnalysisAdapter({fetchImpl:fetcher});assert.equal(await adapter.available(),false);
 const rules=await fetcher('/api/v1/analyses/rules',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:analysisEvaluationCases[0].session})});assert.equal(rules.status,200);assert.equal((await rules.json()).analysis.mode,'rules');
 const exported=await fetcher('/api/v1/data/export');assert.equal(exported.status,200);assert.match(exported.headers.get('Content-Disposition'),/attachment/);assert.equal((await exported.json()).data.profileRevision,1);
 const deleted=await fetcher('/api/v1/data',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({confirmed:true,subjectId:preview.subjectId,revision:0})});assert.equal(deleted.status,200);assert.equal((await deleted.json()).deleted,true);
 assert.equal((await fetcher('/api/v1/session')).status,401);
 console.log('Pages frontend protocol: explicit workspace/profile connections, lost-response retry, rules, export/delete and cookie invalidation passed.');
}
