import test from 'node:test';
import assert from 'node:assert/strict';
import {escapeHtml} from '../frontend/src/exploration-render-utils.js';
test('用户自写文本只作为文本渲染，不产生 HTML 标签',()=>{const raw='<script>alert(1)</script> &';assert.equal(escapeHtml(raw),'&lt;script&gt;alert(1)&lt;/script&gt; &amp;');});
