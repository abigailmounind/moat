import {createMemoryProductRepository} from './product-repository.mjs';
import {createPostgresProductRepository} from './postgres-repository.mjs';
import {verifyPostgresSchema} from './postgres-migrations.mjs';

export async function createProductRuntime({connectionString=process.env.DATABASE_URL}={}){
 if(!connectionString)return {repository:createMemoryProductRepository(),close:async()=>{}};
 const {default:pg}=await import('pg');
 const pool=new pg.Pool({connectionString,connectionTimeoutMillis:5000,statement_timeout:10000,idleTimeoutMillis:30000});
 pool.on('error',()=>console.error('数据库连接暂时不可用。'));
 try{
  await verifyPostgresSchema(pool);
  return {repository:createPostgresProductRepository({pool}),close:()=>pool.end()};
 }catch{
  await pool.end();
  throw new Error('数据库连接或迁移检查失败。请检查 DATABASE_URL，并运行 npm run db:migrate。');
 }
}
