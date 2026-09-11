import {localProofFromProfile} from '../frontend/src/local-proof.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPrototypeArtifacts,createPrototypeProfile,applyMapChangeSet} from '../frontend/src/exploration-domain.js';
import {loadExplorationProfile,saveExplorationProfile,removeLocalEvidence,browserStorage} from '../frontend/src/exploration-storage.js';
import {initial,reduce} from '../frontend/src/state.js';
import {initialExploration,explorationReduce} from '../frontend/src/exploration-state.js';

test('确认内容保存、重新读取、打开本地详情、删除并再次读取',()=>{
 const ui=structuredClone(initialExploration);
 Object.assign(ui.answers,{situation:'change',experience:'project',actions:['organize'],outcomes:['artifact']});
 for(const id of Object.keys(ui.cards))ui.cards[id]='confirmed';
 const changeSet=buildPrototypeArtifacts(ui).changeSet;
 let raw=null;const storage={getItem:()=>raw,setItem:(_,value)=>{raw=value;}};
 const applied=applyMapChangeSet(createPrototypeProfile(),changeSet);
 assert.equal(saveExplorationProfile(storage,applied.profile).ok,true);
 const loaded=loadExplorationProfile(storage).profile;
 assert.equal(applyMapChangeSet(loaded,changeSet).duplicate,true);
 const evidence=Object.values(loaded.evidence)[0];
 const resolveProof=id=>loaded.evidence[id]?{id,river:'ability'}:null;
 const opened=reduce(initial,{type:'PROOF',id:evidence.id},{resolveProof});
 assert.equal(opened.panel,'proof');assert.equal(opened.proof,evidence.id);
 assert.equal(saveExplorationProfile(storage,removeLocalEvidence(loaded,evidence.id)).ok,true);
 const deleted=loadExplorationProfile(storage).profile;
 assert.deepEqual(deleted.evidence,{});assert.deepEqual(deleted.capitalLinks,{});assert.deepEqual(deleted.riverLinks,{});
});

test('确认页返回结果输入，保留回答和编辑',()=>{
 const state={...structuredClone(initialExploration),step:'review',edits:{human:'我的修改'}};
 const back=explorationReduce(state,{type:'BACK'});
 assert.equal(back.step,'outcome');assert.deepEqual(back.edits,state.edits);assert.deepEqual(back.answers,state.answers);
});

test('浏览器拒绝访问存储时仍可进入页面，保存明确失败',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');
 Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('denied');}});
 try{assert.equal(browserStorage(),null);assert.equal(saveExplorationProfile(browserStorage(),createPrototypeProfile()).ok,false);}
 finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});

test('地图逐条解析实际资本与河流关联，删除一条仍可打开另一条',()=>{
 const ui=structuredClone(initialExploration);Object.assign(ui.answers,{experience:'project',actions:['create'],outcomes:['artifact']});
 Object.assign(ui.cards,{experience:'confirmed',human:'deleted',ability:'deleted',unknown:'confirmed'});
 let profile=applyMapChangeSet(createPrototypeProfile(),buildPrototypeArtifacts(ui).changeSet).profile;
 const first=Object.keys(profile.evidence)[0];
 assert.equal(localProofFromProfile(profile,first).river,null);
 assert.equal(localProofFromProfile(profile,first).capital,'未保留资本关联');
 ui.cards.human='confirmed';ui.cards.ability='confirmed';ui.edits.experience='<img src=x>';
 profile=applyMapChangeSet(profile,buildPrototypeArtifacts(ui).changeSet).profile;
 const second=Object.keys(profile.evidence).find(id=>id!==first);
 assert.equal(localProofFromProfile(profile,second).river,'ability');
 assert.match(localProofFromProfile(profile,second).capital,/人力资本/);
 assert.equal(localProofFromProfile(profile,second).title,'&lt;img src=x&gt;');
 profile=removeLocalEvidence(profile,first);
 assert.equal(localProofFromProfile(profile,first),null);
 const opened=reduce(initial,{type:'PROOF',id:second},{resolveProof:id=>localProofFromProfile(profile,id)});
 assert.equal(opened.proof,second);assert.equal(opened.river,'ability');
});
