import {validGrowthProof} from './profile.js';
export const riverNames={survival:'生存之河',ability:'能力之河',love:'热爱之河'};
export const capitalNames={human:'人力资本',social:'社会资本',psychological:'心理资本',financial:'财务资本',physical:'身体资本'};
export const statusNames={exploring:'探索中',active:'推进中',paused:'暂时搁置'};
export const growthTypes={action:'行动记录',result:'成果记录',reflection:'复盘与发现'};
export const emptyWorkspace=()=>({version:1,revision:0,paths:[],plans:[],growth:[]});
export function validDate(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const d=new Date(`${value}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;}

const text=value=>typeof value==='string'&&value.length<=4000;
const validContext=g=>g.context===undefined||(Array.isArray(g.context)&&g.context.every(c=>c&&text(c.pathId)&&text(c.pathName)&&Object.hasOwn(riverNames,c.river)));
const unique=values=>new Set(values).size===values.length;
function baseValid(item){return item&&text(item.id)&&item.id.length>0&&text(item.name)&&item.name.trim().length>0&&item.name.length<=120&&Object.hasOwn(riverNames,item.river)&&Object.hasOwn(statusNames,item.status)&&text(item.goal)&&text(item.notes);}
export function validWorkspace(value){
 if(!value||value.version!==1||!Number.isSafeInteger(value.revision)||value.revision<0||!Array.isArray(value.paths)||!Array.isArray(value.plans))return false;
 const growth=value.growth??[];
 if(!Array.isArray(growth)||!unique([...value.paths,...value.plans,...growth].map(x=>x?.id)))return false;
 if(!growth.every(g=>g&&validContext(g)&&(!g.proof||validGrowthProof(g.proof,g.id))&&text(g.id)&&g.id&&text(g.name)&&g.name.trim()&&g.name.length<=120&&validDate(g.date)&&Object.hasOwn(growthTypes,g.type)&&['action','result','reflection','source','planId','milestoneId','planName','milestoneName'].every(k=>text(g[k]))&&(!g.planId?!g.milestoneId:value.plans.some(p=>p?.id===g.planId&&(!g.milestoneId||(Array.isArray(p.milestones)&&p.milestones.some(m=>m?.id===g.milestoneId)))))))return false;
 const pathIds=new Set(value.paths.map(x=>x?.id));
 return value.paths.every(p=>baseValid(p)&&(p.sourceDirectionId===undefined||text(p.sourceDirectionId))&&['support','gap','constraints','nextAction'].every(k=>text(p[k])))&&value.plans.every(p=>baseValid(p)&&Array.isArray(p.capitals)&&unique(p.capitals)&&p.capitals.length>0&&p.capitals.every(c=>Object.hasOwn(capitalNames,c))&&Array.isArray(p.pathIds)&&unique(p.pathIds)&&p.pathIds.every(id=>pathIds.has(id))&&Array.isArray(p.milestones)&&unique(p.milestones.map(m=>m?.id))&&p.milestones.every(m=>m&&text(m.id)&&text(m.name)&&m.name.trim()&&text(m.criterion)&&typeof m.done==='boolean'&&Array.isArray(m.actions)&&unique(m.actions.map(a=>a?.id))&&m.actions.every(a=>a&&text(a.id)&&text(a.text)&&a.text.trim()&&typeof a.done==='boolean')));
}
