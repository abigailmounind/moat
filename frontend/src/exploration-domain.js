import {confirmReview} from './exploration-review.js';
import {createPrototypeProfile,validatePrototypeProfile} from '../../shared/profile.js';
export {createPrototypeProfile,validatePrototypeProfile} from '../../shared/profile.js';
const capitals=new Set(['human','social','psychological','financial','physical']);
const rivers=new Set(['survival','ability','love']);
const isRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const hasText=value=>typeof value==='string'&&value.trim().length>0;
const validConfirmation=value=>value==='confirmed'||value==='modified';
let sessionCounter=0;
const generatedSessionId=()=>{sessionCounter+=1;const uuid=globalThis.crypto?.randomUUID?.();return 'prototype-'+(uuid||Date.now().toString(36))+'-'+sessionCounter.toString(36);};
const safeId=value=>String(value??'session').toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,24)||'session';
const clean=value=>String(value??'').trim();
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value&&typeof value==='object'?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
function fingerprint(value){let hash=2166136261;for(const char of canonical(value)){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}return (hash>>>0).toString(36);}
const riverProposal=byId=>{
 const experience=byId.q3?.value,blockers=byId.q2?.value??[],situation=byId.q1?.value;
 const river=experience==='interest'?'love':experience==='work'?'survival':'ability';
 return {
  river,
  explanation:{love:'这段经历包含长期兴趣或主动投入的线索，可以先作为热爱之河的候选关联。',survival:'这段经历发生在工作或现实支撑情境中，可以先作为生存之河的候选关联。',ability:'这些行动可能在其他情境复用，可以先作为能力之河的候选关联。'}[river],
  uncertainty:{love:'是否愿意长期持续投入，仍需更多实践验证。',survival:'能否形成稳定而可持续的现实支撑，仍需继续验证。',ability:'能否跨情境复用，仍需继续验证。'}[river],
  direction:{love:['继续一次愿意主动投入的小实践','已有兴趣与行动线索，可以用一次小实践观察持续投入感。','投入感能否持续，以及现实条件是否允许，还需要实际尝试。'],survival:['验证这段做法能否形成现实支撑','已有工作或现实情境中的行动线索，可以继续观察它的稳定性。','能否稳定交付并形成可持续支撑，还需要实际结果。'],ability:['换个小情境，验证这段做法','你提供了具体行动与结果，可以从中挑选一个做法继续验证。','换到另一种任务后是否仍然有用，还需要实际尝试。']}[river]
 };
};

export function createExplorationSession({id=generatedSessionId(),flowVersion='stage10-minimum-v0.1'}={}){
 return {id,flowVersion,status:'draft',answers:[],excludedProposalIds:[],createdAt:'prototype-time'};
}

export function answersFromUi(uiState){
 const a=uiState.answers;
 return [
  {questionId:'q1',kind:'situation',value:a.situation==='other'?clean(a.situationOther):a.situation,skipped:false},
  {questionId:'q2',kind:'blockers',value:[...a.blockers],skipped:a.blockers.length===0},
  {questionId:'q3',kind:'experience',value:a.experience,skipped:false},
  {questionId:'q4',kind:'actions',value:[...a.actions,clean(a.actionOther)].filter(Boolean),skipped:false},
  {questionId:'q5',kind:'outcome',value:{outcomes:[...a.outcomes],source:a.source||null},skipped:false}
 ];
}

