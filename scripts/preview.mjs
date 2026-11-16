import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../app/src/main/assets/www/',import.meta.url));
const types = {'.html':'text/html','.css':'text/css','.mjs':'text/javascript'};
http.createServer(async (request,response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const target = path.resolve(root,'.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(root) || request.method !== 'GET') {response.writeHead(403);response.end();return;}
    const data=await fs.readFile(target); response.writeHead(200,{'Content-Type':`${types[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store'});response.end(data);
  } catch {response.writeHead(404);response.end('Not found');}
}).listen(8766,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8766 (MIDI USB only in Android APK)'));
