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

const requestJson=async(response,code)=>{
 let value;try{value=await response.json();}catch{throw new Error('invalid_analysis_response');}
 if(!response.ok)throw new Error(value?.error?.code||code);
 return value;
};

export function createProductAnalysisAdapter({fetchImpl=globalThis.fetch,timeout=85000}={}){
 return {
  async available(){
   try{const response=await fetchImpl('/api/v1/capabilities',{headers:{Accept:'application/json'}}),value=await requestJson(response,'capabilities_unavailable');return value?.analysis?.model==='configured'&&value.analysis.freeOnly===true&&value.analysis.routing==='server_managed';}catch{return false;}
  },
  async analyze(session,{signal}={}){
   const controller=new AbortController(),abort=()=>controller.abort(new DOMException('分析已取消','AbortError'));
   if(signal?.aborted)abort();else signal?.addEventListener('abort',abort,{once:true});
   const timer=setTimeout(()=>controller.abort(new DOMException('分析等待超时','AbortError')),timeout);
   try{
    await requestJson(await fetchImpl('/api/v1/session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:controller.signal}),'session_unavailable');
    const value=await requestJson(await fetchImpl('/api/v1/analyses/model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session:{id:session.id,flowVersion:session.flowVersion,answers:session.answers}}),signal:controller.signal}),'analysis_failed');
    const proposal=value?.analysis?.proposal,inputIds=session.answers.map(answer=>answer.questionId);
    if(!['model','rules'].includes(value?.analysis?.mode)||proposal?.session_id!==session.id||!validateUnderstandingProposal(proposal,{inputIds}).ok)throw new Error('invalid_analysis_contract');
    return {proposal,mode:value.analysis.mode,fallbackReason:value.analysis.fallbackReason??null};
   }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
  }
 };
}
