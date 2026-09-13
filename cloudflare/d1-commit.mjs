// Reserve the receipt and mutate its document in one transaction. A request-specific
// owner distinguishes a fresh reservation from an identical concurrent retry.
export async function commitDocument(db,{table,subjectId,revision,nextRevision,content,key,fingerprint,response,now=Date.now(),capacity=100}){
 if(!['profiles','workspaces'].includes(table))throw Error('invalid_document_table');
 const owner=crypto.randomUUID(),timestamp=new Date(now).toISOString(),expires=new Date(now+86400000).toISOString();
 const results=await db.batch([
  db.prepare('DELETE FROM idempotency_receipts WHERE subject_id=?1 AND expires_at<=?2').bind(subjectId,timestamp),
  db.prepare(`INSERT INTO idempotency_receipts(subject_id,operation_key,fingerprint,response_json,expires_at,owner)
   SELECT ?1,?2,?3,?4,?5,?6 FROM ${table} WHERE subject_id=?1 AND revision=?7
   AND (SELECT count(*) FROM idempotency_receipts WHERE subject_id=?1)<?8
   ON CONFLICT(subject_id,operation_key) DO NOTHING`).bind(subjectId,key,fingerprint,JSON.stringify(response),expires,owner,revision,capacity),
  db.prepare(`UPDATE ${table} SET revision=?3,content_json=?4 WHERE subject_id=?1 AND revision=?2
   AND EXISTS (SELECT 1 FROM idempotency_receipts WHERE subject_id=?1 AND operation_key=?5 AND owner=?6)`)
   .bind(subjectId,revision,nextRevision,JSON.stringify(content),key,owner),
  db.prepare('SELECT fingerprint,response_json AS responseJson,owner FROM idempotency_receipts WHERE subject_id=?1 AND operation_key=?2').bind(subjectId,key)
 ]);
 const receipt=results[3].results[0];
 if(receipt){
  if(receipt.fingerprint!==fingerprint)return {code:'idempotency_conflict'};
  return {response:JSON.parse(receipt.responseJson),replayed:receipt.owner!==owner};
 }
 const row=await db.prepare(`SELECT revision FROM ${table} WHERE subject_id=?1`).bind(subjectId).first();
 if(!row)return {code:'subject_not_found'};
 return {code:row.revision!==revision?'revision_conflict':'idempotency_capacity'};
}
