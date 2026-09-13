const symbols={
 leaf:'M20 3C9 1 3 8 5 17c7 5 16-2 15-14ZM4 21 17 7M8 16l-1-5m5 1 5-1',
 home:'m3 11 9-8 9 8M5 10v11h5v-7h4v7h5V10',
 compass:'M12 2v4m0 12v4M2 12h4m12 0h4M5 5l3 3m8 8 3 3M5 19l3-3m8-8 3-3M7 12a5 5 0 1 0 10 0 5 5 0 1 0-10 0Zm3 2 1-4 3-1-1 4Z',
 fork:'M12 22V3m0 9 7-5m-7 10-7-5M17 4h3v4M3 9h3v4',
 plan:'M6 4H4v18h16V4h-2M8 2h8v4H8Zm0 9h8m-8 4h5',
 chart:'M4 21V11m6 10V6m6 15V2m5 19H1',
 settings:'M4 7h16M4 17h16M8 3v8m8 2v8',
 info:'M12 10v7m0-11v1M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0'
};

const icon=name=>'<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+(symbols[name]||symbols.info)+'"/></svg>';
const items=[
 ['home','/?view=river','home','我的河'],
 ['explore','/?view=explore','compass','探索'],
 ['paths','/?view=paths','fork','未来路径'],
 ['plans','/?view=plans','plan','护城河计划'],
 ['growth','/?view=growth','chart','成长记录']
];

export function sidebarMarkup(active){
 const navigation=items.map(([id,href,glyph,label])=>{
  const current=id===active;
  return '<a class="nav-item '+(current?'active':'')+'" href="'+href+'" '+(current?'aria-current="page"':'')+'>'+icon(glyph)+'<span>'+label+'</span></a>';
 }).join('');
 return '<aside class="sidebar explore-sidebar"><a class="brand" href="/">'+icon('leaf')+'<span>人生护城河</span></a><nav aria-label="主导航">'+navigation+'</nav><div class="sidebar-bottom"><span class="landscape-avatar" aria-hidden="true"></span><p>让人生<br>有更多可能的河流</p><a class="subtle-button" href="/?view=river&panel=settings">'+icon('settings')+' 显示设置</a><a class="subtle-button" href="/?view=sync" '+(active==='sync'?'aria-current="page"':'')+'>数据与同步 →</a></div></aside>';
}
