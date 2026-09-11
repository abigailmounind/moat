import {riverById,proofById,directionById} from './data.js';
export const initial={river:null,preview:null,panel:null,proof:null,direction:null};
export function reduce(state,action,{resolveProof=proofById,resolveRiver=riverById,resolveDirection=directionById}={}){
  switch(action.type){
    case 'PREVIEW': return state.panel || (action.id && !resolveRiver(action.id)) ? state : {...state,preview:action.id};
    case 'RIVER': return resolveRiver(action.id) ? {...initial,river:action.id,preview:action.id} : state;
    case 'PROOF': {const p=resolveProof(action.id),river=action.river&&resolveRiver(action.river)?action.river:p?.river;return p?{...state,river,preview:null,panel:'proof',proof:p.id,direction:null}:state;}
    case 'FUTURE': {const r=resolveRiver(action.id);return r?{...state,river:r.id,preview:null,panel:'future',proof:null,direction:r.directions[0]??null}:state;}
    case 'DIRECTION': {const d=resolveDirection(action.id);return d&&state.panel==='future'&&d.river===state.river?{...state,direction:d.id}:state;}
    case 'INFO': return {...state,preview:null,panel:action.id,proof:null,direction:null};
    case 'CLOSE': return state.panel?{...state,panel:null,proof:null,direction:null,preview:state.river}:{...initial};
    case 'RESET': return {...initial};
    default:return state;
  }
}
