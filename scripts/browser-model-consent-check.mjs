import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {runRulesAnalysis} from '../shared/rules-analysis.js';

const playwrightPath=process.argv[2],executablePath=process.argv[3],baseUrl=(process.argv[4]||'http://127.0.0.1:4173').replace(/\/$/,'');
if(!playwrightPath||!executablePath)throw Error('usage: node scripts/browser-model-consent-check.mjs /path/to/playwright/index.mjs /path/to/chrome [base-url]');
const {chromium}=await import(pathToFileURL(playwrightPath).href),browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});

async function prepare(viewport){
 const context=await browser.newContext({viewport}),page=await context.newPage();let modelCalls=0;const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());
  if(url.pathname==='/api/v1/capabilities'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({analysis:{model:'configured',freeOnly:true,routing:'server_managed'}})});return;}
  if(url.pathname==='/api/v1/session'){await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify({session:{subject:{id:'browser-model-subject'}}})});return;}
  if(url.pathname==='/api/v1/analyses/model'){
   modelCalls++;if(modelCalls>1){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:{code:'model_unavailable',message:'test',retryable:true}})});return;}
   const session=route.request().postDataJSON().session,proposal=runRulesAnalysis(session);
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiVersion:'1',analysis:{mode:'model',routing:'server_managed',proposal}})});return;
  }
  await route.abort();
 });
 await page.goto(`${baseUrl}/?view=explore`);
 await page.locator('[data-next]').click();
 try{await page.getByText('这次你最想理清什么？',{exact:true}).waitFor({timeout:3000});}catch{throw Error(`intro did not advance; h1=${await page.locator('h1').textContent()}; pageErrors=${pageErrors.join('|')}`);}
 await page.getByRole('button',{name:/考虑转向/}).click();
 await page.locator('[data-next]').click();
 await page.locator('[data-next]').click();
 await page.getByRole('button',{name:/项目 \/ 作品/}).click();
 await page.locator('[data-next]').click();
 await page.getByRole('button',{name:/整理信息或需求/}).click();
 await page.locator('[data-next]').click();
 await page.getByRole('button',{name:/完成可查看成果/}).click();
 await page.locator('[data-next]').click();
 return {context,page,getModelCalls:()=>modelCalls};
}

try{
 const desktop=await prepare({width:1440,height:1000}),consent=desktop.page.locator('[data-model-consent]');
 await consent.waitFor();assert.equal(await consent.isChecked(),false);await consent.focus();assert.equal(await consent.evaluate(node=>node===document.activeElement),true);
 await desktop.page.locator('[data-analyze]').click();await desktop.page.getByText('理解确认 · 本地规则整理',{exact:true}).waitFor();assert.equal(desktop.getModelCalls(),0);
 await desktop.page.locator('[data-back]').click();await desktop.page.locator('[data-model-consent]').check();await desktop.page.locator('[data-analyze]').click();await desktop.page.getByText('理解确认 · 云端辅助整理',{exact:true}).waitFor();assert.equal(desktop.getModelCalls(),1);
 await desktop.page.locator('[data-back]').click();await desktop.page.locator('[data-analyze]').click();await desktop.page.getByText('理解确认 · 本地规则整理 · 云端未完成',{exact:true}).waitFor();assert.equal(desktop.getModelCalls(),2);await desktop.context.close();
 const narrow=await prepare({width:390,height:844});await narrow.page.locator('[data-model-consent]').waitFor();
 const overflow=await narrow.page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);assert.ok(overflow<=1,`narrow overflow ${overflow}px`);assert.equal(await narrow.page.locator('[data-model-consent]').isChecked(),false);assert.equal(narrow.getModelCalls(),0);await narrow.context.close();
 console.log('Browser model consent checks passed: default-local, keyboard focus, opt-in model, explicit fallback, 390px layout.');
}finally{await browser.close();}
