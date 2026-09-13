const view=new URLSearchParams(location.search).get('view');
const workspace=['paths','plans','growth','sync','visitors'].includes(view);
document.documentElement.classList.toggle('explore-view',view==='explore'||workspace);
if(workspace){const style=document.createElement('link');style.rel='stylesheet';style.href='/frontend/src/workspaces.css';document.head.append(style);}
if(['river','paths','plans','growth'].includes(view)){
 const {workspaceConnection}=await import('./workspace-connection.js');
 const {explorationProfileConnection}=await import('./exploration-connection.js');
 await workspaceConnection.refresh();
 await explorationProfileConnection.refresh();
}
await import(view==='sync'?'./sync.js':view==='visitors'?'./visitors.js':view==='growth'?'./growth.js':['paths','plans'].includes(view)?'./workspaces.js':view==='explore'?'./exploration.js':view==='river'||new URLSearchParams(location.search).has('demo')?'./app.js':'./landing.js');