export function runSyntheticAnalysis(session){
 const byId=Object.fromEntries(session.answers.map(answer=>[answer.questionId,answer]));
 const actions=byId.q4?.value??[],outcomes=byId.q5?.value?.outcomes??[],hasReportedOutcome=outcomes.some(value=>value!=='unclear');
 if(!byId.q3?.value||!actions.length||!outcomes.length)throw new Error('analysis_input_incomplete');
 const prefix=safeId(session.id),evidenceId=prefix+'_evidence_experience',capitalId=prefix+'_capital_human',candidate=riverProposal(byId),riverId=prefix+'_river_'+candidate.river;
 const unknownRivers=['survival','ability','love'].filter(river=>river!==candidate.river),[directionName,directionSupport,directionUnknown]=candidate.direction,candidateRefs=['q1','q2','q3','q4','q5'].filter(id=>byId[id]);
 return {
  contract_version:'0.1',session_id:session.id,
  claims:[{id:prefix+'_claim_experience',kind:'experience',text:'用户描述了一段包含具体行动的实践。',source_type:'ai_proposal',confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:'R01',rule_version:'0.1',basis_refs:['q3','q4','q5']}],
  evidence_drafts:[{id:evidenceId,title:'一段具体实践',experience:byId.q3.value,actions,result:outcomes.join('、'),source:byId.q5.value.source,limitations:['熟练程度与跨情境表现仍待验证'],source_type:'user_self_report',confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:'R01',rule_version:'0.1',basis_refs:['q3','q4','q5']}],
  capital_links:hasReportedOutcome?[{id:capitalId,evidence_id:evidenceId,capital:'human',aspect:'具体行动与已报告结果',explanation:'用户描述了实践中的具体行动，并报告了一个结果线索。',confirmation_status:'pending',input_refs:['q4','q5'],rule_id:'R03',rule_version:'0.1',basis_refs:['q4','q5']}]:[],
  river_links:hasReportedOutcome?[{id:riverId,evidence_id:evidenceId,river:candidate.river,explanation:candidate.explanation,uncertainty:candidate.uncertainty,confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:candidate.river==='love'?'R09':candidate.river==='survival'?'R07':'R08',rule_version:'0.1',basis_refs:['q3','q4','q5']}]:[],
  future_direction_drafts:hasReportedOutcome?[{id:prefix+'_direction_'+candidate.river,evidence_id:evidenceId,river:candidate.river,name:directionName,support:directionSupport,unknown:directionUnknown,next_action:'选一个规模小的行动，记下过程、结果和自己的感受。',confirmation_status:'pending',input_refs:['q3','q4','q5'],rule_id:'R10',rule_version:'0.1',basis_refs:['q3','q4','q5']}]:[],
  unknowns:unknownRivers.map(river=>({id:prefix+'_unknown_'+river,topic:'river',reason:'insufficient_evidence',input_refs:candidateRefs}))
 };
}

// Explicit no-AI fallback: preserve only what the user entered and keep all
// interpretation open for manual review. This is intentionally not a
// reduced copy of the synthetic rule proposal.
export function buildManualProposal(session){
 const byId=Object.fromEntries(session.answers.map(answer=>[answer.questionId,answer]));
 const actions=byId.q4?.value??[],outcomes=byId.q5?.value?.outcomes??[],prefix=safeId(session.id);
 if(!byId.q3?.value||!actions.length||!outcomes.length)throw new Error('analysis_input_incomplete');
 const evidenceId=prefix+'_manual_evidence';
 return {contract_version:'0.1',session_id:session.id,
  claims:[],
  evidence_drafts:[{id:evidenceId,title:'手工记录的一段实践',experience:byId.q3.value,actions,result:outcomes.join('、'),source:byId.q5.value.source,limitations:['没有自动判断资本、河流或方向；可以在后续实践中补充'],source_type:'user_self_report',confirmation_status:'pending',input_refs:['q3','q4','q5']}],
  capital_links:[],river_links:[],future_direction_drafts:[],
  unknowns:[{id:prefix+'_manual_unknown_capital',topic:'capital',reason:'insufficient_evidence',input_refs:['q3','q4','q5']},{id:prefix+'_manual_unknown_river',topic:'river',reason:'insufficient_evidence',input_refs:['q3','q4','q5']},{id:prefix+'_manual_unknown_direction',topic:'direction',reason:'insufficient_evidence',input_refs:['q1','q3','q4']}]
 };
}

export function confirmAnalysis(proposal,cards,edits={}){
 if(!Object.hasOwn(cards,'experience'))return confirmReview(proposal,cards,edits);
 const accepted=id=>['confirmed','modified'].includes(cards[id]);
 const excludedProposalIds=[];
 for(const [id,status] of Object.entries(cards))if(status==='deleted')excludedProposalIds.push(id);
 const evidence=accepted('experience')?proposal.evidence_drafts.map(item=>({...item,title:clean(edits.experience)||item.title,confirmation_status:cards.experience})):[];
 const evidenceIds=new Set(evidence.map(item=>item.id));
 const capitalLinks=accepted('human')?proposal.capital_links.filter(item=>evidenceIds.has(item.evidence_id)).map(item=>({...item,explanation:clean(edits.human)||item.explanation,confirmation_status:cards.human})):[];
 const riverCard=proposal.river_links[0]?.river??'ability',riverStatus=cards[riverCard]??cards.ability;
 const riverLinks=['confirmed','modified'].includes(riverStatus)?proposal.river_links.filter(item=>evidenceIds.has(item.evidence_id)).map(item=>({...item,explanation:clean(edits[riverCard]??edits.ability)||item.explanation,confirmation_status:riverStatus})):[];
 const unknowns=accepted('unknown')?proposal.unknowns.map(item=>({...item,explanation:clean(edits.unknown)||'生存之河与热爱之河继续保留未知。',confirmation_status:cards.unknown})):[];
 return {scope:{evidence:proposal.evidence_drafts.map(x=>x.id),capitalLinks:proposal.capital_links.map(x=>x.id),riverLinks:proposal.river_links.map(x=>x.id),unknowns:proposal.unknowns.map(x=>x.id)},sessionId:proposal.session_id,evidence,capitalLinks,riverLinks,unknowns,excludedProposalIds};
}

