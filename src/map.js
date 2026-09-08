// Stable, editable geometry in the approved 1672 × 941 coordinate system.
// Each [x,y,width] knot describes a cross-section of an organic filled bank.
export const waterways = [
 {id:'love',knots:[[873,444,46],[837,415,48],[818,372,56],[770,347,57],[707,337,43],[679,307,39],[669,261,44],[651,215,41],[621,170,38],[579,142,30],[552,107,27],[516,88,20],[475,70,13],[428,62,6],[398,35,3],[370,0,1]],branches:[[[731,346,16],[688,354,22],[652,371,19],[610,382,18],[566,373,17],[534,347,16],[487,319,14],[473,290,13],[455,258,12],[421,246,9],[397,238,5],[384,211,2],[363,195,1]],[[674,284,8],[716,279,6],[741,246,4],[740,206,1]],[[421,246,6],[391,264,6],[367,274,4],[339,272,3],[313,289,2],[273,305,1]],[[648,216,8],[608,224,6],[587,242,3],[554,242,1]]]},
 {id:'survival',knots:[[873,444,47],[905,421,40],[951,406,47],[986,380,52],[1003,333,50],[1018,290,44],[1057,271,40],[1112,267,35],[1157,274,27],[1200,258,25],[1230,225,21],[1273,202,16],[1301,187,10],[1320,164,7],[1314,140,3],[1301,116,1]],branches:[[[920,425,14],[956,429,17],[990,449,16],[1018,443,13],[1045,418,12],[1082,402,11],[1115,403,10],[1137,389,9],[1136,368,7],[1129,349,5],[1140,332,1]],[[1158,272,8],[1205,291,7],[1250,281,6],[1300,250,5],[1340,235,4],[1360,209,3],[1397,195,1]],[[938,410,10],[945,386,9],[949,361,6],[956,335,1]]]},
 {id:'ability',knots:[[873,444,46],[866,476,57],[823,504,65],[806,537,59],[811,566,49],[843,601,53],[858,634,62],[844,668,63],[819,705,63],[795,746,67],[780,786,70],[790,830,66],[813,873,61],[844,924,55],[853,958,46]],branches:[[[839,608,14],[820,634,13],[791,650,10],[785,677,8],[765,701,6],[755,732,2]],[[836,505,14],[800,510,12],[766,510,9],[750,531,8],[716,541,7],[677,551,5],[650,566,5],[629,593,3],[600,607,1]],[[821,705,10],[854,699,9],[881,720,7],[890,750,5],[886,776,2]]]}
];
function sample(knots){const out=[];for(let i=0;i<knots.length-1;i++){const a=knots[Math.max(i-1,0)],b=knots[i],c=knots[i+1],d=knots[Math.min(i+2,knots.length-1)];for(let j=0;j<10;j++){const t=j/10;out.push(b.map((v,k)=>.5*((2*v)+(-a[k]+c[k])*t+(2*a[k]-5*v+4*c[k]-d[k])*t*t+(-a[k]+3*v-3*c[k]+d[k])*t*t*t)));}}out.push(knots.at(-1));return out;}
const n=v=>v.toFixed(2);
export function bank(knots,extra=0){const pts=sample(knots),sides=[[],[]];pts.forEach((p,i)=>{const prev=pts[Math.max(0,i-1)],next=pts[Math.min(pts.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy)||1;for(let s=0;s<2;s++){const sign=s?1:-1,rough=(Math.sin(i*1.37+s*2)+Math.sin(i*.51))*Math.min(1,p[2]/25)*.7,w=Math.max(.25,p[2]/2+extra+rough);sides[s].push([p[0]-dy/length*w*sign,p[1]+dx/length*w*sign]);}});return 'M'+sides[0].concat(sides[1].reverse()).map(p=>p.map(n).join(',')).join(' L')+' Z';}
export function center(knots){return 'M'+sample(knots).map(p=>`${n(p[0])},${n(p[1])}`).join(' L');}
function flowLine(knots,offset=0){
 const pts=sample(knots).map((point,i,all)=>{
  const prev=all[Math.max(0,i-1)],next=all[Math.min(all.length-1,i+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy)||1;
  return [point[0]-dy/length*offset,point[1]+dx/length*offset];
 });
 return 'M'+pts.map(point=>`${n(point[0])},${n(point[1])}`).join(' L');
}
function water(knots,id,branch=false,index=0){
 const offsets=branch?[-3,3]:[-15,-9,-3,3,9,15];
 const flowPaths=offsets.map((offset,k)=>`<path class="water-flow ${branch?'tributary-flow':''} flow-${k}" d="${flowLine(knots,offset)}" fill="none" stroke="${branch?'#d8ebe7':k%2?'#dcece7':'#f1f4e8'}" stroke-width="${branch?'.75':k%3===0?'1.2':'.8'}" stroke-linecap="round" stroke-dasharray="${branch?'7 35 2 48':`${18+k*3} ${34+k*8} 3 ${48+k*7}`}" style="--flow-offset:${branch?-(72+k*14):-(110+k*22)}px;--flow-delay:${branch?-3-index*.3:-k*2.7}s"/>`).join('');
 return `<g class="${branch?'tributary':'main-water'}" data-water="${id}" style="--delay:${branch?1.8+index*.11:.8+index*.15}s">${flowPaths}</g>`;
}
function revealLine(knots,anchor=false){
 const pts=sample(knots);
 if(anchor) pts[0]=[884,452];
 return 'M'+pts.map(p=>`${n(p[0])},${n(p[1])}`).join(' L');
}
export function mapMarkup(directions){
 const mainReveal=[
  revealLine(waterways[0].knots,true),
  revealLine(waterways[1].knots,true),
  revealLine(waterways[2].knots,true)
 ];
 const revealStrokes=mainReveal.map((d,i)=>`<path class="river-reveal-stroke reveal-${waterways[i].id}" d="${d}" pathLength="100" fill="none" stroke="#fff" stroke-width="${[280,270,286][i]}" stroke-linecap="round" stroke-linejoin="round" style="--reveal-delay:${[.12,.20,.28][i]}s"/>`).join('');
 const tributaryReveal=waterways.map((r,i)=>r.branches.map((b,j)=>`<path class="river-reveal-tributary" d="${revealLine(b)}" pathLength="100" fill="none" stroke="#fff" stroke-width="96" stroke-linecap="round" style="--reveal-delay:${1.55+i*.08+j*.05}s"/>`).join('')).join('');
 const systems=waterways.map((r,i)=>`<g class="river-system" data-system="${r.id}" mask="url(#river-alpha)">${r.branches.map((b,j)=>water(b,r.id+'-'+j,true,j+i)).join('')}${water(r.knots,r.id,false,i)}<path class="river-hit" data-hover-river="${r.id}" data-select-river="${r.id}" d="${center(r.knots)}" fill="none" stroke="transparent" stroke-width="76"/></g>`).join('');
 return `<svg class="river-map" viewBox="0 0 1672 941" aria-hidden="true" focusable="false"><defs><radialGradient id="core-glow"><stop stop-color="#fffced" stop-opacity=".82"/><stop offset="1" stop-color="#fffced" stop-opacity="0"/></radialGradient><mask id="river-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941"><rect width="1672" height="941" fill="#000"/>${revealStrokes}${tributaryReveal}<rect class="river-reveal-complete" width="1672" height="941" fill="#fff"/></mask><mask id="river-alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="1672" height="941" style="mask-type:alpha"><image href="/assets/three-rivers/rivers-watercolor-hires-clean.svg" x="0" y="0" width="1672" height="941" preserveAspectRatio="none"/></mask><radialGradient id="mist-fill"><stop stop-color="#fffdf4" stop-opacity=".93"/><stop offset=".52" stop-color="#fffdf4" stop-opacity=".62"/><stop offset="1" stop-color="#fffdf4" stop-opacity="0"/></radialGradient></defs><g class="watercolor-reveal" mask="url(#river-reveal)"><image class="watercolor-rivers" href="/assets/three-rivers/rivers-watercolor-hires-clean.svg" x="0" y="0" width="1672" height="941" preserveAspectRatio="none" aria-hidden="true" focusable="false"/></g>${systems}<circle class="confluence" cx="884" cy="452" r="31" fill="url(#core-glow)"/> <g class="unknown-mist"><ellipse class="mist-breath" cx="390" cy="439" rx="210" ry="90" fill="url(#mist-fill)"/><ellipse class="mist-breath" cx="1420" cy="358" rx="225" ry="98" fill="url(#mist-fill)"/><ellipse class="mist-breath" cx="1220" cy="812" rx="195" ry="91" fill="url(#mist-fill)"/></g><g class="ambient-mist"><ellipse cx="1420" cy="130" rx="260" ry="92" fill="url(#mist-fill)"/><ellipse cx="290" cy="820" rx="220" ry="100" fill="url(#mist-fill)"/><ellipse cx="1515" cy="720" rx="200" ry="100" fill="url(#mist-fill)"/></g>${directions.map(d=>`<path class="future-water" data-fork="${d.river}" d="${d.path}" pathLength="100" fill="none" stroke="#79a5af" stroke-width="5" stroke-linecap="round"/>`).join('')}<g class="arrival-mist"><ellipse cx="550" cy="215" rx="530" ry="410" fill="url(#mist-fill)"/><ellipse cx="1270" cy="350" rx="450" ry="450" fill="url(#mist-fill)"/><ellipse cx="875" cy="820" rx="540" ry="380" fill="url(#mist-fill)"/></g></svg>`;
}
