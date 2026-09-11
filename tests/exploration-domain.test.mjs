import test from 'node:test';
import assert from 'node:assert/strict';
import {createExplorationSession,answersFromUi,runSyntheticAnalysis,confirmAnalysis,createMapChangeSet,createPrototypeProfile,applyMapChangeSet,buildPrototypeArtifacts} from '../frontend/src/exploration-domain.js';

const ui={answers:{situation:'change',situationOther:'',blockers:['assets'],experience:'project',actions:['organize','coordinate'],actionOther:'',outcomes:['artifact'],source:''},cards:{experience:'confirmed',human:'confirmed',ability:'confirmed',unknown:'confirmed'},edits:{}};
const session=()=>{const value=createExplorationSession({id:'synthetic'});value.answers=answersFromUi(ui);return value;};
const initialUi=()=>({answers:{situation:'change',situationOther:'',blockers:['assets'],experience:'project',actions:['organize','coordinate'],actionOther:'',outcomes:['artifact'],source:''},cards:{experience:'confirmed',human:'confirmed',ability:'confirmed',unknown:'confirmed'},edits:{}});

test('页面回答转换为带版本和跳过状态的会话输入',()=>{const value=session();assert.equal(value.flowVersion,'stage10-minimum-v0.1');assert.equal(value.answers.length,5);assert.equal(value.answers.find(x=>x.questionId==='q2').skipped,false);});
test('合成分析只产生待确认、有引用的三河五资本候选',()=>{const proposal=runSyntheticAnalysis(session());assert.deepEqual(proposal.capital_links.map(x=>x.capital),['human']);assert.deepEqual(proposal.river_links.map(x=>x.river),['ability']);assert.ok(proposal.evidence_drafts.every(x=>x.input_refs.length&&x.confirmation_status==='pending'));});
test('本地候选规则不会把三种输入都固定到能力之河',()=>{
 const proposalFor=answers=>{const value=createExplorationSession();value.answers=answersFromUi({...ui,answers:{...ui.answers,...answers}});return runSyntheticAnalysis(value);};
 assert.equal(proposalFor({experience:'interest'}).river_links[0].river,'love');
 assert.equal(proposalFor({experience:'work'}).river_links[0].river,'survival');
 assert.equal(proposalFor({experience:'project',situation:'change',blockers:['assets']}).river_links[0].river,'ability');
});
test('卡点不再决定河流，结果未知时不补推资本或方向',()=>{
 const value=createExplorationSession();value.answers=answersFromUi({...ui,answers:{...ui.answers,experience:'project',blockers:['interest'],outcomes:['unclear']}});
 const proposal=runSyntheticAnalysis(value);
 assert.deepEqual(proposal.capital_links,[]);assert.deepEqual(proposal.river_links,[]);assert.deepEqual(proposal.future_direction_drafts,[]);
 const work=createExplorationSession();work.answers=answersFromUi({...ui,answers:{...ui.answers,experience:'project',blockers:['reality'],outcomes:['artifact']}});
 assert.equal(runSyntheticAnalysis(work).river_links[0].river,'ability');
});
test('不同探索生成不同证明 ID，不会覆盖已有证明',()=>{const firstUi=structuredClone(ui),secondUi=structuredClone(ui);secondUi.answers.experience='work';const first=buildPrototypeArtifacts({...structuredClone(initialUi()),cards:{experience:'confirmed',human:'confirmed',ability:'confirmed',unknown:'confirmed'},edits:{}}).changeSet;const second=buildPrototypeArtifacts({...initialUi(),answers:{...initialUi().answers,experience:'work'},cards:{experience:'confirmed',human:'confirmed',ability:'confirmed',unknown:'confirmed'},edits:{}}).changeSet;let profile=createPrototypeProfile();profile=applyMapChangeSet(profile,first).profile;profile=applyMapChangeSet(profile,second).profile;assert.equal(Object.keys(profile.evidence).length,2);assert.notEqual(first.operations.find(x=>x.type==='add_evidence').entityId,second.operations.find(x=>x.type==='add_evidence').entityId);});
test('删除证明会连带阻止无主资本和河流关系进入变更集',()=>{const proposal=runSyntheticAnalysis(session());const confirmed=confirmAnalysis(proposal,{...ui.cards,experience:'deleted'},{});const changeSet=createMapChangeSet(confirmed);assert.equal(changeSet.operations.some(x=>['add_evidence','link_capital','link_river'].includes(x.type)),false);assert.deepEqual(confirmed.excludedProposalIds,['experience']);});
test('修改确认文本会进入结果对象，删除关联不会留下旧判断',()=>{const proposal=runSyntheticAnalysis(session());const edited=confirmAnalysis(proposal,ui.cards,{experience:'改写后的经历说明',human:'改写后的人力解释',ability:'改写后的能力解释'});assert.equal(edited.evidence[0].title,'改写后的经历说明');assert.equal(edited.capitalLinks[0].explanation,'改写后的人力解释');assert.equal(edited.riverLinks[0].explanation,'改写后的能力解释');const removed=confirmAnalysis(proposal,{...ui.cards,ability:'deleted'},{});assert.equal(removed.riverLinks.length,0);});
test('变更集稳定、提交幂等、失败保持原档案',()=>{const confirmed=confirmAnalysis(runSyntheticAnalysis(session()),ui.cards,{});const first=createMapChangeSet(confirmed),second=createMapChangeSet(confirmed);assert.equal(first.id,second.id);const empty=createPrototypeProfile(),failed=applyMapChangeSet(empty,first,{fail:true});assert.equal(failed.profile,empty);const applied=applyMapChangeSet(empty,first);assert.equal(applied.ok,true);const duplicate=applyMapChangeSet(applied.profile,first);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.profile,applied.profile);});

test('再次保存删除本轮旧内容，保留其他探索，撤销删除可恢复',()=>{
 const proposal=runSyntheticAnalysis(session());
 const first=createMapChangeSet(confirmAnalysis(proposal,ui.cards));
 const other=buildPrototypeArtifacts(ui).changeSet;
 let profile=applyMapChangeSet(applyMapChangeSet(createPrototypeProfile(),other).profile,first).profile;
 const removed=createMapChangeSet(confirmAnalysis(proposal,{experience:'deleted',human:'deleted',ability:'deleted',unknown:'deleted'}));
 const before=structuredClone(profile);
 assert.deepEqual(applyMapChangeSet(profile,removed,{fail:true}).profile,before);
 profile=applyMapChangeSet(profile,removed).profile;
 for(const key of ['evidence','capitalLinks','riverLinks'])assert.equal(Object.keys(profile[key]).length,1);
 assert.equal(Object.keys(profile.unknowns).length,2);
 profile=applyMapChangeSet(profile,first).profile;
 assert.equal(Object.keys(profile.evidence).length,2);
 assert.equal(applyMapChangeSet(profile,first).duplicate,true);
});
test('未知项修改进入结果和保存对象，删除后清除',()=>{
 const proposal=runSyntheticAnalysis(session());
 const confirmed=confirmAnalysis(proposal,{...ui.cards,unknown:'modified'},{unknown:'需要补充长期投入经历'});
 assert.ok(confirmed.unknowns.every(x=>x.explanation==='需要补充长期投入经历'&&x.confirmation_status==='modified'));
 const profile=applyMapChangeSet(createPrototypeProfile(),createMapChangeSet(confirmed)).profile;
 assert.ok(Object.values(profile.unknowns).every(x=>x.explanation==='需要补充长期投入经历'));
});
