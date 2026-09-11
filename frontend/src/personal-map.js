import {rivers as riverGeometry} from './data.js';
import {localProofFromProfile} from './local-proof.js';
import {escapeHtml as e} from './exploration-render-utils.js';

const workspaceAnchors={
 love:{paths:[[780,370],[635,330],[505,265],[660,160]],plans:[[820,395],[700,338],[550,305],[735,260]]},
 survival:{paths:[[1010,405],[1105,285],[1210,245],[1370,175]],plans:[[970,430],[1060,380],[1280,250],[1210,350]]},
 ability:{paths:[[875,505],[895,600],[920,715],[885,820]],plans:[[885,550],[920,670],[900,770],[890,880]]}
};
const anchoredPoint=(points,index)=>{const [x,y]=points[index%points.length],lap=Math.floor(index/points.length);return [x+lap*10,y+lap*7];};

// Reuse the accepted composition. Counts and prose come only from confirmed local data.
export function personalMap(profile,workspace={paths:[],plans:[]}){
 const capitals={human:'人力资本',social:'社会资本',psychological:'心理资本',financial:'财务资本',physical:'身体资本'};
 const anchors={love:[588,393],survival:[1212,374],ability:[909,722]};
 const proofs=Object.keys(profile.evidence).map(id=>{const p=localProofFromProfile(profile,id);return {...p,point:anchors[p.river]??[770,735],caption:p.title};});
 const directions=Object.values(profile.directions??{}).map(d=>({...d,name:e(d.name),support:e(d.support),gap:e(d.unknown),next:e(d.next_action)}));
 const rivers=riverGeometry.map(r=>{
  const links=Object.values(profile.riverLinks).filter(l=>l.river===r.id),ids=[...new Set(links.map(l=>l.evidence_id))];
  const paths=(workspace.paths??[]).filter(path=>path.river===r.id).map((path,index)=>({id:path.id,name:e(path.name),status:path.status,point:anchoredPoint(workspaceAnchors[r.id].paths,index)}));
  const pathIds=new Set(paths.map(path=>path.id));
  const plans=(workspace.plans??[]).filter(plan=>plan.river===r.id&&plan.pathIds?.length&&plan.pathIds.every(id=>pathIds.has(id))).map((plan,index)=>({id:plan.id,name:e(plan.name),status:plan.status,point:anchoredPoint(workspaceAnchors[r.id].plans,index)}));
  const hasWork=paths.length||plans.length;
  const summary=links.length?links.map(l=>e(l.explanation)).join('；'):hasWork?'这条河已保存路径或计划，还没有已确认的支撑证明；可以在实践后记录成果。':'这条河还没有已确认的支撑记录。可以从一段经历开始探索。';
  return {...r,proofs:ids,paths,plans,capital:[...new Set(Object.values(profile.capitalLinks).filter(l=>ids.includes(l.evidence_id)).map(l=>capitals[l.capital]))],directions:directions.filter(d=>d.river===r.id).map(d=>d.id),summary,status:links.length&&hasWork?'已有确认与工作区记录':links.length?'已有确认记录':hasWork?'已有工作区记录':'等待探索',unknown:'目前仅展示已确认的定性关联；支撑程度和未提供的条件仍待探索。'};
 });
 return {rivers,proofs,directions};
}
