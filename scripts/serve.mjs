import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
 let route;try{route=decodeURIComponent((req.url||'/').split('?')[0]);}catch{res.writeHead(400);res.end('Invalid URL');return;}
 if(route==='/')route='/index.html';
 const allowed=route==='/index.html'||/^\/src\/[a-z-]+\.(js|css)$/.test(route)||/^\/assets\/fonts\/[A-Za-z0-9._-]+\.(ttf|woff2?)$/.test(route)||['/assets/three-rivers/terrain-v1.png','/assets/three-rivers/rivers-v2.svg','/assets/three-rivers/rivers-watercolor-hires.svg','/assets/three-rivers/rivers-watercolor-hires-clean.svg','/assets/three-rivers/rivers-watercolor-hires-clean.png'].includes(route);
 if(!allowed){res.writeHead(404);res.end('Not found');return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 try{const data=await readFile(path.join(root,route));res.writeHead(200,{'Content-Type':types[path.extname(route)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
server.listen(4173,'127.0.0.1',()=>console.log('我的河 · http://127.0.0.1:4173'));
