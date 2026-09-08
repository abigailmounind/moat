import {writeFile,readFile} from 'node:fs/promises';
import {mapMarkup} from '../src/map.js';
import {directions} from '../src/data.js';
const css=await readFile(new URL('../src/styles.css',import.meta.url),'utf8');
const svg=mapMarkup(directions).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ').replace('<defs>',`<style>${css}</style><defs>`);
await writeFile(new URL('../assets/three-rivers/rivers-v2.svg',import.meta.url),svg);
console.log('Exported editable river layer: assets/three-rivers/rivers-v2.svg');
