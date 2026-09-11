import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateUnderstanding} from '../scripts/validate-stage10-contract.mjs';

const valid=JSON.parse(await readFile(new URL('../contracts/examples/stage10-valid.json',import.meta.url),'utf8'));

test('合成输出保留三河、五资本和引用边界',()=>{
 assert.deepEqual(validateUnderstanding(valid,{inputIds:['q1','q2','q3','q4','q5']}),[]);
});

test('拒绝第四条河、旧资本、无来源关系和虚构证明引用',()=>{
 const bad=structuredClone(valid);
 bad.river_links[0].river='luck';
 bad.capital_links[0].capital='proof';
 bad.capital_links[0].input_refs=[];
 bad.evidence_drafts[0].input_refs=['missing-answer'];
 const errors=validateUnderstanding(bad,{inputIds:['q1','q2','q3','q4','q5']}).join('\n');
 assert.match(errors,/river_link_shape/);assert.match(errors,/capital_link_shape/);assert.match(errors,/input_refs/);assert.match(errors,/unknown_input_/);
});

test('跳过敏感主题后必须保持未知且不能建立资本关系',()=>{
 const skipped=structuredClone(valid);
 skipped.unknowns[0].reason='skipped';
 assert.deepEqual(validateUnderstanding(skipped,{inputIds:['q1','q2','q3','q4','q5'],skippedTopics:['financial']}),[]);
 skipped.capital_links.push({id:'capital_financial',evidence_id:'evidence_project',capital:'financial',aspect:'猜测',explanation:'无依据',confirmation_status:'pending',input_refs:['q1']});
 assert.match(validateUnderstanding(skipped,{inputIds:['q1','q2','q3','q4','q5'],skippedTopics:['financial']}).join('\n'),/不得补推/);
});


test('CLI、前端兼容入口与共享层对非法候选一致拒绝且不修改数据',async()=>{
 const {validateUnderstandingProposal:shared}=await import('../shared/understanding.js');
 const {validateUnderstandingProposal:browser}=await import('../frontend/src/exploration-analysis.js');
 const options={inputIds:['q1','q2','q3','q4','q5'],skippedTopics:['financial']};
 const malformed=[null,{}, {...valid,claims:{}}, {...valid,evidence_drafts:[null]}, {...valid,claims:[{id:'bad',kind:'constraint',input_refs:42}]}];
 const confirmed=structuredClone(valid);confirmed.claims[0].confirmation_status='confirmed';malformed.push(confirmed);
 const duplicate=structuredClone(valid);duplicate.claims[0].input_refs=['q1','q1'];malformed.push(duplicate);
 for(const value of malformed){
  const before=structuredClone(value),result=shared(value,options);
  assert.equal(result.ok,false);
  assert.deepEqual(validateUnderstanding(value,options),result.errors);
  assert.deepEqual(browser(value,options),result);
  assert.deepEqual(value,before);
 }
});
