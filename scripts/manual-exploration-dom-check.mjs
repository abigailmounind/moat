// Supply a separately installed jsdom. This verifies DOM behavior, not layout.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {JSDOM}=await import(pathToFileURL(process.argv[2]).href);
const dom=new JSDOM('<div id="app"></div>',{url:'http://localhost/?view=explore'});
const errors=[];
dom.window.addEventListener('error',event=>errors.push(event.error));
for(const key of ['window','document','location','localStorage'])Object.defineProperty(globalThis,key,{configurable:true,value:dom.window[key]});
window.scrollBy=()=>{};
await import('../frontend/src/exploration.js');
const click=selector=>{const button=document.querySelector(selector);assert.ok(button,selector);assert.equal(button.disabled,false);button.click();};
try{
 click('[data-next]');click('[data-single="situation"][data-value="change"]');click('[data-next]');
 click('[data-next]');click('[data-single="experience"][data-value="project"]');click('[data-next]');
 click('[data-toggle="actions"][data-value="organize"]');click('[data-next]');
 click('[data-toggle="outcomes"][data-value="unclear"]');click('[data-manual-analysis]');
 assert.match(document.querySelector('.explore-kicker').textContent,/手工整理/);
 assert.equal(localStorage.length,0);
 assert.equal(document.querySelector('[data-next]').disabled,true);
 for(const button of [...document.querySelectorAll('[data-card-value="confirmed"]')])click(`[data-card="${button.dataset.card}"][data-card-value="confirmed"]`);
 for(let step=0;step<4;step++)click('[data-next]');
 assert.match(document.querySelector('.explore-kicker').textContent,/手工模式/);
 assert.match(document.querySelector('.preview-copy').textContent,/定性关联 · 0 条/);
 assert.match(document.querySelector('.preview-copy').textContent,/候选方向 · 0 条/);
 assert.equal(localStorage.length,0);
 const write=window.Storage.prototype.setItem;
 window.Storage.prototype.setItem=()=>{throw Error('synthetic quota');};
 click('[data-apply-update]');await new Promise(resolve=>setTimeout(resolve,0));assert.ok(document.querySelector('.save-error'));assert.equal(localStorage.length,0);
 window.Storage.prototype.setItem=write;
 click('[data-apply-update]');await new Promise(resolve=>setTimeout(resolve,0));assert.match(document.querySelector('h1').textContent,/已保存/);
 const saved=localStorage.getItem(localStorage.key(0));assert.ok(saved);
 click('[data-back]');click('[data-apply-update]');await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(JSON.parse(localStorage.getItem(localStorage.key(0))).profile,JSON.parse(saved).profile);
 assert.deepEqual(errors,[]);
 console.log('Manual exploration DOM passed: direct entry, confirmation gate, zero inferred links/directions, explicit save, quota failure, retry and duplicate save.');
}finally{dom.window.close();}
