import test from 'node:test';
import assert from 'node:assert/strict';
import {edgeGuard,readBoundedJson} from '../cloudflare/request-guards.mjs';
import {createWorker} from '../cloudflare/worker.mjs';
import {analysisCapabilities} from '../cloudflare/model-gateway.mjs';

const request=(path='/api/v1/session',method='POST')=>new Request(`https://moat.test${path}`,{method,headers:{Origin:'https://moat.test','CF-Connecting-IP':'192.0.2.1'}});
test('公开请求保护缺失、拒绝和故障均在访问 D1 前停止',async()=>{
 let reads=0;const DB={prepare(){reads++;throw Error('must not access database');}};
 const allow={limit:async()=>({success:true})},deny={limit:async()=>({success:false})},broken={limit:async()=>{throw Error('unavailable');}};
 for(const [extra,status,code] of [
  [{},503,'rate_limit_unavailable'],
  [{API_RATE_LIMITER:deny,SESSION_RATE_LIMITER:allow},429,'rate_limited'],
  [{API_RATE_LIMITER:allow,SESSION_RATE_LIMITER:deny},429,'rate_limited'],
  [{API_RATE_LIMITER:broken,SESSION_RATE_LIMITER:allow},503,'rate_limit_unavailable']
 ]){
  const response=await createWorker().fetch(request(),{DB,MOAT_PUBLIC_API_ENABLED:'true',...extra});
  assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);assert.equal(response.headers.get('Retry-After'),'60');
 }
 assert.equal(reads,0);
});

test('边缘桶仅接收 IP 摘要，普通请求不占会话创建桶',async()=>{
 const keys=[];let sessions=0;
 const env={MOAT_PUBLIC_API_ENABLED:'true',API_RATE_LIMITER:{limit:async({key})=>{keys.push(key);return {success:true};}},SESSION_RATE_LIMITER:{limit:async()=>{sessions++;return {success:true};}}};
 assert.equal(await edgeGuard(request('/api/v1/health','GET'),env),null);assert.equal(sessions,0);
 assert.equal(await edgeGuard(request(),env),null);assert.equal(sessions,1);
 assert.match(keys[0],/^[a-f0-9]{64}$/);assert.equal(keys[0],keys[1]);assert.ok(!keys[0].includes('192.0.2.1'));
 const withoutIp=new Request('https://moat.test/api/v1/health');assert.equal((await edgeGuard(withoutIp,env)).status,503);
});

test('请求体按实际流量限制，不信任 Content-Length',async()=>{
 const encode=value=>new TextEncoder().encode(value);
 const valid=new Request('https://moat.test',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"text":"中文"}'});
 assert.deepEqual(await readBoundedJson(valid,100),{text:'中文'});
 let cancelled=false;
 const chunks=new ReadableStream({start(controller){controller.enqueue(encode(' '.repeat(33)));},cancel(){cancelled=true;}});
 await assert.rejects(readBoundedJson(new Request('https://moat.test',{method:'POST',headers:{'Content-Type':'application/json','Content-Length':'1'},body:chunks,duplex:'half'}),32),{code:'body_too_large'});assert.equal(cancelled,true);
 for(const [headers,body,code] of [[{'Content-Type':'text/plain'},'{}','unsupported_media_type'],[{'Content-Type':'application/json'},'{','invalid_json'],[{'Content-Type':'application/json','Content-Length':'300'},'{}','body_too_large']]){
  await assert.rejects(readBoundedJson(new Request('https://moat.test',{method:'POST',headers,body}),100),{code});
 }
});

test('Worker 默认只有规则和手工模式，不把模型或免费保护配置暴露到客户端',()=>{
 const capabilities=analysisCapabilities({ALIYUN_DASHSCOPE_API_KEY:'not-printed-secret'});
 assert.equal(capabilities.model,'disabled');assert.deepEqual(capabilities.availableModes,['rules','manual']);assert.ok(!JSON.stringify(capabilities).includes('secret'));
});
