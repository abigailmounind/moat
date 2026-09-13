// Real-browser profile sync regression. Playwright and Chromium stay external
// to production dependencies; start the app in PostgreSQL mode first.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {createPrototypeProfile} from '../shared/profile.js';

const playwrightPath=process.argv[2],executablePath=process.argv[3],baseUrl=(process.argv[4]||'http://127.0.0.1:4173').replace(/\/$/,'');
if(!playwrightPath||!executablePath)throw Error('usage: node scripts/browser-profile-sync-check.mjs /path/to/playwright/index.mjs /path/to/chrome [base-url]');
const {chromium}=await import(pathToFileURL(playwrightPath).href);
const browser=await chromium.launch({headless:true,executablePath,args:['--no-sandbox']});
const localProfile=createPrototypeProfile();
localProfile.evidence.seed_evidence={id:'seed_evidence',title:'本地确认经历',experience:'本地项目',actions:['整理资料'],result:'形成清单',source:null,limitations:['仍需继续核对'],source_type:'user_self_report',confirmation_status:'confirmed',input_refs:['q3','q4','q5']};

async function completeManualExploration(page){
 const click=selector=>page.locator(selector).first().click(),next=()=>click('[data-next]');
 await page.goto(baseUrl+'/?view=explore');await next();await click('[data-value="change"]');await next();await next();
 await click('[data-value="project"]');await next();await click('[data-value="organize"]');await next();await click('[data-value="unclear"]');
 await click('[data-manual-analysis]');await page.getByText('理解确认 · 手工整理',{exact:true}).waitFor();
 for(const id of await page.locator('[data-card-value="confirmed"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.card)))await click(`[data-card="${id}"][data-card-value="confirmed"]`);
 for(let step=0;step<4;step++)await next();await click('[data-apply-update]');
 await page.getByRole('heading',{name:'已保存到服务器档案'}).waitFor();
}

try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width===390,acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const layout=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'horizontal overflow');
  await page.goto(baseUrl+'/?view=sync');
  await page.evaluate(profile=>localStorage.setItem('personal-moat:exploration-profile:v1',JSON.stringify({version:1,kind:'user_local',savedAt:new Date().toISOString(),profile})),localProfile);
  await page.reload();await page.locator('[data-action="profile-preview"]').click();await page.locator('[data-action="profile-import"]').waitFor();await layout();
  assert.ok(await page.getByText('当前浏览器：1 个证明、0 条关联、0 处未知',{exact:true}).isVisible());
  await page.locator('[data-action="profile-import"]').click();await page.getByText('服务器探索档案已核对并保存。',{exact:true}).waitFor();
  await completeManualExploration(page);
  await page.goto(baseUrl+'/?panel=local-proofs');await page.getByText('本地确认经历',{exact:true}).waitFor();assert.equal(await page.locator('#detail-panel [data-proof]').count(),2);await layout();
  await page.goto(baseUrl+'/?view=sync');await page.locator('[data-action="profile-local"]').click();await page.getByText('探索档案已切回当前浏览器。',{exact:true}).waitFor();
  await page.goto(baseUrl+'/?panel=local-proofs');await page.getByText('本地确认经历',{exact:true}).waitFor();assert.equal(await page.locator('#detail-panel [data-proof]').count(),1);
  await page.goto(baseUrl+'/?view=sync');await page.locator('[data-action="profile-preview"]').click();await page.locator('[data-action="profile-enable"]').click();await page.getByText('服务器探索档案已核对并保存。',{exact:true}).waitFor();
  await page.goto(baseUrl+'/?panel=local-proofs');await page.getByText('本地确认经历',{exact:true}).waitFor();assert.equal(await page.locator('#detail-panel [data-proof]').count(),2);await layout();

  const second=await context.newPage();await second.goto(baseUrl+'/');
  // Both tabs must hold the same pre-write snapshot before either submits.
  // Remote module loading can otherwise let the second tab read the new revision.
  await Promise.all([page,second].map(tab=>tab.evaluate(async()=>{
   const {explorationProfileConnection:connection}=await import('/frontend/src/exploration-connection.js');
   globalThis.profileConflictBase=connection.readActive().profile;
  })));
  const concurrent=await Promise.all([page,second].map((tab,index)=>tab.evaluate(async index=>{
   const {explorationProfileConnection:connection}=await import('/frontend/src/exploration-connection.js');
   const base=globalThis.profileConflictBase,id=`tab_${index}_unknown`;
   delete globalThis.profileConflictBase;
   return connection.commit(base,{id:`change_tab_${index}`,sessionId:'browser-multi-tab',scope:{unknowns:[id]},operations:[{type:'keep_unknown',entityId:id,payload:{id,topic:'direction',reason:'not_asked',input_refs:[],explanation:'多标签并发核对。',confirmation_status:'confirmed'}}]});
  },index)));
  assert.equal(concurrent.filter(result=>result.ok).length,1);assert.equal(concurrent.filter(result=>!result.ok).length,1);
  assert.ok(['local_changed','revision_conflict'].includes(concurrent.find(result=>!result.ok).code));await second.close();

  await page.goto(baseUrl+'/?view=sync');await page.locator('[data-action="preview"]').click();await page.locator('[data-action="enable"]').click();await page.getByText('服务器工作区已核对并保存。',{exact:true}).waitFor();
  const download=page.waitForEvent('download');await page.locator('[data-action="export"]').click();const downloaded=await download;assert.ok((await downloaded.createReadStream())!==null);
  await page.locator('[data-action="delete"]').click();await page.getByText('服务端已确认删除，已清理本机服务器缓存。原始本地内容仍保留。',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>localStorage.getItem('personal-moat:server-profile:v1')),null);
  assert.ok(await page.evaluate(()=>localStorage.getItem('personal-moat:exploration-profile:v1')));
  assert.equal(await page.evaluate(()=>fetch('/api/v1/session').then(response=>response.status)),401);
  await page.goto(baseUrl+'/?panel=local-proofs');await page.getByText('本地确认经历',{exact:true}).waitFor();assert.equal(await page.locator('#detail-panel [data-proof]').count(),1);await layout();
  assert.deepEqual(errors,[]);console.log(`Browser profile lifecycle passed at ${width}px: import, server save, refresh, switching, multi-tab conflict, download, deletion and local recovery.`);
  await context.close();
 }
}finally{await browser.close();}
