import pg from 'pg';
import {migratePostgres} from '../backend/postgres-migrations.mjs';

const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error('DATABASE_URL is required.');
const pool=new pg.Pool({connectionString,connectionTimeoutMillis:5000});
pool.on('error',()=>console.error('数据库连接暂时不可用。'));
try{
 await migratePostgres(pool);
 console.log('PostgreSQL migrations applied.');
}catch{
 console.error('数据库迁移失败；未提交的变更已回滚。请核对连接配置及迁移版本。');process.exitCode=1;
}finally{await pool.end();}
