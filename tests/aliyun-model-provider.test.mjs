import test from 'node:test';
import assert from 'node:assert/strict';
import {createAliyunModelProvider,createAliyunModelProviderFromEnv} from '../backend/aliyun-model-provider.mjs';
import {runRulesAnalysis} from '../shared/rules-analysis.js';

const session={id:'aliyun-provider-test',flowVersion:'stage10-minimum-v0.2',answers:[
 {questionId:'q3',kind:'experience',value:'project',skipped:false},
 {questionId:'q4',kind:'actions',value:['organize'],skipped:false},
 {questionId:'q5',kind:'outcome',value:{outcomes:['artifact'],source:null},skipped:false}
]};
const response=(status,value)=>({ok:status>=200&&status<300,status,json:async()=>value});

test('百炼通道未确认 Free Quota Only 时保持式关闭',()=>{
 assert.equal(createAliyunModelProviderFromEnv({}),null);
 assert.throws(()=>createAliyunModelProviderFromEnv({ALIYUN_DASHSCOPE_API_KEY:'x'.repeat(24),ALIYUN_FREE_MODELS:'qwen-flash'}),/aliyun_free_only_not_confirmed/);
 assert.throws(()=>createAliyunModelProvider({apiKey:'x'.repeat(24),models:['qwen-flash'],freeOnlyConfirmed:true,baseUrl:'https://example.com/v1'}),/invalid_aliyun_base_url/);
 assert.throws(()=>createAliyunModelProvider({apiKey:'x'.repeat(24),models:['qwen-flash'],freeOnlyConfirmed:true,baseUrl:'https://trial.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'}),/invalid_aliyun_base_url/);
 assert.throws(()=>createAliyunModelProvider({apiKey:'x'.repeat(24),models:['qwen-flash'],freeOnlyConfirmed:true,baseUrl:'https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'}),/invalid_aliyun_base_url/);
});

test('接受与 API Key 同属新加坡地域的 workspace 专属端点',()=>{
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,baseUrl:'https://ws-moat123.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1'});
 assert.equal(provider.status().region,'ap-southeast-1');
});

test('拒绝携带凭证、查询参数、额外路径和端口的供应商端点',()=>{
 for(const baseUrl of ['https://user:pass@dashscope-intl.aliyuncs.com/compatible-mode/v1','https://dashscope-intl.aliyuncs.com/compatible-mode/v1?key=other','https://dashscope-intl.aliyuncs.com/compatible-mode/v1#fragment','https://dashscope-intl.aliyuncs.com/prefix/compatible-mode/v1','https://dashscope-intl.aliyuncs.com:8443/compatible-mode/v1']){
  assert.throws(()=>createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,baseUrl}),/invalid_aliyun_base_url/);
 }
});

test('后台按白名单调用新加坡端点且不暴露密钥',async()=>{
 const calls=[],proposal=runRulesAnalysis(session);
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,fetcher:async(url,options)=>{calls.push({url:String(url),options});return response(200,{choices:[{message:{content:JSON.stringify(proposal)}}]});}});
 assert.deepEqual(await provider.analyze(session),proposal);assert.equal(calls.length,1);
 assert.equal(calls[0].url,'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions');
 assert.equal(calls[0].options.headers.Authorization,'Bearer secret-key-for-testing-only');assert.ok(!JSON.stringify(provider.status()).includes('secret'));
 assert.equal(calls[0].options.redirect,'manual');
 const body=JSON.parse(calls[0].options.body);assert.equal(body.model,'qwen-flash');assert.equal(body.temperature,0);assert.equal(body.messages[1].content.includes(session.id),true);
 const input=JSON.parse(body.messages[1].content);
 assert.equal(body.enable_thinking,false);assert.equal(body.max_tokens,4096);
 assert.deepEqual(input.session,session);assert.deepEqual(input.rules_reference,proposal);
 assert.ok(body.messages[0].content.includes('"evidence_drafts"'));
 assert.ok(!calls[0].options.body.includes('secret-key-for-testing-only'));
});

test('失败诊断只保留类别和状态，不回传供应商消息或输入',async()=>{
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,fetcher:async()=>response(400,{error:{code:'sensitive-provider-message',message:'private body'}})});
 await assert.rejects(provider.analyze(session),error=>{
  assert.deepEqual(error.failures,[{model:'qwen-flash',reason:'failed',category:'upstream_http',status:400}]);
  assert.ok(!JSON.stringify(error).includes('sensitive-provider-message'));assert.ok(!JSON.stringify(error).includes('private body'));return true;
 });
});

test('供应商重定向在解析正文前拒绝，不继续发送凭证',async()=>{
 let calls=0,cancelled=false;
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash','qwen-plus'],freeOnlyConfirmed:true,fetcher:async()=>{calls++;return {status:302,body:{cancel:async()=>{cancelled=true;}},json(){throw Error('must not read redirect body');}};}});
 await assert.rejects(provider.analyze(session),error=>error.failures[0].status===302);
 assert.equal(calls,1);assert.equal(cancelled,true);
});

test('免费额度耗尽熔断当前模型并静默转到下一个后台模型',async()=>{
 const calls=[],proposal=runRulesAnalysis(session);
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-plus','qwen-flash'],freeOnlyConfirmed:true,fetcher:async(url,options)=>{const model=JSON.parse(options.body).model;calls.push(model);return model==='qwen-plus'?response(403,{code:'AllocationQuota.FreeTierOnly'}):response(200,{choices:[{message:{content:JSON.stringify(proposal)}}]});}});
 assert.deepEqual(await provider.analyze(session),proposal);assert.deepEqual(calls,['qwen-plus','qwen-flash']);
 assert.equal(provider.status().models[0].available,false);
 calls.length=0;await provider.analyze(session);assert.deepEqual(calls,['qwen-flash']);
});

test('非额度错误不跨模型重试，每日硬上限在发请求前拒绝',async()=>{
 let calls=0;
 const failed=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-plus','qwen-flash'],freeOnlyConfirmed:true,fetcher:async()=>{calls++;return response(500,{code:'InternalError'});}});
 await assert.rejects(failed.analyze(session),/model_unavailable/);assert.equal(calls,1);
 const limited=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,maxCallsPerDay:1,fetcher:async()=>{calls++;return response(500,{code:'InternalError'});}});
 await assert.rejects(limited.analyze(session));await assert.rejects(limited.analyze(session),/model_daily_limit/);assert.equal(limited.status().daily.used,1);
});

test('非法或串会话模型输出在确认前被拒绝',async()=>{
 const provider=createAliyunModelProvider({apiKey:'secret-key-for-testing-only',models:['qwen-flash'],freeOnlyConfirmed:true,fetcher:async()=>response(200,{choices:[{message:{content:'{"session_id":"other"}'}}]})});
 await assert.rejects(provider.analyze(session),/model_unavailable/);
});
