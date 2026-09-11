import {escapeHtml as e} from './exploration-render-utils.js';
export const reviewFields={claims:'claims',evidence_drafts:'evidence',capital_links:'capitalLinks',river_links:'riverLinks',future_direction_drafts:'directions',unknowns:'unknowns'};
const rivers={survival:'生存之河',ability:'能力之河',love:'热爱之河'};
const capitals={human:'人力资本',social:'社会资本',psychological:'心理资本',financial:'财务资本',physical:'身体资本'};
const topics={financial:'财务条件',physical:'身体条件',evidence:'证明',river:'河流关联',capital:'资本关联',direction:'未来方向',conflict:'相互矛盾的回答'};
const reasons={skipped:'你选择了跳过，继续保持未知。',not_asked:'本轮尚未询问必要信息。',insufficient_evidence:'已有信息还不足以下结论。',conflicting_inputs:'回答中存在冲突，需要进一步澄清。'};
const inputs={q1:'当前选择',q2:'影响决定的因素',q3:'经历',q4:'具体行动',q5:'成果与来源'};
export const displayValue=value=>({course:'课程 / 研究',work:'工作任务',project:'项目 / 作品',collaboration:'协作经历',interest:'长期兴趣实践',organize:'整理信息或需求',create:'制作具体成果',coordinate:'协调分工',solve:'解决具体问题',research:'研究与分析',practice:'持续练习',artifact:'完成可查看成果',problem:'解决一个具体问题',feedback:'得到他人反馈',continued:'持续做了一段时间',unclear:'暂时没有明确结果',none:'暂时没有来源',other:'其他记录'}[value]??value);
export function reviewItems(proposal){
 return Object.entries(reviewFields).flatMap(([field,target])=>(proposal[field]??[]).map(item=>{
  const editField={claims:'text',evidence_drafts:'title',capital_links:'explanation',river_links:'explanation',future_direction_drafts:'name',unknowns:'explanation'}[field];
  const body=item[editField]??reasons[item.reason]??'需要继续补充。';
  const title={claims:'当前理解',evidence_drafts:'经历草稿',capital_links:`资本关联 · ${capitals[item.capital]}`,river_links:`河流关联 · ${rivers[item.river]}`,future_direction_drafts:`未来方向 · ${rivers[item.river]}`,unknowns:`保持未知 · ${topics[item.topic]}`}[field];
  const detail=field==='evidence_drafts'?`经历：${displayValue(item.experience)}；行动：${item.actions.map(displayValue).join('、')}；结果：${(item.result??'尚未提供').split('、').map(displayValue).join('、')}`:field==='future_direction_drafts'?`支持：${item.support}；待验证：${item.unknown}；下一步：${item.next_action}`:'';
  return {id:item.id,field,target,editField,title,body,detail,source:(item.input_refs??[]).map(id=>inputs[id]??id).join('、')||'本轮未提供',limit:item.uncertainty??item.limitations?.join('；')??(field==='unknowns'?reasons[item.reason]:'用户确认只表示接受这条理解，仍需实践验证。')};
 }));
}
export function confirmReview(proposal,cards,edits={}){
 const result={sessionId:proposal.session_id,scope:{},excludedProposalIds:[],claims:[],evidence:[],capitalLinks:[],riverLinks:[],directions:[],unknowns:[]};
 for(const entry of reviewItems(proposal)){
  const {id,field,target,editField}=entry,status=cards[id];
  if(target!=='claims')(result.scope[target]??=[]).push(id);
  if(status==='deleted')result.excludedProposalIds.push(id);
  if(!['confirmed','modified'].includes(status))continue;
  const item=proposal[field].find(x=>x.id===id);
  result[target].push({...item,[editField]:edits[id]?.trim()||entry.body,confirmation_status:status});
 }
 const kept=new Set(result.evidence.map(x=>x.id));
 result.capitalLinks=result.capitalLinks.filter(x=>kept.has(x.evidence_id));
 result.riverLinks=result.riverLinks.filter(x=>kept.has(x.evidence_id));
 result.directions=result.directions.filter(x=>!x.evidence_id||kept.has(x.evidence_id));
 return result;
}
export function confirmedContent(step,c){
 if(step==='result')return `<h1 tabindex="-1">看看这次确认了什么</h1>${c.claims?.map(x=>`<p class="lead small">${e(x.text)}</p>`).join('')||'<p>本轮没有保留概括性判断。</p>'}<div class="result-highlight"><strong>${c.evidence.length} 段经历 · ${c.capitalLinks.length+c.riverLinks.length} 条关联</strong><p>这些内容由你确认，来源仍为用户自述。</p></div>${c.directions?.map(x=>`<section class="result-evidence"><h2>${e(x.name)}</h2><p>${e(x.support)}</p><p>待验证：${e(x.unknown)}</p><p>下一步：${e(x.next_action)}</p><p>保存到我的河后，可在对应河流的未来方向中建立路径。</p></section>`).join('')||''}`;
 if(step==='evidence')return `<h1 tabindex="-1">每条关联，都回到具体经历</h1>${c.evidence.map(x=>`<section class="result-evidence"><h2>${e(x.title)}</h2><p>${e(displayValue(x.experience))}</p><p>做了：${e(x.actions.map(displayValue).join('、'))}</p><p>形成了：${e((x.result??'尚未提供').split('、').map(displayValue).join('、'))}</p><p>来源：${e(displayValue(x.source??'none'))}</p><dl>${c.capitalLinks.filter(l=>l.evidence_id===x.id).map(l=>`<dt>${capitals[l.capital]}</dt><dd>${e(l.explanation)}</dd>`).join('')}${c.riverLinks.filter(l=>l.evidence_id===x.id).map(l=>`<dt>${rivers[l.river]}</dt><dd>${e(l.explanation)}</dd>`).join('')}</dl><p>${e(x.limitations.join('；'))}</p></section>`).join('')||'<p>本轮没有保留经历证明；依赖它的关联也不会写入地图。</p>'}`;
 if(step==='unknowns')return `<h1 tabindex="-1">还有哪些需要慢慢弄清楚</h1><div class="unknown-list">${c.unknowns.map(x=>`<div><strong>${topics[x.topic]}</strong><p>${e(x.explanation??reasons[x.reason])}</p></div>`).join('')||'<p>本轮未保留未知说明，不代表所有问题都已得到回答。</p>'}</div>`;
 return '';
}
