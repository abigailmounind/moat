import test from 'node:test';
import {createMemoryProductRepository} from '../backend/product-repository.mjs';
import {checkGrowthCommands} from './fixtures/growth-api-check.mjs';

test('成长与证明命令保留确认边界、历史快照、导入幂等及主体隔离',async()=>{
 await checkGrowthCommands(createMemoryProductRepository());
});
