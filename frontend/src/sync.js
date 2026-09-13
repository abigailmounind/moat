import {sidebarMarkup} from './sidebar.js';
import {workspaceConnection} from './workspace-connection.js';
import {explorationProfileConnection} from './exploration-connection.js';
import {escapeHtml as e} from './exploration-render-utils.js';

const app=document.querySelector('#app');
let snapshot=null,preview=null,profilePreview=null,busy=false,message='',failed=false;
const counts=data=>`${data.paths.length} 条路径、${data.plans.length} 个计划、${data.growth.length} 条成长记录`;
const profileCounts=profile=>`${Object.keys(profile.evidence).length} 个证明、${Object.keys(profile.capitalLinks).length+Object.keys(profile.riverLinks).length} 条关联、${Object.keys(profile.unknowns).length} 处未知`;
function dataActions(state){
 if(state?.deletion)return `<section class="workspace-note"><h2>删除结果待核对</h2><p>删除请求可能已完成。会话失效不能证明删除成功，请保留导出文件。你可以清除此浏览器的服务器缓存并回到原始本地工作区；这不会再次删除服务器内容。</p><button type="button" class="quiet-button" data-action="detach">确认清理服务器缓存并回到本地</button></section>`;
 if(!state||state.pending)return '';
 return `<section class="workspace-note"><h2>服务端数据</h2><p>导出或删除当前连接主体的服务端档案、路径、计划和成长记录。删除还会移除服务端会话及历史回执；浏览器原始工作区、探索档案、已下载文件与备份不会被删除。</p><button type="button" class="quiet-button" data-action="export">导出并核对删除范围</button>${snapshot?`<p>本次导出：${counts(snapshot.data.workspace)}。删除后无法通过当前会话恢复。</p><button type="button" class="quiet-button" data-action="delete">再次确认：删除上述服务端数据</button><button type="button" class="quiet-button" data-action="cancel-delete">取消删除</button>`:''}</section>`;
}
function download(value){
 const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='personal-moat-server-data.json';document.body.append(link);
 try{link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
function render(){
 const status=workspaceConnection.status(),state=status.state;
 const profileStatus=explorationProfileConnection.status(),profileState=profileStatus.state,profileEnabled=profileState?.enabled===true,profilePending=Boolean(profileState?.pending);
 const enabled=state?.enabled===true,pending=Boolean(state?.pending);
 app.innerHTML=`<main class="explore-shell workspace-shell">${sidebarMarkup('sync')}<div class="explore-main"><header class="workspace-header"><div><span class="explore-kicker">人生三河</span><h1>数据与同步</h1><p>分别核对工作区和探索档案，再决定使用哪份内容。</p></div></header><section class="workspace-paper"><h2>长期工作区</h2><p>${enabled?'服务器工作区':'当前浏览器工作区'}</p><p>包含路径、计划、成长记录及成果快照。切换不会删除浏览器原有内容，两份工作区不会自动合并。</p><p role="status" class="workspace-notice ${failed?'is-error':''}">${e(message||status.issue||profileStatus.issue||'')}</p><div class="workspace-actions">${pending?'<button type="button" class="primary-button" data-action="retry">核对未完成提交</button>':`<button type="button" class="primary-button" data-action="preview">核对工作区内容</button>${enabled?'<button type="button" class="quiet-button" data-action="refresh">刷新服务器工作区</button><button type="button" class="quiet-button" data-action="local">工作区切回浏览器</button>':''}`}</div>${preview?`<section class="workspace-note"><h2>工作区保存前核对</h2><p>服务器：${counts(preview.workspace)}</p><p>当前浏览器：${preview.local.ok?counts(preview.local.data):e(preview.local.error)}</p><p>浏览器原有内容继续保留。</p><div class="workspace-actions"><button type="button" class="primary-button" data-action="enable">确认使用服务器工作区</button>${preview.local.ok&&preview.workspace.revision===0&&!preview.workspace.paths.length&&!preview.workspace.plans.length&&!preview.workspace.growth.length?'<button type="button" class="quiet-button" data-action="import">确认复制本地工作区并连接</button>':''}<button type="button" class="quiet-button" data-action="cancel">取消</button></div></section>`:''}<section class="workspace-note"><h2>探索确认档案</h2><p>${profileEnabled?'服务器档案':'当前浏览器档案'}。这里只同步逐条确认后的证明、关联、方向与未知，不上传探索原始回答。</p><div class="workspace-actions">${profilePending?'<button type="button" class="primary-button" data-action="profile-retry">核对未完成档案提交</button>':`<button type="button" class="primary-button" data-action="profile-preview">核对探索档案</button>${profileEnabled?'<button type="button" class="quiet-button" data-action="profile-refresh">刷新服务器档案</button><button type="button" class="quiet-button" data-action="profile-local">档案切回浏览器</button>':''}`}</div>${profilePreview?`<div><p>服务器：${profileCounts(profilePreview.profile)}</p><p>当前浏览器：${profilePreview.local.ok?profileCounts(profilePreview.local.profile):e(profilePreview.local.error)}</p><p>复制仅允许写入空服务器档案；浏览器原件继续保留。</p><div class="workspace-actions"><button type="button" class="primary-button" data-action="profile-enable">确认使用服务器档案</button>${profilePreview.local.ok&&profilePreview.revision===0&&profileCounts(profilePreview.profile)==='0 个证明、0 条关联、0 处未知'?'<button type="button" class="quiet-button" data-action="profile-import">确认复制本地确认档案并连接</button>':''}<button type="button" class="quiet-button" data-action="profile-cancel">取消</button></div></div>`:''}</section>${dataActions(state)}<p><a class="text-button" href="/?view=paths">返回未来路径 →</a></p></section></div></main>`;
 app.setAttribute('aria-busy',String(busy));
 for(const button of app.querySelectorAll('button'))button.disabled=busy;
}
app.addEventListener('click',async event=>{
 const action=event.target.closest('[data-action]')?.dataset.action;
 if(!action||busy)return;
 if(action==='cancel-delete'){snapshot=null;message='已取消删除。';failed=false;render();return;}
 if(action==='profile-cancel'){profilePreview=null;message='已取消，探索档案保存位置未改变。';failed=false;render();return;}
 if(action==='cancel'){preview=null;message='已取消，保存位置未改变。';failed=false;render();return;}
 const work={export:()=>workspaceConnection.exportData(),delete:()=>workspaceConnection.deleteData(snapshot,{confirmed:true}),detach:()=>workspaceConnection.detachDeleted({confirmed:true}),preview:()=>workspaceConnection.preview(),refresh:()=>workspaceConnection.refresh(),retry:()=>workspaceConnection.retry(),local:()=>workspaceConnection.useLocal(),enable:()=>workspaceConnection.enable(preview),import:()=>workspaceConnection.enable(preview,{importLocal:true}),'profile-preview':()=>explorationProfileConnection.preview(),'profile-refresh':()=>explorationProfileConnection.refresh(),'profile-retry':()=>explorationProfileConnection.retry(),'profile-local':()=>explorationProfileConnection.useLocal(),'profile-enable':()=>explorationProfileConnection.enable(profilePreview),'profile-import':()=>explorationProfileConnection.enable(profilePreview,{importLocal:true})}[action];
 if(!work||(['enable','import'].includes(action)&&!preview)||(['profile-enable','profile-import'].includes(action)&&!profilePreview))return;
 busy=true;message='正在核对，请稍候…';failed=false;render();
 try{
  const result=await work();
  if((action==='delete'&&result.deleted===true)||action==='detach'){
   const subjectId=snapshot?.subject?.id??profileStatus.state?.subjectId;
   if(subjectId)await explorationProfileConnection.detachDeletedSubject(subjectId,{confirmed:true});
  }
  failed=!result.ok;
  if(action==='export'&&result.ok){download(result.snapshot);snapshot=result.snapshot;preview=null;message='导出文件已交给浏览器下载，请确认文件已保存。只有再次确认才会删除。';}
  else if(action==='delete'||action==='detach'){snapshot=null;preview=null;message=result.ok?(action==='delete'?'服务端已确认删除，已清理本机服务器缓存。原始本地内容仍保留。':'已清理本机服务器缓存，回到原始本地工作区；服务端删除结果仍未确认。'):result.error;}
  else if(result.ok){snapshot=null;if(action==='profile-preview'){profilePreview=result;preview=null;message='请核对探索档案，确认后才切换或复制。';}else{preview=action==='preview'?result:null;if(action.startsWith('profile-'))profilePreview=null;message=action==='preview'?'请核对下方内容，确认后才切换或复制。':action==='local'?'已切回浏览器工作区。':action==='profile-local'?'探索档案已切回当前浏览器。':action.startsWith('profile-')?'服务器探索档案已核对并保存。':'服务器工作区已核对并保存。';}}
  else{preview=null;profilePreview=null;message=result.error;}
 }catch{preview=null;profilePreview=null;failed=true;message='操作未完成，请重新核对。原有本地内容仍保留。';}
 finally{busy=false;render();}
});
render();
