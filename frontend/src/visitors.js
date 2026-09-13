import {sidebarMarkup} from './sidebar.js';

const app=document.querySelector('#app');
const e=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const world=`<svg class="visitor-world" viewBox="0 0 1000 500" role="img" aria-label="全球访客地点分布"><path d="M63 139 104 91l92-38 90 17 51 48-23 43-63 4-33 44-50 2-37 51-45-34-31-49Zm250 119 48 24 25 65-17 92-40 42-20-91-31-57Zm197-163 77-35 87 13 51 42 91 3 99 56-38 51-74-3-31 29-74-15-32 48-61-19-35-54-70-20-28-45Zm102 208 52 18 15 70-47 57-37-70Zm237 63 57-25 53 19-23 45-68 13-35-25Z"/></svg>`;

function login(message=''){
 app.innerHTML=`<main class="explore-shell visitor-shell">${sidebarMarkup('visitors')}<div class="explore-main"><section class="visitor-login"><span class="explore-kicker">私有统计</span><h1>访客地图</h1><p>输入管理密钥后查看近 30 天的粗粒度访问地点。密钥只在当前页面内使用。</p><form><label class="workspace-field"><span>管理密钥</span><input name="key" type="password" autocomplete="current-password" required></label><button class="primary-button">打开地图</button><p class="workspace-notice is-error" role="alert">${e(message)}</p></form></section></div></main>`;
 app.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const key=new FormData(event.currentTarget).get('key');await load(key);});
}
function point(visit){const x=(visit.longitude+180)/360*1000,y=(90-visit.latitude)/180*500;return `<circle class="visitor-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7"><title>${e(visit.city||visit.country||'未知地点')}</title></circle>`;}
function formatTime(value){return new Intl.DateTimeFormat('zh-CN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));}
function render(data){
 const visits=data.visits||[],map=world.replace('</svg>',visits.filter(item=>Number.isFinite(item.latitude)&&Number.isFinite(item.longitude)).map(point).join('')+'</svg>');
 app.innerHTML=`<main class="explore-shell visitor-shell">${sidebarMarkup('visitors')}<div class="explore-main"><header class="workspace-header"><div><span class="explore-kicker">近 30 天</span><h1>访客地图</h1><p>共 ${data.total??visits.length} 次访问，当前显示最近 ${data.returned??visits.length} 条；地点约化到城市范围，不保存 IP、回答或个人档案标识。</p></div><a class="quiet-button" href="/">返回封面 →</a></header><section class="visitor-map-card">${map}</section><section class="visitor-log"><h2>访问记录</h2>${visits.length?`<ol>${visits.map(item=>`<li><time datetime="${e(item.visitedAt)}">${e(formatTime(item.visitedAt))}</time><strong>${e([item.city,item.region,item.countryCode].filter(Boolean).join(' · ')||'地点未知')}</strong></li>`).join('')}</ol>`:'<p>近 30 天还没有访问记录。</p>'}</section></div></main>`;
}
async function load(key){
 try{const response=await fetch('/api/v1/admin/visits',{headers:{Authorization:`Bearer ${key}`}});if(!response.ok)throw new Error(response.status===401?'管理密钥不正确。':'访客统计暂时无法读取。');render(await response.json());}
 catch(error){login(error.message);}
}
login();
