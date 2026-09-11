import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createAnalysisService} from '../backend/analysis-service.mjs';
import {createRemoteAnalysisAdapter} from '../frontend/src/analysis-client.js';
import {validateUnderstandingProposal,createSyntheticAnalysisAdapter} from '../frontend/src/exploration-analysis.js';
import {runSyntheticAnalysis,createPrototypeProfile,confirmAnalysis,applyMapChangeSet,createMapChangeSet,validatePrototypeProfile} from '../frontend/src/exploration-domain.js';
import {reviewItems,confirmedContent} from '../frontend/src/exploration-review.js';
import {personalMap} from '../frontend/src/personal-map.js';
import {prepareDirectionPath} from '../frontend/src/direction-path.js';
import {emptyWorkspace,newPath,newPlan} from '../frontend/src/workspace-model.js';
import {commitExplorationChange,saveExplorationProfile,loadExplorationProfile,storageKey} from '../frontend/src/exploration-storage.js';
import {sidebarMarkup} from '../frontend/src/sidebar.js';

const session={id:'boundary',flowVersion:'stage10-minimum-v0.2',answers:[{questionId:'q3',kind:'experience',value:'project',skipped:false},{questionId:'q4',kind:'actions',value:['organize'],skipped:false},{questionId:'q5',kind:'outcome',value:{outcomes:['artifact'],source:null},skipped:false},{questionId:'q6',kind:'method',value:'信息分类法',skipped:false},{questionId:'q7',kind:'river_basis',value:['ability'],skipped:false}]};
const proposal=()=>runSyntheticAnalysis(session);
const memory=()=>{let raw=null;return {getItem:()=>raw,setItem:(_,value)=>{raw=value;}};};
const confirm=p=>confirmAnalysis(p,Object.fromEntries(reviewItems(p).map(i=>[i.id,'confirmed'])));

