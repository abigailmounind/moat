import assert from 'node:assert/strict';

// Keep the runtime's native fetch. Only the outbound HTTP service is simulated,
// so unsupported Request options are caught before any provider request occurs.
export async function runModelRuntimeCheck({Miniflare,convertV4MiniflareOptions,build,root}){
 const session={id:'runtime-model-check',answers:[{questionId:'q3',kind:'experience',value:'project',skipped:false},{questionId:'q4',kind:'actions',value:['organize'],skipped:false},{questionId:'q5',kind:'outcome',value:{outcomes:['artifact'],source:null},skipped:false}]};
 const bundle=await build({absWorkingDir:root,bundle:true,format:'esm',platform:'browser',write:false,stdin:{resolveDir:root,contents:`
 import {createAliyunModelProvider} from './backend/aliyun-model-provider.mjs';
 export default {async fetch(){
  const provider=createAliyunModelProvider({apiKey:'synthetic-key-no-real-secret',models:['synthetic-model'],freeOnlyConfirmed:true});
  try{return Response.json({proposal:await provider.analyze(${JSON.stringify(session)})});}
  catch{return Response.json({rejected:true},{status:502});}
 }};`}});
 let calls=0,redirect=false;
 const options={modules:true,script:bundle.outputFiles[0].text,compatibilityDate:'2026-09-12',outboundService:async request=>{
  calls++;assert.equal(new URL(request.url).hostname,'dashscope-intl.aliyuncs.com');
  if(redirect)return new Response(null,{status:302,headers:{Location:'https://must-not-follow.invalid'}});
  const body=await request.json(),input=JSON.parse(body.messages[1].content);
  assert.deepEqual(input.session,session);
  return Response.json({choices:[{message:{content:JSON.stringify(input.rules_reference)}}]});
 }};
 const runtime=new Miniflare(convertV4MiniflareOptions?convertV4MiniflareOptions(options):options);
 try{
  const first=await runtime.dispatchFetch('https://runtime.test');assert.equal(first.status,200);assert.equal((await first.json()).proposal.session_id,session.id);assert.equal(calls,1);
  redirect=true;const second=await runtime.dispatchFetch('https://runtime.test');assert.equal(second.status,502);assert.equal(calls,2,'redirect must not produce another outbound request');
  console.log('Native workerd model fetch passed: valid output and redirect rejection, no external requests.');
 }finally{await runtime.dispose();}
}
