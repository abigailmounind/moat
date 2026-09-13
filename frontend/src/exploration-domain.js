import {confirmReview} from './exploration-review.js';
import {createPrototypeProfile,validatePrototypeProfile} from '../../shared/profile.js';
import {runRulesAnalysis} from '../../shared/rules-analysis.js';
import {applyProfileChangeSet} from '../../shared/profile-changes.js';
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

export function createExplorationSession({id=generatedSessionId(),flowVersion='stage10-minimum-v0.2'}={}){
 return {id,flowVersion,status:'draft',answers:[],excludedProposalIds:[],createdAt:'prototype-time'};
}

export function answersFromUi(uiState){
 const a=uiState.answers;
 return [
  {questionId:'q1',kind:'situation',value:a.situation==='other'?clean(a.situationOther):a.situation,skipped:false},
  {questionId:'q2',kind:'blockers',value:[...a.blockers],skipped:a.blockers.length===0},
  {questionId:'q3',kind:'experience',value:a.experience,skipped:false},
  {questionId:'q4',kind:'actions',value:[...a.actions,clean(a.actionOther)].filter(Boolean),skipped:false},
  {questionId:'q5',kind:'outcome',value:{outcomes:[...a.outcomes],source:a.source||null},skipped:false},
  {questionId:'q6',kind:'method',value:clean(a.methodUsed),skipped:!clean(a.methodUsed)},
  {questionId:'q7',kind:'river_basis',value:[...(a.riverBasis??[])],skipped:!(a.riverBasis??[]).length}
 ];
}

export const runSyntheticAnalysis=runRulesAnalysis;

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

export const applyMapChangeSet=applyProfileChangeSet;

export function buildPrototypeArtifacts(uiState,providedProposal=null){
 const session=createExplorationSession();session.answers=answersFromUi(uiState);
 const proposal=providedProposal??runSyntheticAnalysis(session);
 const confirmed=confirmAnalysis(proposal,uiState.cards,uiState.edits);
 return {session,proposal,confirmed,changeSet:createMapChangeSet(confirmed)};
}
