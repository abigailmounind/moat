import test from 'node:test';
import assert from 'node:assert/strict';
import {createSyntheticAnalysisAdapter,validateUnderstandingProposal} from '../frontend/src/exploration-analysis.js';
import {createExplorationSession,answersFromUi,runSyntheticAnalysis} from '../frontend/src/exploration-domain.js';

const ui={answers:{situation:'change',situationOther:'',blockers:[],experience:'project',actions:['organize'],actionOther:'',outcomes:['artifact'],source:'',methodUsed:'信息分类法',riverBasis:['ability']}};
const session=()=>{const value=createExplorationSession();value.answers=answersFromUi(ui);return value;};
test('合成适配器异步返回通过契约边界校验的候选',async()=>{const proposal=await createSyntheticAnalysisAdapter({delay:0}).analyze(session());assert.equal(validateUnderstandingProposal(proposal).ok,true);});
test('适配器失败和取消具有可区分错误且不改变输入',async()=>{const value=session(),before=structuredClone(value);await assert.rejects(createSyntheticAnalysisAdapter({delay:0,shouldFail:()=>true}).analyze(value),/synthetic_analysis_failed/);assert.deepEqual(value,before);const controller=new AbortController(),promise=createSyntheticAnalysisAdapter({delay:20}).analyze(value,{signal:controller.signal});controller.abort();await assert.rejects(promise,error=>error.name==='AbortError');assert.deepEqual(value,before);});
test('运行时契约拒绝第四条河、悬空引用和重复 ID',()=>{const proposal=structuredClone(session()),inputIds=proposal.answers.map(answer=>answer.questionId);const value=runSyntheticAnalysis(proposal);value.river_links[0].river='luck';assert.equal(validateUnderstandingProposal(value,{inputIds}).ok,false);const missing=structuredClone(value);missing.capital_links[0].evidence_id='missing';assert.equal(validateUnderstandingProposal(missing,{inputIds}).ok,false);const duplicate=structuredClone(value);duplicate.unknowns[0].id=duplicate.evidence_drafts[0].id;assert.equal(validateUnderstandingProposal(duplicate,{inputIds}).ok,false);});
test('契约检查拒绝缺少必要集合的结果',()=>{assert.equal(validateUnderstandingProposal({contract_version:'0.1',session_id:'x'}).ok,false);});
