import {validateUnderstandingProposal} from '../../shared/understanding.js';
export {validateUnderstandingProposal} from '../../shared/understanding.js';
import {runSyntheticAnalysis} from './exploration-domain.js';

const wait=(delay,signal)=>new Promise((resolve,reject)=>{
 if(signal?.aborted){reject(new DOMException('分析已取消','AbortError'));return;}
 const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
 const abort=()=>{clearTimeout(timer);reject(new DOMException('分析已取消','AbortError'));};
 const timer=setTimeout(done,delay);
 signal?.addEventListener('abort',abort,{once:true});
});

export function createSyntheticAnalysisAdapter({delay=650,shouldFail=()=>false}={}){
 return {async analyze(session,{signal}={}){
  await wait(delay,signal);
  if(shouldFail())throw new Error('synthetic_analysis_failed');
  const proposal=runSyntheticAnalysis(session),validation=validateUnderstandingProposal(proposal,{inputIds:session.answers.map(answer=>answer.questionId)});
  if(!validation.ok)throw new Error(`invalid_analysis_contract:${validation.errors.join(',')}`);
  return proposal;
 }};
}
