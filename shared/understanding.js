// Pure candidate validation shared by browser, service and CLI. No confirmation or persistence.
export function validateUnderstandingProposal(value,{inputIds=[],skippedTopics=[]}={}){
 const errors=[];
 const capitals=new Set(['human','social','psychological','financial','physical']);
 const rivers=new Set(['survival','ability','love']);
 const topics=new Set(['financial','physical','evidence','river','capital','direction','conflict']);
 const reasons=new Set(['skipped','not_asked','insufficient_evidence','conflicting_inputs']);
 const arrays=['claims','evidence_drafts','capital_links','river_links','future_direction_drafts','unknowns'];
 if(value?.contract_version!=='0.1')errors.push('contract_version');
 if(typeof value?.session_id!=='string'||!value.session_id.trim())errors.push('session_id');
 for(const field of arrays)if(!Array.isArray(value?.[field])||value[field].length>50)errors.push(field);
 if(errors.length)return {ok:false,errors};
 const inputSet=new Set(inputIds),ids=new Set();
 const refs=(item,required=true)=>{if(!Array.isArray(item.input_refs)){errors.push('input_refs');return;}if(new Set(item.input_refs).size!==item.input_refs.length||item.input_refs.some(r=>typeof r!=='string'||r.length>100))errors.push('input_refs');if(required&&(!Array.isArray(item.input_refs)||item.input_refs.length===0))errors.push(item.id+':input_refs');for(const ref of item.input_refs??[])if(inputSet.size&&!inputSet.has(ref))errors.push(item.id+':unknown_input_'+ref);};
 const each=(field,handler)=>{for(const item of value?.[field]??[]){if(!item||typeof item!=='object'||typeof item.id!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(item.id)||ids.has(item.id))errors.push(field+':duplicate_or_invalid_id_'+(item?.id??''));else ids.add(item.id);if(!item||typeof item!=='object'||Array.isArray(item))continue;for(const v of Object.values(item))if(typeof v==='string'&&v.length>1000)errors.push('text_too_long');handler(item);}};
 each('claims',item=>{refs(item);if(!['situation','experience','preference','constraint'].includes(item.kind)||item.source_type!=='ai_proposal'||item.confirmation_status!=='pending'||typeof item.text!=='string'||!item.text.trim())errors.push(item.id+':claim_shape');});
 each('evidence_drafts',item=>{refs(item);if(item.source_type!=='user_self_report'||item.confirmation_status!=='pending'||typeof item.title!=='string'||!item.title.trim()||typeof item.experience!=='string'||!item.experience.trim()||!Array.isArray(item.actions)||!item.actions.length||item.actions.some(action=>typeof action!=='string'||!action.trim())||!(typeof item.result==='string'||item.result===null)||!(typeof item.source==='string'||item.source===null)||!Array.isArray(item.limitations)||item.limitations.some(x=>typeof x!=='string'||!x.trim()||x.length>1000))errors.push(item.id+':evidence_shape');});
 const evidenceIds=new Set((value?.evidence_drafts??[]).map(item=>item?.id));
 each('capital_links',item=>{refs(item);if(!capitals.has(item.capital)||!evidenceIds.has(item.evidence_id)||item.confirmation_status!=='pending'||typeof item.aspect!=='string'||!item.aspect.trim()||typeof item.explanation!=='string'||!item.explanation.trim())errors.push(item.id+':capital_link_shape');});
 each('river_links',item=>{refs(item);if(!rivers.has(item.river)||!evidenceIds.has(item.evidence_id)||item.confirmation_status!=='pending'||typeof item.explanation!=='string'||!item.explanation.trim())errors.push(item.id+':river_link_shape');});
 each('future_direction_drafts',item=>{refs(item);if(!rivers.has(item.river)||item.confirmation_status!=='pending'||typeof item.name!=='string'||!item.name.trim()||typeof item.support!=='string'||!item.support.trim()||typeof item.unknown!=='string'||!item.unknown.trim()||typeof item.next_action!=='string'||!item.next_action.trim())errors.push(item.id+':direction_shape');});
 each('unknowns',item=>{refs(item,false);if(!topics.has(item.topic)||!reasons.has(item.reason))errors.push(item.id+':unknown_shape');});
  for(const topic of skippedTopics){
    const unknown=(value.unknowns??[]).some(item=>item?.topic===topic&&item?.reason==='skipped');
    const inferred=(value.capital_links??[]).some(item=>item?.capital===topic)||(value.claims??[]).some(item=>item?.kind==='constraint'&&Array.isArray(item.input_refs)&&item.input_refs.includes(topic));
    if(!unknown||inferred)errors.push(`跳过的敏感主题 ${topic} 必须保持未知且不得补推`);
  }
 return {ok:errors.length===0,errors};
}
