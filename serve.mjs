import http from 'node:http';
import {stat,createReadStream} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Local preview only: bind to loopback so localhost remains a secure context.
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.gif':'image/gif','.webp':'image/webp','.mp4':'video/mp4','.txt':'text/plain; charset=utf-8'};
export function createPreviewServer(){
 return http.createServer((req,res)=>{
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;}
  let relative;
  try{relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '');}catch{res.writeHead(400);res.end();return;}
  const target=path.resolve(root,relative||'index.html');
  if(!target.startsWith(root)||relative.split('/').some(p=>p.startsWith('.'))){res.writeHead(403);res.end();return;}
  stat(target,(error,info)=>{
   if(error||!info.isFile()){res.writeHead(404);res.end('Not found');return;}
   const headers={'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-store','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff'};
   let first=0,last=info.size-1,status=200;
   if(req.headers.range){
    const m=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(m&&(m[1]||m[2])){
     first=m[1]?Number(m[1]):Math.max(0,info.size-Number(m[2]));
     last=m[1]&&m[2]?Math.min(info.size-1,Number(m[2])):info.size-1;
    }
    if(!m||(!m[1]&&!m[2])||!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first>last||first>=info.size){res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
    status=206;headers['Content-Range']=`bytes ${first}-${last}/${info.size}`;
   }
   headers['Content-Length']=Math.max(0,last-first+1);res.writeHead(status,headers);
   if(req.method==='HEAD'||info.size===0){res.end();return;}
   const stream=createReadStream(target,{start:first,end:last});stream.on('error',()=>res.destroy());stream.pipe(res);
  });
 });
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const port=process.env.PORT===undefined?5173:Number(process.env.PORT);
 if(!Number.isInteger(port)||port<0||port>65535){console.error('PORT must be an integer from 0 to 65535.');process.exit(1);}
 const server=createPreviewServer();
 server.on('error',error=>{
  if(error.code==='EADDRINUSE'&&port!==0){console.log('Port is busy. Choosing a free local port.');server.listen(0,'127.0.0.1');}
  else{console.error(error.message);process.exitCode=1;}
 });
 server.on('listening',()=>console.log(`\nMotion Strobe 1.16.3\nOpen: http://localhost:${server.address().port}\nStop: Ctrl+C\n`));
 server.listen(port,'127.0.0.1');
}
