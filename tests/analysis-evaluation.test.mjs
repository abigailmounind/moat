import test from 'node:test';
import assert from 'node:assert/strict';
import {runRulesAnalysis} from '../shared/rules-analysis.js';
import {validateUnderstandingProposal} from '../shared/understanding.js';
import {analysisEvaluationCases} from './fixtures/analysis-evaluation-cases.mjs';

test('固定内容评测保持明确依据、未知和待确认边界',()=>{
 for(const current of analysisEvaluationCases){
  const proposal=runRulesAnalysis(current.session),inputIds=current.session.answers.map(item=>item.questionId);
  assert.equal(validateUnderstandingProposal(proposal,{inputIds}).ok,true,current.id);
  assert.deepEqual(proposal.capital_links.map(item=>item.capital),current.capitals,current.id);
  assert.deepEqual(proposal.river_links.map(item=>item.river),current.rivers,current.id);
  if(current.unknownTopics)assert.deepEqual(proposal.unknowns.map(item=>item.topic),current.unknownTopics,current.id);
  for(const collection of ['claims','capital_links','river_links','future_direction_drafts'])for(const item of proposal[collection]){
   assert.equal(item.confirmation_status,'pending',`${current.id}:${collection}`);
   assert.equal(typeof item.rule_id,'string',`${current.id}:${collection}`);
   assert.equal(item.rule_version,'0.1',`${current.id}:${collection}`);
  }
  assert.deepEqual(proposal.future_direction_drafts,[],current.id);
 }
});
