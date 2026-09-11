import {readFile} from 'node:fs/promises';
import {validateUnderstandingProposal} from '../shared/understanding.js';

// Preserve the CLI helper's error-array interface.
export function validateUnderstanding(value,options={}){
  return validateUnderstandingProposal(value,options).errors;
}

if(process.argv[1]===new URL(import.meta.url).pathname){
  const file=process.argv[2];
  if(!file)throw new Error('用法：node scripts/validate-stage10-contract.mjs <json-file>');
  const value=JSON.parse(await readFile(file,'utf8'));
  const errors=validateUnderstanding(value,{inputIds:['q1','q2','q3','q4','q5']});
  if(errors.length){console.error(errors.join('\n'));process.exitCode=1;}else console.log('Stage 10 contract example checked.');
}
