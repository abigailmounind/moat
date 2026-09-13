import {validateUnderstandingProposal} from './understanding.js';

const rivers=new Set(['survival','ability','love']);
const answerKinds={q1:'situation',q2:'blockers',q3:'experience',q4:'actions',q5:'outcome',q6:'method',q7:'river_basis'};
const isRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const clean=value=>String(value??'').trim();
const safeId=value=>String(value??'session').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24)||'session';
const shortText=value=>typeof value==='string'&&value.trim().length>0&&value.length<=1000;
const textList=value=>Array.isArray(value)&&value.length>0&&value.length<=20&&value.every(shortText);
const riverBasis={
 survival:{explanation:'你明确说明这段经历正在承担现实支撑，或正在验证交换价值。',uncertainty:'稳定性与可持续程度仍需继续观察。',rule:'R07'},
 ability:{explanation:'你明确说明这段经历里的做法已在另一种任务中复用。',uncertainty:'当前只记录这次复用，不扩展为普遍可迁移。',rule:'R08'},
 love:{explanation:'你明确说明没有现实压力时，仍愿意继续投入这项具体活动。',uncertainty:'投入意愿可以继续通过实际行动核对。',rule:'R09'}
};

export function validateRulesSession(session){
 const errors=[];
 if(!isRecord(session)||!shortText(session.id)||session.id.length>100)errors.push('session_id');
 if(!Array.isArray(session?.answers)||session.answers.length>20)errors.push('answers');
 if(errors.length)return {ok:false,errors,inputIds:[]};
 const seen=new Set();
 for(const answer of session.answers){
  if(!isRecord(answer)||!Object.hasOwn(answerKinds,answer.questionId)||answer.kind!==answerKinds[answer.questionId]||typeof answer.skipped!=='boolean'||seen.has(answer.questionId)){errors.push('answer_shape');continue;}
  seen.add(answer.questionId);
  const value=answer.value;
  if(answer.questionId==='q1'&&value!==''&&!shortText(value))errors.push(answer.questionId);
  if(answer.questionId==='q3'&&!shortText(value))errors.push(answer.questionId);
  if(['q2','q4'].includes(answer.questionId)&&!(Array.isArray(value)&&value.length<=20&&value.every(shortText)))errors.push(answer.questionId);
  if(answer.questionId==='q5'&&(!isRecord(value)||!textList(value.outcomes)||!(value.source===null||shortText(value.source))))errors.push('q5');
  if(answer.questionId==='q6'&&!(typeof value==='string'&&value.length<=800))errors.push('q6');
  if(answer.questionId==='q7'&&!(Array.isArray(value)&&value.length<=3&&new Set(value).size===value.length&&value.every(river=>rivers.has(river))))errors.push('q7');
 }
 for(const required of ['q3','q4','q5'])if(!seen.has(required))errors.push(required);
 return {ok:errors.length===0,errors:[...new Set(errors)],inputIds:[...seen]};
}

export function runRulesAnalysis(session){
 const checked=validateRulesSession(session);
 if(!checked.ok)throw new Error('analysis_input_incomplete');
 const byId=Object.fromEntries(session.answers.map(answer=>[answer.questionId,answer]));
 const actions=byId.q4.value,outcomes=byId.q5.value.outcomes,method=clean(byId.q6?.value),riverSelections=byId.q7?.value??[];
 const prefix=safeId(session.id),evidenceId=prefix+'_evidence_experience',capitalId=prefix+'_capital_human';
 const proposal={
  contract_version:'0.1',session_id:session.id,
  claims:[{id:prefix+'_claim_experience',kind:'experience',text:'用户描述了一段包含具体行动的实践。',source_type:'ai_proposal',confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:'R01',rule_version:'0.1',basis_refs:['q3','q4','q5']}],
  evidence_drafts:[{id:evidenceId,title:'一段具体实践',experience:byId.q3.value,actions,result:outcomes.join('、'),source:byId.q5.value.source,limitations:[method?'这次使用的方法已记录；熟练程度仍需更多实践说明。':'尚未补充具体方法；本轮只记录行动与结果。'],source_type:'user_self_report',confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:'R01',rule_version:'0.1',basis_refs:['q3','q4','q5']}],
  capital_links:method?[{id:capitalId,evidence_id:evidenceId,capital:'human',aspect:'具体方法的一次实践',explanation:`你明确补充了这次使用的方法：${method}。`,confirmation_status:'pending',input_refs:['q4','q6'],rule_id:'R03',rule_version:'0.1',basis_refs:['q4','q6']}]:[],
  river_links:riverSelections.map(river=>({id:prefix+'_river_'+river,evidence_id:evidenceId,river,explanation:riverBasis[river].explanation,uncertainty:riverBasis[river].uncertainty,confirmation_status:'pending',input_refs:['q3','q7'],rule_id:riverBasis[river].rule,rule_version:'0.1',basis_refs:['q3','q7']})),
  future_direction_drafts:[],
  unknowns:[...(!method?[{id:prefix+'_unknown_capital',topic:'capital',reason:byId.q6?'skipped':'not_asked',input_refs:byId.q6?['q6']:[]}]:[]),...(!riverSelections.length?[{id:prefix+'_unknown_river',topic:'river',reason:byId.q7?'skipped':'not_asked',input_refs:byId.q7?['q7']:[]}]:[]),{id:prefix+'_unknown_direction',topic:'direction',reason:'not_asked',input_refs:[]}]
 };
 if(!validateUnderstandingProposal(proposal,{inputIds:checked.inputIds}).ok)throw new Error('invalid_rules_output');
 return proposal;
}
