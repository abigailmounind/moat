import test from 'node:test';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {checkDataLifecycle} from './fixtures/data-lifecycle-check.mjs';

test('导出快照隔离，删除检查版本并清理主体会话和回执，保留其他主体',async()=>{
 await checkDataLifecycle(createMemoryProductRepository());
});
