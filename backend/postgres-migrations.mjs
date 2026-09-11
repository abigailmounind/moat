import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';

async function migrations(){
 const directory=new URL('./migrations/',import.meta.url);
 const names=(await readdir(directory)).filter(name=>/^\d+_[a-z_]+\.sql$/.test(name)).sort();
 return Promise.all(names.map(async name=>{const sql=await readFile(new URL(name,directory),'utf8');return {name,sql,checksum:createHash('sha256').update(sql).digest('hex')};}));
}

export async function verifyPostgresSchema(pool){
 const files=await migrations();
 const applied=await pool.query('SELECT name,checksum FROM moat_schema_migrations');
 for(const file of files)if(!applied.rows.some(row=>row.name===file.name&&row.checksum===file.checksum))throw new Error('database_migration_required');
}

export async function migratePostgres(pool){
 const files=await migrations(),client=await pool.connect();let broken=false;
 try{
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':moat_migrations'))");
  await client.query('CREATE TABLE IF NOT EXISTS moat_schema_migrations(name text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
  const applied=await client.query('SELECT name,checksum FROM moat_schema_migrations');
  for(const file of files){
   const prior=applied.rows.find(row=>row.name===file.name);
   if(prior){if(prior.checksum!==file.checksum)throw new Error('database_migration_changed');continue;}
   await client.query(file.sql);
   await client.query('INSERT INTO moat_schema_migrations(name,checksum) VALUES($1,$2)',[file.name,file.checksum]);
  }
  await client.query('COMMIT');
 }catch(error){try{await client.query('ROLLBACK');}catch{broken=true;}throw error;}
 finally{client.release(broken);}
}
