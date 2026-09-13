import assert from 'node:assert/strict';

const base=new URL(process.argv[2]||'http://127.0.0.1:8788');
assert.ok(['127.0.0.1','localhost','[::1]'].includes(base.hostname)&&['http:','https:'].includes(base.protocol)&&!base.username&&!base.password,'This mutating check only accepts a loopback test server.');
const request=async(path,{method='GET',cookie,body,key}={})=>{
 const headers={Origin:base.origin};if(cookie)headers.Cookie=cookie;if(body!==undefined)headers['Content-Type']='application/json';if(key)headers['Idempotency-Key']=key;
 const response=await fetch(new URL(path,base),{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000),redirect:'error'});
 let value;try{value=await response.json();}catch{value=null;}
 return {response,value};
};
const session=await request('/api/v1/session',{method:'POST'});assert.equal(session.response.status,201,JSON.stringify(session.value));
const cookie=session.response.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie?.startsWith('moat_session='));
const changeSet={id:'local-d1-change',sessionId:'local-d1-check',scope:{evidence:['local-d1-evidence']},operations:[{type:'add_evidence',entityId:'local-d1-evidence',payload:{id:'local-d1-evidence',title:'本地 D1 验证',experience:'local verification',actions:['提交确认变更集'],result:'验证响应',source:null,limitations:['合成测试数据'],source_type:'user_self_report',confirmation_status:'confirmed',input_refs:['q3']}}]};
const firstBody={revision:0,changeSet};
const first=await request('/api/v1/profile/change-sets',{method:'POST',cookie,key:'local-d1-write-1',body:firstBody});
assert.equal(first.response.status,200,JSON.stringify(first.value));assert.equal(first.value.revision,1);assert.equal(first.response.headers.get('idempotency-replayed'),'false');
const replay=await request('/api/v1/profile/change-sets',{method:'POST',cookie,key:'local-d1-write-1',body:firstBody});
assert.deepEqual(replay.value,first.value);assert.equal(replay.response.headers.get('idempotency-replayed'),'true');

const variants=['a','b'].map(suffix=>({revision:1,changeSet:{id:`local-d1-race-${suffix}`,sessionId:'local-d1-check',scope:{unknowns:[`local-d1-unknown-${suffix}`]},operations:[{type:'keep_unknown',entityId:`local-d1-unknown-${suffix}`,payload:{id:`local-d1-unknown-${suffix}`,reason:'insufficient_evidence',topic:'capital',confirmation_status:'confirmed'}}]}}));
const raced=await Promise.all(variants.map((body,index)=>request('/api/v1/profile/change-sets',{method:'POST',cookie,key:`local-d1-race-${index}`,body})));
assert.deepEqual(raced.map(item=>item.response.status).sort(),[200,409]);
const winner=raced.find(item=>item.response.status===200),winnerIndex=raced.indexOf(winner);
const winnerReplay=await request('/api/v1/profile/change-sets',{method:'POST',cookie,key:`local-d1-race-${winnerIndex}`,body:variants[winnerIndex]});
assert.equal(winnerReplay.response.status,200);assert.equal(winnerReplay.response.headers.get('idempotency-replayed'),'true');
const profile=await request('/api/v1/profile',{cookie});assert.equal(profile.response.status,200);assert.equal(profile.value.revision,2);assert.ok(profile.value.profile.evidence['local-d1-evidence']);

const path={id:'local-path',river:'ability',name:'本地验证路径',status:'exploring',goal:'验证 D1 对象写入',notes:'',support:'',gap:'',constraints:'',nextAction:''};
const plan={id:'local-plan',river:'ability',name:'本地验证计划',status:'active',goal:'验证归属',notes:'',capitals:['human'],pathIds:['local-path'],milestones:[]};
const savedPath=await request('/api/v1/paths',{method:'POST',cookie,key:'local-path-create',body:{revision:0,path}});assert.equal(savedPath.response.status,200,JSON.stringify(savedPath.value));
const pathReplay=await request('/api/v1/paths',{method:'POST',cookie,key:'local-path-create',body:{revision:0,path}});assert.equal(pathReplay.response.headers.get('idempotency-replayed'),'true');
const savedPlan=await request('/api/v1/plans',{method:'POST',cookie,key:'local-plan-create',body:{revision:1,plan}});assert.equal(savedPlan.response.status,200,JSON.stringify(savedPlan.value));
const workspaceRace=await Promise.all(['a','b'].map((suffix,index)=>request('/api/v1/paths/local-path',{method:'PATCH',cookie,key:`local-path-race-${suffix}`,body:{revision:2,path:{...path,notes:`并发修改 ${index}`}}})));
assert.deepEqual(workspaceRace.map(item=>item.response.status).sort(),[200,409]);
const winningPath=workspaceRace.find(item=>item.response.status===200),winningIndex=workspaceRace.indexOf(winningPath);
const workspaceReplay=await request('/api/v1/paths/local-path',{method:'PATCH',cookie,key:`local-path-race-${['a','b'][winningIndex]}`,body:{revision:2,path:{...path,notes:`并发修改 ${winningIndex}`}}});assert.equal(workspaceReplay.response.headers.get('idempotency-replayed'),'true');
const plans=await request('/api/v1/plans',{cookie});assert.equal(plans.response.status,200);assert.equal(plans.value.revision,3);assert.equal(plans.value.plans[0].id,'local-plan');

