import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml} from '../frontend/src/exploration-render-utils.js';
import {reviewItems} from '../frontend/src/exploration-review.js';
test('用户自写文本只作为文本渲染，不产生 HTML 标签',()=>{const raw='<script>alert(1)</script> &';assert.equal(escapeHtml(raw),'&lt;script&gt;alert(1)&lt;/script&gt; &amp;');});
test('确认卡可读展示规则与输入依据',()=>{const items=reviewItems({claims:[{id:'claim',kind:'experience',text:'记录',source_type:'ai_proposal',confirmation_status:'pending',input_refs:['q3'],rule_id:'R01',rule_version:'0.1',basis_refs:['q3']}],evidence_drafts:[],capital_links:[],river_links:[],future_direction_drafts:[],unknowns:[]});assert.equal(items[0].rule,'经历整理 · R01 v0.1');assert.equal(items[0].basis,'经历');assert.equal(items[0].source,'经历');});
