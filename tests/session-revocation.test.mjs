import test from 'node:test';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {checkSessionRevocation} from './fixtures/session-revocation-check.mjs';

test('撤销当前会话可重试，保留主体数据与回执，其他主体不受影响',async()=>{
 await checkSessionRevocation(createMemoryProductRepository());
});
