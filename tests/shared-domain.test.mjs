import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createPrototypeProfile,validatePrototypeProfile,validGrowthProof} from '../shared/profile.js';
import {emptyWorkspace,validWorkspace,validDate} from '../shared/workspace.js';
import * as frontendDomain from '../frontend/src/exploration-domain.js';
import * as frontendWorkspace from '../frontend/src/workspace-model.js';
import * as frontendProof from '../frontend/src/growth-proof.js';

test('browser compatibility exports use exactly the server domain validators',()=>{
 assert.equal(frontendDomain.createPrototypeProfile,createPrototypeProfile);
 assert.equal(frontendDomain.validatePrototypeProfile,validatePrototypeProfile);
 assert.equal(frontendWorkspace.emptyWorkspace,emptyWorkspace);
 assert.equal(frontendWorkspace.validWorkspace,validWorkspace);
 assert.equal(frontendWorkspace.validDate,validDate);
 assert.equal(frontendProof.validGrowthProof,validGrowthProof);
});

test('malformed plan references reject a workspace without throwing',()=>{
 const record={...frontendWorkspace.newGrowth(),name:'记录',planId:'plan',milestoneId:'milestone'};
 for(const milestones of [[null],{},'invalid',true]){
  const workspace={...emptyWorkspace(),plans:[{...frontendWorkspace.newPlan(),id:'plan',name:'计划',capitals:['human'],milestones}],growth:[record]};
  assert.equal(validWorkspace(workspace),false);
 }
});

test('shared validators and the product repository do not import browser modules',async()=>{
 for(const filename of ['shared/profile.js','shared/profile-changes.js','shared/rules-analysis.js','shared/workspace.js','shared/workspace-operations.js','backend/product-service.mjs','backend/product-repository.mjs','backend/postgres-repository.mjs']){
  const source=await readFile(new URL('../'+filename,import.meta.url),'utf8');
  assert.doesNotMatch(source,/from\s+['"][^'"]*frontend\//);
  assert.doesNotMatch(source,/\b(?:window|document|localStorage)\b/);
 }
});
