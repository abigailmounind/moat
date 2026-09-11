// DOM event regression; supply temporary jsdom path. Does not verify browser layout.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {WORKSPACE_KEY,newGrowth,newPath,newPlan,emptyWorkspace} from '../frontend/src/workspace-model.js';
const {JSDOM}=await import(pathToFileURL(process.argv[2]).href);
let sequence=0;
async function page(view,raw){
 const dom=new JSDOM('<div id="app"></div>',{url:`http://localhost/${view==='map'?'?panel=local-proofs':'?view=growth'}`}),errors=[];
 dom.window.addEventListener('error',event=>errors.push(event.error));
 for(const key of ['window','document','location','localStorage','sessionStorage','FormData'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
 window.confirm=()=>true;window.matchMedia=()=>({matches:true,addEventListener(){}});window.scrollBy=()=>{};window.HTMLElement.prototype.scrollIntoView=()=>{};
 localStorage.setItem(WORKSPACE_KEY,raw);
 await import(`../frontend/src/${view==='map'?'app':'growth'}.js?stage11=${sequence++}`);
 const q=s=>{const el=document.querySelector(s);assert.ok(el,`Missing ${s}`);return el;};
 return {q,click:s=>q(s).click(),event(s,type){q(s).dispatchEvent(new window.MouseEvent(type,{bubbles:true}));},fill(name,value){const el=q(`[name="${name}"]`);el.value=value;el.dispatchEvent(new window.Event('input',{bubbles:true}));},raw:()=>localStorage.getItem(WORKSPACE_KEY),close(){assert.deepEqual(errors,[]);dom.window.close();}};
}
const r={...newGrowth(),name:'<成果测试>',action:'整理访谈笔记',result:'完成问题清单',source:'我的笔记'};
const riverPath={...newPath(),name:'热爱写作路径',river:'love'},riverPlan={...newPlan(),name:'热爱写作计划',river:'love',pathIds:[riverPath.id],capitals:['psychological']};
let p=await page('growth',JSON.stringify({...emptyWorkspace(),paths:[riverPath],plans:[riverPlan],growth:[r]}));
p.click('[data-publish]');p.fill('river','ability');p.click('#proof-form button[type=submit]');assert.match(p.q('[data-form-error]').textContent,/说明/);
p.fill('explanation','整理方法可复用');
const original=window.Storage.prototype.setItem;window.Storage.prototype.setItem=()=>{throw new Error('quota');};p.click('#proof-form button[type=submit]');assert.match(p.q('[data-form-error]').textContent,/保存/);assert.ok(p.q('#proof-form'));window.Storage.prototype.setItem=original;
p.click('#proof-form button[type=submit]');let raw=p.raw();assert.ok(JSON.parse(raw).growth[0].proof);p.close();
p=await page('map',raw);assert.match(p.q('#detail-panel').textContent,/<成果测试>/);
p.click('[data-close]');assert.ok(p.q(`a.path-map-node[href="/?view=paths&item=${riverPath.id}"]`));assert.ok(p.q(`a.plan-map-node[href="/?view=plans&item=${riverPlan.id}"]`));p.event('.river-hit[data-hover-river="love"]','pointerover');assert.equal(p.q('.river-system-love').classList.contains('emphasized'),true);p.click('#river-love');assert.match(p.q('#preview').textContent,/0 个证明 · 1 条路径 · 1 个计划/);assert.match(p.q('#preview').textContent,/热爱写作路径/);assert.match(p.q('#preview').textContent,/热爱写作计划/);assert.doesNotMatch(p.q('#preview').textContent,/<成果测试>/);assert.equal(document.querySelector('#local-proofs-entry'),null);assert.equal(p.q('.river-system-love').classList.contains('emphasized'),true);assert.equal(p.q('.river-system-ability').classList.contains('subdued'),true);assert.equal(p.q('.path-map-node').dataset.river,'love');p.event('.river-hit[data-select-river="survival"]','click');assert.equal(p.q('#preview').dataset.river,'survival');assert.equal(p.q('.river-system-survival').classList.contains('emphasized'),true);
p.click('#river-ability');assert.doesNotMatch(p.q('#preview').textContent,/热爱写作路径|热爱写作计划/);assert.match(p.q('#river-love .label-bottom').textContent,/0 证明 · 1 路径 · 1 计划/);
p.click(`[data-proof="growth_${r.id}"]`);assert.match(p.q('#detail-panel').textContent,/完成问题清单/);assert.ok(p.q(`a[href="/?view=growth&item=${r.id}"]`));
p.click('[data-delete-local]');raw=p.raw();assert.equal(JSON.parse(raw).growth.length,1);assert.equal(JSON.parse(raw).growth[0].proof,undefined);assert.equal(document.querySelector('#local-proofs-entry'),null);p.close();
p=await page('growth',raw);assert.ok(p.q('[data-publish]'));p.click('[data-publish]');p.click('#proof-form button[type=submit]');p.click('[data-edit]');p.fill('result','补充后的成果');p.click('#growth-form button[type=submit]');assert.equal(Object.values(JSON.parse(p.raw()).growth[0].proof.evidence)[0].result,'完成问题清单');p.click('[data-delete]');assert.equal(JSON.parse(p.raw()).growth.length,0);p.close();
console.log('Stage 11 DOM passed: confirm, validation, per-river workspace sync, map detail, source link, revoke, snapshot editing and deletion.');
