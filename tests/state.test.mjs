import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,reduce} from '../src/state.js';
import {rivers,proofs,directions,branchAssociations} from '../src/data.js';
import {waterways,bank,mapMarkup} from '../src/map.js';

test('proof/future replace each other; temporary hover cannot cover a detail',()=>{
 let s=reduce(initial,{type:'RIVER',id:'ability'});
 s=reduce(s,{type:'PROOF',id:'review'});
 assert.equal(s.panel,'proof');assert.equal(s.river,'ability');
 assert.deepEqual(reduce(s,{type:'PREVIEW',id:'love'}),s);
 s=reduce(s,{type:'FUTURE',id:'survival'});
 assert.equal(s.proof,null);assert.equal(s.direction,'research');
 s=reduce(s,{type:'CLOSE'});
 assert.equal(s.panel,null);assert.equal(s.river,'survival');assert.equal(s.preview,'survival');
});
test('missing direction remains empty and invalid or cross-river selection is ignored',()=>{
 let s=reduce(initial,{type:'FUTURE',id:'love'});
 assert.equal(s.direction,null);assert.equal(s.panel,'future');
 for(const a of [{type:'DIRECTION',id:'research'},{type:'PROOF',id:'missing'},{type:'RIVER',id:'missing'},{type:'FUTURE',id:'missing'}])assert.deepEqual(reduce(s,a),s);
});
test('repeated view transitions cannot duplicate or delete example records',()=>{
 const snapshot=JSON.stringify({rivers,proofs,directions});let s={...initial};
 for(let i=0;i<100;i++){s=reduce(s,{type:'FUTURE',id:'survival'});s=reduce(s,{type:'DIRECTION',id:'collaboration'});s=reduce(s,{type:'PROOF',id:'writing'});s=reduce(s,{type:'CLOSE'});}
 assert.equal(JSON.stringify({rivers,proofs,directions}),snapshot);
});
test('three stable filled river systems share one core; every proof and candidate has an owner',()=>{
 assert.deepEqual(waterways.map(r=>r.id),rivers.map(r=>r.id));assert.equal(waterways.length,3);
 for(const r of waterways){assert.deepEqual(r.knots[0].slice(0,2),[873,444]);const shape=bank(r.knots);assert.equal(shape,bank(r.knots));assert.ok(shape.endsWith('Z'));assert.ok(!shape.includes('NaN'));assert.equal(branchAssociations[r.id].length,r.branches.length);for(const relation of branchAssociations[r.id])assert.equal(proofs.find(p=>p.id===relation.proof)?.river,r.id);}
 for(const r of rivers){for(const id of r.proofs)assert.equal(proofs.find(p=>p.id===id)?.river,r.id);for(const id of r.directions)assert.equal(directions.find(d=>d.id===id)?.river,r.id);}
 const svg=mapMarkup(directions);const ids=[...svg.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const [,ref] of svg.matchAll(/url\(#([^\)]+)\)/g))assert.ok(ids.includes(ref),`Missing SVG definition: ${ref}`);
});
