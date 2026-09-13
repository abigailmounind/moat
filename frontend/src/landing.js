import {mapMarkup} from './map.js';
import {sidebarMarkup} from './sidebar.js';

const app=document.querySelector('#app');
app.innerHTML=`<main class="shell landing-shell">
 ${sidebarMarkup('cover')}
 <div class="coordinate-space landing-map" aria-hidden="true">
  <img class="terrain" src="/assets/three-rivers/terrain-v1.png" alt="" fetchpriority="high">
  ${mapMarkup([])}
  <div class="landing-river-names" aria-hidden="true">
   <span class="landing-river-name landing-river-love">热爱之河</span>
   <span class="landing-river-name landing-river-survival">生存之河</span>
   <span class="landing-river-name landing-river-ability">能力之河</span>
  </div>
 </div>
 <section class="landing-copy" aria-labelledby="landing-title">
  <p class="landing-kicker">人生三河</p>
  <h1 id="landing-title">看见你的积累，<br>走向更自由的选择。</h1>
  <p>从真实经历出发，梳理生存、能力与热爱三条河，找到愿意验证的下一步。</p>
  <a class="primary-button landing-start" href="/?view=explore">开始探索 <span aria-hidden="true">→</span></a>
 </section>
 <p class="landing-quote">三条河，<br><span>汇成更完整的人生。</span></p>
 <a class="visitor-map-button" href="/?view=visitors" aria-label="打开访客地图管理页" title="访客地图">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>
  <span>访客地图</span>
 </a>
</main>`;

const shell=document.querySelector('.landing-shell');
if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
 shell.classList.add('arriving');
 setTimeout(()=>shell.classList.remove('arriving'),5000);
}

const day=new Date().toISOString().slice(0,10);
try{
 if(localStorage.getItem('moat_visit_day')!==day){
  fetch('/api/v1/visits',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',keepalive:true}).then(response=>{if(response.ok)localStorage.setItem('moat_visit_day',day);}).catch(()=>{});
 }
}catch{}
