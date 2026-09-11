// Real-browser flow regression. Playwright and the browser stay external to
// production dependencies; pass their paths explicitly after starting the app.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {WORKSPACE_KEY} from '../frontend/src/workspace-model.js';

const playwrightPath=process.argv[2];
if(!playwrightPath)throw new Error('usage: node scripts/browser-flow-check.mjs /path/to/playwright/index.mjs [/path/to/chrome] [base-url]');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const executablePath=process.argv[3]||undefined;
const baseUrl=(process.argv[4]||'http://127.0.0.1:4173').replace(/\/$/,'');
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});

try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width===390});
  const page=await context.newPage(),errors=[],apiRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(request.url().includes('/api/'))apiRequests.push(request.url());});
  page.on('dialog',dialog=>dialog.accept());
  const click=selector=>page.locator(selector).first().click();
  const next=()=>click('[data-next]');
  const layout=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
  const workspace=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),WORKSPACE_KEY);
  const answerToOutcome=async()=>{
   await page.goto(`${baseUrl}/?view=explore`);
   await next();await click('[data-value="change"]');await next();await next();
   await click('[data-value="project"]');await next();await click('[data-value="organize"]');await next();
   await click('[data-value="unclear"]');
  };

  await answerToOutcome();await next();
  if(width===1440){await page.locator('[data-text="methodUsed"]').fill('信息分类法');await click('[data-toggle="riverBasis"][data-value="ability"]');}
  await page.locator('[data-analyze]').focus();await page.keyboard.press('Enter');
  await page.getByText('理解确认 · 本地规则整理',{exact:true}).waitFor();await layout();
  assert.equal((await page.getByText('资本关联 · 人力资本',{exact:true}).count())>0,width===1440);
  assert.equal((await page.getByText('河流关联 · 能力之河',{exact:true}).count())>0,width===1440);
  assert.equal(await page.evaluate(()=>localStorage.length),0);

  await answerToOutcome();await page.locator('[data-manual-analysis]').focus();await page.keyboard.press('Enter');
  await page.getByText('理解确认 · 手工整理',{exact:true}).waitFor();await layout();
  assert.equal(await page.locator('[data-next]').isDisabled(),true);
  const cardIds=await page.locator('[data-card-value="confirmed"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.card));
  for(const id of cardIds)await click(`[data-card="${id}"][data-card-value="confirmed"]`);
  for(let step=0;step<4;step++)await next();
  await layout();assert.equal(await page.evaluate(()=>localStorage.length),0);
  await click('[data-apply-update]');await page.getByRole('heading',{name:'已保存到这个浏览器'}).waitFor();

  await page.goto(`${baseUrl}/?view=paths`);await click('[data-new-path="ability"]');
  await page.locator('[name=name]').fill('合成验收路径');await click('button[type=submit]');
  let data=await workspace();const path=data.paths[0];
  await page.goto(`${baseUrl}/?view=plans&path=${path.id}`);await page.waitForTimeout(1000);
  await click(`[data-new-plan="${path.id}"]`);await page.locator('[name=name]').fill('合成验收计划');
  await page.locator('[name=capitals][value=human]').check();await click('[data-add-milestone]');
  await page.locator('[name^=m-name-]').fill('整理一份清单');await page.locator('[name^=m-actions-]').fill('整理笔记');
  await layout();await click('button[type=submit]');await click('[data-action-toggle]');
  data=await workspace();const plan=data.plans[0];assert.equal(plan.milestones[0].actions[0].done,true);

  await page.goto(`${baseUrl}/?view=growth`);await click('[data-new]');
  await page.locator('[name=name]').fill('合成验收成果');await page.locator('[name=action]').fill('整理笔记');
  await page.locator('[name=result]').fill('一份问题清单');await page.locator('[name=planId]').selectOption(plan.id);
  await page.locator('[name=milestoneId]').selectOption(plan.milestones[0].id);await click('button[type=submit]');
  await click('[data-publish]');await page.locator('[name=river]').selectOption('ability');
  await page.locator('[name=explanation]').fill('这次记录了整理方法的实践');await click('button[type=submit]');
  data=await workspace();assert.ok(data.growth[0].proof);
  await page.reload();await page.getByRole('heading',{name:'合成验收成果',exact:true}).waitFor();await layout();
  await page.goto(`${baseUrl}/?panel=local-proofs`);
  await page.locator('#detail-panel').getByText('合成验收成果',{exact:false}).first().waitFor();

  assert.deepEqual(errors,[]);assert.deepEqual(apiRequests,[]);
  console.log(`Browser flow passed at ${width}px: optional evidence check, manual exploration, local save, path, plan, milestone, growth, proof, reload and map.`);
  await context.close();
 }
}finally{await browser.close();}
