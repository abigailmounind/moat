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
console.log('Scaffold DOM passed: dynamic review, escaped edits, save, personal map, direction draft, existing-path reuse and unsaved-input retention.');
