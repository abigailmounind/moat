import {validGrowthProof} from '../../shared/profile.js';
export {createGrowthProof} from '../../shared/growth-proof.js';
export {growthEvidenceId,validGrowthProof} from '../../shared/profile.js';

// Project confirmed snapshots without writing workspace records into exploration storage.
export function profileWithGrowth(exploration,workspace){
 const profile=structuredClone(exploration);
 for(const record of workspace.growth??[])if(record.proof&&validGrowthProof(record.proof,record.id))for(const key of ['evidence','capitalLinks','riverLinks'])Object.assign(profile[key],record.proof[key]);
 return profile;
}
