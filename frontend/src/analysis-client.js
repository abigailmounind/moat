import {validateUnderstandingProposal} from './exploration-analysis.js';

// Available for a future explicitly configured provider. The UI defaults to local rules.
export function createRemoteAnalysisAdapter({fetchImpl=globalThis.fetch,timeout=20000}={}){
 return {async analyze(session,{signal}={}){
  const controller=new AbortController();
  const abort=()=>controller.abort();
  if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,timeout);
  try{
   const response=await fetchImpl('/api/analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:{id:session.id,flowVersion:session.flowVersion,answers:session.answers}}),signal:controller.signal});
   if(!response.ok)throw new Error(response.status===503?'analysis_unavailable':'analysis_failed');
   const value=await response.json();
   if(value.session_id!==session.id||!validateUnderstandingProposal(value,{inputIds:session.answers.map(a=>a.questionId)}).ok)throw new Error('invalid_analysis_contract');
   return value;
  }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
 }};
}
