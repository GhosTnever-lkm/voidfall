const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const root = __dirname;
const port = Number(process.env.PORT || 8765);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.writeHead(400).end('Bad request'); return; }
  if (pathname === '/') pathname = '/index.html';
  const file = path.resolve(root, `.${pathname}`);
  if (!file.startsWith(root + path.sep) && file !== path.join(root, 'index.html')) { res.writeHead(403).end('Forbidden'); return; }
  fs.readFile(file, (error, data) => {
    if (error) { res.writeHead(404).end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
});

server.on('error', async (error) => {
  if (error.code !== 'EADDRINUSE') throw error;
  const url = `http://127.0.0.1:${port}/`;
  try {
    const response = await fetch(url);
    const html = await response.text();
    if (!response.ok || !html.includes('VOIDFALL')) throw new Error('occupied by another service');
    console.log(`Voidfall уже запущен: ${url}`);
    if (process.platform === 'win32' && process.env.VOIDFALL_NO_OPEN !== '1') execFile('cmd.exe', ['/c', 'start', '', url]);
  } catch {
    console.error(`Порт ${port} занят другим приложением. Закройте его или смените PORT.`);
    process.exitCode = 1;
  }
});

server.listen(port, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log(`Voidfall запущен: ${url}`);
  if (process.platform === 'win32' && process.env.VOIDFALL_NO_OPEN !== '1') execFile('cmd.exe', ['/c', 'start', '', url]);
});