const importSession=await request('/api/v1/session',{method:'POST'}),importCookie=importSession.response.headers.get('set-cookie')?.split(';')[0];assert.equal(importSession.response.status,201);
const importPath={...path,id:'import-path'},importPlan={...plan,id:'import-plan',pathIds:['import-path'],milestones:[{id:'import-milestone',name:'完成验证',criterion:'可以回看',done:false,actions:[]}]};
const importedWorkspace={version:1,revision:0,paths:[importPath],plans:[importPlan],growth:[]};
const imported=await request('/api/v1/imports/workspace',{method:'POST',cookie:importCookie,key:'local-import',body:{revision:0,workspace:importedWorkspace,confirmed:true}});assert.equal(imported.response.status,200,JSON.stringify(imported.value));
const growth={id:'local-growth',name:'本地验证成果',date:'2026-09-12',type:'result',action:'运行专项',result:'专项通过',reflection:'',source:'合成测试',planId:'import-plan',milestoneId:'import-milestone',planName:'',milestoneName:''};
const growthSaved=await request('/api/v1/growth-records',{method:'POST',cookie:importCookie,key:'local-growth',body:{revision:1,record:growth}});assert.equal(growthSaved.response.status,200,JSON.stringify(growthSaved.value));assert.equal(growthSaved.value.workspace.growth[0].planName,'本地验证计划');
const proof=await request('/api/v1/growth-records/local-growth/proof',{method:'POST',cookie:importCookie,key:'local-proof',body:{revision:2,confirmed:true,selection:{}}});assert.equal(proof.response.status,200,JSON.stringify(proof.value));assert.ok(proof.value.workspace.growth[0].proof);
const proofReplay=await request('/api/v1/growth-records/local-growth/proof',{method:'POST',cookie:importCookie,key:'local-proof',body:{revision:2,confirmed:true,selection:{}}});assert.equal(proofReplay.response.headers.get('idempotency-replayed'),'true');
const revoked=await request('/api/v1/growth-records/local-growth/proof',{method:'DELETE',cookie:importCookie,key:'local-proof-revoke',body:{revision:3}});assert.equal(revoked.response.status,200);assert.equal(revoked.value.workspace.growth[0].proof,undefined);
const bootstrap=await request('/api/v1/bootstrap',{cookie:importCookie});assert.equal(bootstrap.response.status,200);assert.equal(bootstrap.value.data.profileRevision,0);assert.equal(bootstrap.value.data.workspace.revision,4);assert.equal(bootstrap.value.data.workspace.growth[0].proof,undefined);

const exportResult=await request('/api/v1/data/export',{cookie:importCookie});assert.equal(exportResult.response.status,200);assert.equal(exportResult.value.data.workspace.revision,4);assert.ok(!JSON.stringify(exportResult.value).includes(importCookie.split('=')[1]));
const staleDelete=await request('/api/v1/data',{method:'DELETE',cookie:importCookie,body:{confirmed:true,subjectId:importSession.value.session.subject.id,revision:3}});assert.equal(staleDelete.response.status,409);assert.equal(staleDelete.value.workspace.revision,4);
const deleted=await request('/api/v1/data',{method:'DELETE',cookie:importCookie,body:{confirmed:true,subjectId:importSession.value.session.subject.id,revision:4}});assert.equal(deleted.response.status,200,JSON.stringify(deleted.value));assert.equal(deleted.value.deleted,true);
const invalidated=await request('/api/v1/session',{cookie:importCookie});assert.equal(invalidated.response.status,401);
console.log('Cloudflare local D1 HTTP, complete data lifecycle, idempotency and revision race checks passed.');
