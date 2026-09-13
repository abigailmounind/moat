import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const source=name=>readFile(new URL(`../frontend/src/${name}`,import.meta.url),'utf8');

test('root is a standalone cover and river is explicit',async()=>{
 const [main,landing]=await Promise.all([source('main.js'),source('landing.js')]);
 assert.match(main,/view==='river'.*'\.\/app\.js'.*'\.\/landing\.js'/s);
 assert.match(landing,/mapMarkup\(\[\]\)/);assert.match(landing,/href="\/\?view=explore"/);
 for(const privateModule of ['workspace-connection','exploration-connection','personal-map','exploration-storage','workspace-storage'])assert.doesNotMatch(landing,new RegExp(privateModule));
 assert.doesNotMatch(landing,/getItem\((?!'moat_visit_day')/);assert.doesNotMatch(landing,/moat_(profile|workspace|exploration)/);
});

test('published navigation and copy do not route the personal map through root',async()=>{
 const names=['app.js','sidebar.js','exploration.js','growth.js','workspaces.js','landing.js'];
 const sources=await Promise.all(names.map(source));
 assert.match(sources[0],/class="brand" href="\/"/);assert.match(sources[0],/href="\/\?view=river" aria-current="page"/);
 for(const text of sources)assert.doesNotMatch(text,/探索原型|成长记录原型|我的本地地图/);
});
