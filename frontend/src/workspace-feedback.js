import {activeWorkspaceLabel} from './workspace-connection.js';

export const workspaceSourceMarkup=()=>'<p class="workspace-notice" data-connection-state>'+activeWorkspaceLabel()+' · <a class="text-button" href="/?view=sync">数据与同步 →</a></p>';

// Keep the local synchronous path intact; guard controls only during remote I/O.
export function guardWorkspaceWrite(root,result){
 if(!(result instanceof Promise))return result;
 const controls=Array.from(root.querySelectorAll('button,input,textarea,select')).map(node=>[node,node.disabled]);
 for(const [node] of controls)node.disabled=true;
 const status=root.querySelector('[data-connection-state]'),previous=status?.innerHTML;
 if(status)status.textContent='正在核对并保存到服务器…';
 const block=event=>{event.preventDefault();event.stopImmediatePropagation();};
 const unload=event=>{event.preventDefault();event.returnValue='';};
 root.setAttribute('aria-busy','true');root.addEventListener('click',block,true);root.addEventListener('submit',block,true);window.addEventListener('beforeunload',unload);
 return result.finally(()=>{
  for(const [node,disabled] of controls)node.disabled=disabled;
  if(status)status.innerHTML=previous;
  root.removeAttribute('aria-busy');root.removeEventListener('click',block,true);root.removeEventListener('submit',block,true);window.removeEventListener('beforeunload',unload);
 });
}
