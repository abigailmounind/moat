import {createPrototypeProfile,growthEvidenceId,validGrowthProof} from './profile.js';

export function createGrowthProof(record,{capital='',river='',explanation=''}={}){
 if(!record.action.trim()||!record.result.trim())throw new Error('请先补充具体行动和成果，再保存为证明。');
 if((capital||river)&&!explanation.trim())throw new Error('请说明这份成果为什么支持所选关联。');
 const profile=createPrototypeProfile(),id=growthEvidenceId(record.id);
 profile.evidence[id]={id,title:record.name,experience:[record.planName,record.milestoneName].filter(Boolean).join(' · ')||'独立成果记录',actions:[record.action],result:record.result,source:record.source||null,limitations:['用户自述，尚未独立核实；新增证明不代表资本自动增强。'],source_type:'user_self_report',confirmation_status:'confirmed',date:record.date};
 if(capital)profile.capitalLinks[`${id}_capital`]={id:`${id}_capital`,evidence_id:id,capital,aspect:'成果记录',explanation:explanation.trim(),confirmation_status:'confirmed'};
 if(river)profile.riverLinks[`${id}_river`]={id:`${id}_river`,evidence_id:id,river,explanation:explanation.trim(),uncertainty:'支撑程度仍待更多经历验证。',confirmation_status:'confirmed'};
 if(!validGrowthProof(profile,record.id))throw new Error('证明或关联格式无效，请检查后重试。');
 return profile;
}
