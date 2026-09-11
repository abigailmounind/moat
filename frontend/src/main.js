const view=new URLSearchParams(location.search).get('view');
const workspace=['paths','plans','growth','sync'].includes(view);
document.documentElement.classList.toggle('explore-view',view==='explore'||workspace);
if(workspace){const style=document.createElement('link');style.rel='stylesheet';style.href='/frontend/src/workspaces.css';document.head.append(style);}
if(view!=='explore'&&view!=='sync'&&!new URLSearchParams(location.search).has('demo')){
 const {workspaceConnection}=await import('./workspace-connection.js');
 await workspaceConnection.refresh();
}
await import(view==='sync'?'./sync.js':view==='growth'?'./growth.js':workspace?'./workspaces.js':view==='explore'?'./exploration.js':'./app.js');