export function validateConfirmedArtifacts(confirmed){
 if(!isRecord(confirmed)||!Array.isArray(confirmed.evidence)||!Array.isArray(confirmed.capitalLinks)||!Array.isArray(confirmed.riverLinks)||!Array.isArray(confirmed.unknowns))return false;
 const evidenceIds=new Set(confirmed.evidence.map(item=>item.id));
 if(evidenceIds.size!==confirmed.evidence.length||confirmed.evidence.some(item=>!hasText(item.id)||!hasText(item.title)||!hasText(item.experience)||!Array.isArray(item.actions)||!item.actions.length||!validConfirmation(item.confirmation_status)))return false;
 if(confirmed.capitalLinks.some(item=>!hasText(item.id)||!evidenceIds.has(item.evidence_id)||!capitals.has(item.capital)||!validConfirmation(item.confirmation_status)))return false;
 if(confirmed.riverLinks.some(item=>!hasText(item.id)||!evidenceIds.has(item.evidence_id)||!rivers.has(item.river)||!validConfirmation(item.confirmation_status)))return false;
 return true;
}
export function createMapChangeSet(confirmed){
 if(!validateConfirmedArtifacts(confirmed))throw new Error('invalid_confirmed_artifacts');
 for(const link of confirmed.capitalLinks)if(!capitals.has(link.capital))throw new Error('invalid_capital');
 for(const link of confirmed.riverLinks)if(!rivers.has(link.river))throw new Error('invalid_river');
 const operations=[
  ...confirmed.evidence.map(item=>({type:'add_evidence',entityId:item.id,payload:item})),
  ...confirmed.capitalLinks.map(item=>({type:'link_capital',entityId:item.id,payload:item})),
  ...confirmed.riverLinks.map(item=>({type:'link_river',entityId:item.id,payload:item})),
  ...(confirmed.directions??[]).map(item=>({type:'save_direction',entityId:item.id,payload:item}))
 ];
 const unknownOperations=confirmed.unknowns.map(item=>({type:'keep_unknown',entityId:item.id,payload:item}));
 const body={sessionId:confirmed.sessionId,scope:confirmed.scope,operations:[...operations.filter(Boolean),...unknownOperations]};
 return {id:`change_${fingerprint(body)}`,...body};
}

export function applyMapChangeSet(profile,changeSet,{fail=false}={}){
 if(fail)return {ok:false,error:'prototype_commit_failed',profile};
 const next=structuredClone(profile);next.directions??={};
 for(const [target,ids] of Object.entries(changeSet.scope??{}))for(const id of ids)delete next[target][id];
 for(const operation of changeSet.operations){const target={add_evidence:'evidence',link_capital:'capitalLinks',link_river:'riverLinks',keep_unknown:'unknowns',save_direction:'directions'}[operation.type];if(!target)throw new Error('invalid_operation');next[target][operation.entityId]=operation.payload;}
 if(!validatePrototypeProfile(next))return {ok:false,error:'invalid_map_change',profile};
 if(['evidence','capitalLinks','riverLinks','unknowns','directions'].every(key=>canonical(next[key]??{})===canonical(profile[key]??{})))return {ok:true,duplicate:true,profile};
 if(!next.appliedChangeSets.includes(changeSet.id))next.appliedChangeSets.push(changeSet.id);
 return {ok:true,duplicate:false,profile:next};
}

export function buildPrototypeArtifacts(uiState,providedProposal=null){
 const session=createExplorationSession();session.answers=answersFromUi(uiState);
 const proposal=providedProposal??runSyntheticAnalysis(session);
 const confirmed=confirmAnalysis(proposal,uiState.cards,uiState.edits);
 return {session,proposal,confirmed,changeSet:createMapChangeSet(confirmed)};
}