test('shared sidebar keeps map navigation structure and current-page state',()=>{
 for(const active of ['explore','paths','plans','growth']){
  const html=sidebarMarkup(active);
  assert.equal((html.match(/class="nav-item/g)??[]).length,5);
  assert.equal((html.match(/<svg class="icon"/g)??[]).length,7);
  assert.match(html,new RegExp('nav-item active[^>]+aria-current="page"'));
  assert.ok(html.includes('landscape-avatar')&&html.includes('/?panel=settings'));
 }
});

test('dynamic confirmation isolates multiple evidence, associations, unknowns and edits',()=>{
 const p=proposal(),second={...p.evidence_drafts[0],id:'second',title:'第二段经历'};p.evidence_drafts.push(second);p.unknowns.push({...p.unknowns[0],id:'second_unknown',topic:'river'});
 p.capital_links.push({...p.capital_links[0],id:'second_capital',capital:'social',evidence_id:'second'});
 const cards=Object.fromEntries(reviewItems(p).map(i=>[i.id,'confirmed']));cards[p.evidence_drafts[0].id]='deleted';cards.second='modified';
 const c=confirmAnalysis(p,cards,{second:'<修正后的第二段>',[p.unknowns[0].id]:'仅这一项有修改'});
 assert.equal(c.evidence.length,1);assert.equal(c.evidence[0].title,'<修正后的第二段>');assert.equal(c.capitalLinks[0].capital,'social');assert.equal(c.riverLinks.length,0);
 assert.notEqual(c.unknowns[0].explanation,c.unknowns[1].explanation);assert.match(confirmedContent('evidence',c),/&lt;修正后的第二段&gt;/);
 const profile=applyMapChangeSet(createPrototypeProfile(),createMapChangeSet(c)).profile;assert.ok(validatePrototypeProfile(profile));assert.equal(Object.keys(profile.directions).length,0);
});
test('personal map has no synthetic facts, supports empty data and separates all three rivers',()=>{
 const empty=personalMap(createPrototypeProfile());assert.equal(empty.rivers.length,3);assert.equal(empty.proofs.length,0);assert.equal(empty.directions.length,0);
 const profile=applyMapChangeSet(createPrototypeProfile(),createMapChangeSet(confirm(proposal()))).profile;
 const map=personalMap(profile);assert.equal(map.rivers.find(r=>r.id==='ability').proofs.length,1);assert.equal(map.rivers.find(r=>r.id==='love').proofs.length,0);
 assert.ok(!JSON.stringify(map).includes('持续写作与生活记录'));
});
test('personal map projects saved paths and plans only into their own river',()=>{
 const path={...newPath(),name:'热爱路径',river:'love'},plan={...newPlan(),name:'热爱计划',river:'love',pathIds:[path.id],capitals:['psychological']};
 const map=personalMap(createPrototypeProfile(),{...emptyWorkspace(),paths:[path],plans:[plan]});
 const love=map.rivers.find(r=>r.id==='love'),ability=map.rivers.find(r=>r.id==='ability');
 assert.deepEqual(love.paths.map(item=>item.name),['热爱路径']);assert.deepEqual(love.plans.map(item=>item.name),['热爱计划']);assert.deepEqual(love.paths[0].point,[780,370]);assert.deepEqual(love.plans[0].point,[820,395]);assert.match(love.status,/工作区记录/);assert.match(love.summary,/还没有已确认的支撑证明/);
 assert.deepEqual(ability.paths,[]);assert.deepEqual(ability.plans,[]);assert.equal(ability.status,'等待探索');
});
test('workspace map nodes use separate coordinates for all three rivers',()=>{
 const paths=Object.keys({survival:1,ability:1,love:1}).map(river=>({...newPath(),name:`${river} path`,river}));
 const map=personalMap(createPrototypeProfile(),{...emptyWorkspace(),paths});
 const points=Object.fromEntries(map.rivers.map(river=>[river.id,river.paths[0].point]));
 assert.notDeepEqual(points.survival,points.ability);assert.notDeepEqual(points.love,points.ability);assert.notDeepEqual(points.love,points.survival);
});
test('direction opens a draft once and never overwrites an edited saved path',()=>{
 const direction={id:'direction',river:'ability',name:'换个小情境验证',support:'已有一次实践',unknown:'跨情境表现待验证',next_action:'完成一次小实践',confirmation_status:'confirmed'},data=emptyWorkspace();assert.equal(prepareDirectionPath(data,{...direction,confirmation_status:'pending'}),null);
 const first=prepareDirectionPath(data,direction);assert.equal(first.existing,false);assert.equal(data.paths.length,0);
 data.paths.push({...first.path,notes:'我的修改'});const again=prepareDirectionPath(data,{...direction,name:'新分析'});assert.equal(again.existing,true);assert.equal(again.path.notes,'我的修改');assert.equal(again.path.name,first.path.name);
});
test('exploration saves merge unrelated records, refuse stale deletion and preserve corrupt raw data',()=>{
 const storage=memory(),base=createPrototypeProfile(),c=createMapChangeSet(confirm(proposal()));
 const unrelated=runSyntheticAnalysis({...session,id:'another'});saveExplorationProfile(storage,applyMapChangeSet(base,createMapChangeSet(confirm(unrelated))).profile);
 assert.equal(commitExplorationChange(storage,base,c).ok,true);const saved=loadExplorationProfile(storage).profile;assert.equal(Object.keys(saved.evidence).length,2);
 const changed=structuredClone(saved);delete changed.evidence[c.scope.evidence[0]];changed.capitalLinks={};changed.riverLinks={};saveExplorationProfile(storage,changed);
 assert.equal(commitExplorationChange(storage,saved,c).ok,false);
 storage.setItem(storageKey,'broken');assert.equal(commitExplorationChange(storage,base,c).ok,false);assert.equal(storage.getItem(storageKey),'broken');
});
test('malformed candidate structures fail validation without throwing',async()=>{
 for(const value of [null,[],{}, {...proposal(),claims:4},{...proposal(),claims:[null]},{...proposal(),capital_links:[{id:'bad',input_refs:{}}]}])assert.equal(validateUnderstandingProposal(value).ok,false);
 const controller=new AbortController();controller.abort();await assert.rejects(createSyntheticAnalysisAdapter({delay:0}).analyze(session,{signal:controller.signal}),e=>e.name==='AbortError');
});
async function request(service,{method='POST',body=JSON.stringify({session}),headers={}}={}){
 const req=Readable.from([body]);req.method=method;req.url='/api/analysis';req.headers={host:'127.0.0.1:4173',origin:'http://127.0.0.1:4173','content-type':'application/json',...headers};
 const res=new EventEmitter();res.writeHead=status=>{res.status=status;};res.end=value=>{res.body=JSON.parse(value);};await service(req,res);return res;
}
test('analysis server is disabled by default and protects origin, input, failure and timeout boundaries',async()=>{
 assert.equal((await request(createAnalysisService())).status,503);
 let calls=0;const service=createAnalysisService({provider:{analyze(s){calls++;assert.deepEqual(Object.keys(s),['id','flowVersion','answers']);return runSyntheticAnalysis(s);}}});
 assert.equal((await request(service,{headers:{origin:'https://elsewhere.invalid'}})).status,403);assert.equal(calls,0);
 assert.equal((await request(service,{body:'bad json'})).status,400);assert.equal((await request(service,{body:'x'.repeat(33000)})).status,413);
 assert.equal((await request(service)).status,200);
 assert.equal((await request(createAnalysisService({provider:{analyze:()=>({})}}))).status,502);
 const secret='private input must not be returned';const failure=await request(createAnalysisService({provider:{analyze(){throw Error(secret);}}}));assert.equal(JSON.stringify(failure.body).includes(secret),false);
 assert.equal((await request(createAnalysisService({provider:{analyze:()=>new Promise(()=>{})},timeout:2}))).status,504);
});
test('remote client checks session identity and always keeps the caller session unchanged',async()=>{
 const before=structuredClone(session);await assert.rejects(createRemoteAnalysisAdapter({fetchImpl:async()=>({ok:true,json:async()=>({...proposal(),session_id:'wrong'})})}).analyze(session),/invalid_analysis_contract/);
 assert.deepEqual(session,before);
});
