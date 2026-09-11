// DOM behavior checks; supply a separately installed jsdom path. No visual assertions.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {JSDOM}=await import(pathToFileURL(process.argv[2]).href);
let seq=0;
async function page(module,url,raw={}){
 const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/'+url}),errors=[];
 dom.window.addEventListener('error',e=>errors.push(e.error));
 for(const k of ['window','document','location','localStorage','sessionStorage','FormData'])Object.defineProperty(globalThis,k,{configurable:true,value:dom.window[k]});
 window.confirm=()=>true;window.matchMedia=()=>({matches:true,addEventListener(){}});window.scrollBy=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
 for(const [key,value] of Object.entries(raw))localStorage.setItem(key,value);
 await import(`../frontend/src/${module}.js?scaffold=${seq++}`);
 const q=s=>{const el=document.querySelector(s);assert.ok(el,`Missing ${s}`);return el;};
 return {q,click:s=>q(s).click(),fill(s,value){const el=q(s);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));},raw:()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])),close(){assert.deepEqual(errors,[]);dom.window.close();}};
}
let p=await page('exploration','?view=explore');p.click('[data-next]');p.click('[data-single=situation][data-value=change]');p.click('[data-next]');p.click('[data-next]');p.click('[data-single=experience][data-value=project]');p.click('[data-next]');p.click('[data-toggle=actions][data-value=organize]');p.click('[data-next]');p.click('[data-toggle=outcomes][data-value=artifact]');p.click('[data-analyze]');
await new Promise(resolve=>setTimeout(resolve,750));
assert.equal(document.querySelectorAll('[data-understanding-card]').length,7);
for(const button of [...document.querySelectorAll('[data-card-value=confirmed]')])p.click(`[data-card="${button.dataset.card}"][data-card-value=confirmed]`);
const evidenceCard=[...document.querySelectorAll('[data-understanding-card]')].find(n=>n.textContent.includes('经历草稿'));
p.click(`[data-card="${evidenceCard.dataset.understandingCard}"][data-card-value=editing]`);p.fill('[data-edit-value]','<我的项目经历>');p.click('[data-save-edit]');
p.click('[data-next]');p.click('[data-next]');assert.match(p.q('.explore-card').textContent,/<我的项目经历>/);assert.equal(document.querySelector('.explore-card img'),null);p.click('[data-next]');p.click('[data-next]');p.click('[data-apply-update]');assert.match(p.q('h1').textContent,/已保存/);let raw=p.raw();p.close();
p=await page('app','',raw);assert.match(p.q('.top-tools').textContent,/我的本地地图/);p.click('#river-ability');assert.match(p.q('#preview').textContent,/这些行动可能在其他情境复用/);p.click('#preview [data-future]');const bridge=p.q('#detail-panel a[href*="direction="]').getAttribute('href');raw=p.raw();p.close();
p=await page('workspaces',bridge.replace(/^\//,''),raw);assert.match(p.q('#workspace-notice').textContent,/草稿/);assert.equal(p.q('[name=river]').value,'ability');p.click('button[type=submit]');p.click('[data-edit]');p.fill('[name=notes]','切换河流仍要保留');p.click('[data-river=love]');assert.equal(p.q('[name=notes]').value,'切换河流仍要保留');p.click('button[type=submit]');raw=p.raw();p.close();
p=await page('workspaces',bridge.replace(/^\//,''),raw);assert.match(p.q('#workspace-notice').textContent,/已有保存的路径/);assert.equal(document.querySelector('#workspace-form'),null);assert.match(p.q('.workspace-paper').textContent,/切换河流仍要保留/);p.close();
// A shared proof must keep its entry river through detail, future and Escape.
const {createPrototypeProfile}=await import('../shared/profile.js');
const {saveExplorationProfile,storageKey}=await import('../frontend/src/exploration-storage.js');
const profile=createPrototypeProfile();
for(const id of ['shared','unlinked'])profile.evidence[id]={id,title:`合成证明 ${id}`,experience:'参与项目',actions:['整理信息'],result:null,source:null,limitations:[],source_type:'user_self_report',confirmation_status:'confirmed'};
for(const river of ['ability','love'])profile.riverLinks[river]={id:river,evidence_id:'shared',river,explanation:`${river} 的确认关联`,uncertainty:null,confirmation_status:'confirmed'};
const seed={};assert.equal(saveExplorationProfile({setItem:(key,value)=>seed[key]=value},profile).ok,true);
p=await page('app','',seed);
for(const entry of ['preview','summary']){
 if(entry==='preview')p.click('#river-love');else p.click('#map-summary');
 p.click(`${entry==='preview'?'#preview':'#detail-panel'} [data-proof="shared"][data-river="love"]`);
 assert.equal(document.activeElement.id,'detail-title');
 assert.ok(p.q('#river-love').classList.contains('selected'));
 assert.equal(p.q('#detail-panel [data-future]').dataset.future,'love');
 p.click('#detail-panel [data-future]');
 assert.match(p.q('#detail-panel .eyebrow').textContent,/热爱之河/);
 document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(p.q('#detail-panel').hidden,true);
 assert.equal(p.q('#preview').dataset.river,'love');
 assert.equal(document.activeElement.id,entry==='preview'?'river-love':'map-summary');
}
p.click('#preview [data-proof]');p.click('#detail-panel [data-panel="local-proofs"]');
p.click('#detail-panel [data-proof="shared"]');
assert.equal(p.q('#detail-panel [data-future]').dataset.future,'ability');
p.click('#detail-panel [data-panel="local-proofs"]');p.click('#detail-panel [data-proof="unlinked"]');
assert.equal(document.querySelector('#detail-panel [data-future]'),null);
assert.match(p.q('#detail-panel').textContent,/未保留河流关联/);
assert.equal(p.raw()[storageKey],seed[storageKey]);p.close();
console.log('Scaffold DOM passed: shared-proof river context, future navigation, Escape focus, unlinked proof, unchanged storage; dynamic review, escaped edits, save, personal map, direction draft, existing-path reuse and unsaved-input retention.');
