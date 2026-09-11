const capitals=new Set(['human','social','psychological','financial','physical']);
const rivers=new Set(['survival','ability','love']);
const idPattern=/^[a-z0-9][a-z0-9_-]{0,63}$/;
const isRecord=value=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
const hasText=value=>typeof value==='string'&&value.trim().length>0;
const validConfirmation=value=>value==='confirmed'||value==='modified';
const validEntry=(key,item)=>isRecord(item)&&item.id===key&&idPattern.test(String(item.id));
export function validatePrototypeProfile(value){
 if(!isRecord(value)||!isRecord(value.evidence)||!isRecord(value.capitalLinks)||!isRecord(value.riverLinks)||!isRecord(value.unknowns)||!Array.isArray(value.appliedChangeSets))return false;
 const evidenceIds=new Set(Object.keys(value.evidence));
 if(new Set(value.appliedChangeSets).size!==value.appliedChangeSets.length||value.appliedChangeSets.some(id=>typeof id!=='string'||!idPattern.test(id)))return false;
 for(const [key,item] of Object.entries(value.evidence)){
  if(!validEntry(key,item)||!hasText(item.title)||!hasText(item.experience)||!Array.isArray(item.actions)||!item.actions.length||item.actions.some(action=>!hasText(action))||!(typeof item.result==='string'||item.result===null)||!(typeof item.source==='string'||item.source===null)||!Array.isArray(item.limitations)||item.limitations.some(limit=>!hasText(limit))||item.source_type!=='user_self_report'||!validConfirmation(item.confirmation_status))return false;
 }
 for(const [key,item] of Object.entries(value.capitalLinks)){
  if(!validEntry(key,item)||!evidenceIds.has(item.evidence_id)||!capitals.has(item.capital)||!hasText(item.aspect)||!hasText(item.explanation)||!validConfirmation(item.confirmation_status))return false;
 }
 for(const [key,item] of Object.entries(value.riverLinks)){
  if(!validEntry(key,item)||!evidenceIds.has(item.evidence_id)||!rivers.has(item.river)||!hasText(item.explanation)||!(typeof item.uncertainty==='string'||item.uncertainty===null)||!validConfirmation(item.confirmation_status))return false;
 }
 if(value.directions!==undefined&&(!isRecord(value.directions)||Object.entries(value.directions).some(([key,item])=>!validEntry(key,item)||!rivers.has(item.river)||!validConfirmation(item.confirmation_status)||!['name','support','unknown','next_action'].every(k=>hasText(item[k])))))return false;
 for(const [key,item] of Object.entries(value.unknowns)){
  if(!isRecord(item))return false;
  if(('explanation' in item&&!hasText(item.explanation))||('confirmation_status' in item&&!validConfirmation(item.confirmation_status)))return false;
  if(!validEntry(key,item)||!['skipped','not_asked','insufficient_evidence','conflicting_inputs'].includes(item.reason)||!['financial','physical','evidence','river','capital','direction','conflict'].includes(item.topic))return false;
 }
 return true;
}
export function createPrototypeProfile(){return {evidence:{},capitalLinks:{},riverLinks:{},unknowns:{},appliedChangeSets:[]};}

export const growthEvidenceId=id=>`growth_${id}`;
export function validGrowthProof(proof,id){
 if(!validatePrototypeProfile(proof))return false;
 const evidence=Object.values(proof.evidence);
 if(Object.keys(proof.capitalLinks).some(key=>key!==`${growthEvidenceId(id)}_capital`)||Object.keys(proof.riverLinks).some(key=>key!==`${growthEvidenceId(id)}_river`))return false;
 return evidence.length===1&&evidence[0].id===growthEvidenceId(id)&&Object.keys(proof.unknowns).length===0&&proof.appliedChangeSets.length===0;
}
