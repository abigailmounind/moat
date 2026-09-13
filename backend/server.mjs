import {createAnalysisService} from './analysis-service.mjs';
import {createProductService} from './product-service.mjs';
import {createProductRuntime} from './product-runtime.mjs';
import {createAliyunModelProviderFromEnv} from './aliyun-model-provider.mjs';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.woff':'font/woff','.woff2':'font/woff2'};
let modelProvider=null;
try{modelProvider=createAliyunModelProviderFromEnv();}catch(error){console.error(`模型通道未启用：${error.message}`);}
const handleAnalysis=createAnalysisService();
const runtime=await createProductRuntime();
const handleProduct=createProductService({repository:runtime.repository,modelProvider,modelTimeoutMs:Number(process.env.MOAT_MODEL_TIMEOUT_MS||75000),modelCallsPerHour:Number(process.env.MOAT_MODEL_CALLS_PER_HOUR||6)});
const server=http.createServer(async(req,res)=>{
 let route;try{route=decodeURIComponent((req.url||'/').split('?')[0]);}catch{res.writeHead(400);res.end('Invalid URL');return;}
 if(route.startsWith('/api/v1/')){await handleProduct(req,res);return;}
 if(['/api/analysis','/api/capabilities'].includes(route)){await handleAnalysis(req,res);return;}
 if(route==='/')route='/frontend/index.html';
 const allowed=route==='/frontend/index.html'||/^\/frontend\/src\/[a-z-]+\.(js|css)$/.test(route)||['/shared/growth-proof.js','/shared/understanding.js','/shared/rules-analysis.js','/shared/profile.js','/shared/profile-changes.js','/shared/workspace.js','/shared/workspace-operations.js'].includes(route)||/^\/assets\/fonts\/[A-Za-z0-9._-]+\.(ttf|woff2?)$/.test(route)||['/assets/three-rivers/terrain-v1.png','/assets/three-rivers/rivers-v2.svg','/assets/three-rivers/rivers-watercolor-hires.svg','/assets/three-rivers/rivers-watercolor-hires-clean.svg','/assets/three-rivers/rivers-watercolor-hires-clean.png'].includes(route);
 if(!allowed){res.writeHead(404);res.end('Not found');return;}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
 try{const data=await readFile(path.join(root,route));res.writeHead(200,{'Content-Type':types[path.extname(route)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(req.method==='HEAD'?undefined:data);}catch{res.writeHead(404);res.end('Not found');}
});
const previewPort=Number(process.env.MOAT_PREVIEW_PORT||4173);
server.listen(previewPort,'127.0.0.1',()=>console.log(`人生护城河 · http://127.0.0.1:${server.address().port}`));
let closing=false;
async function close(){if(closing)return;closing=true;server.close(async()=>{await runtime.close();});server.closeIdleConnections();}
process.once('SIGTERM',close);process.once('SIGINT',close);
server.once('error',async error=>{console.error(error.code==='EADDRINUSE'?'预览端口已被占用。':'预览服务启动失败。');await runtime.close();process.exitCode=1;});
