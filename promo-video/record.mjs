/* Renders the Bookable TikTok intro. Usage: node promo-video/record.mjs stills   (preview frames)
                                          node promo-video/record.mjs video    (records pencil-intro.mp4 in real time, 15 s) */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..');
const mode = process.argv[2] || 'stills', VID = process.argv[3] || '1';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const FILES = {
  '/': [path.join(HERE, 'index.html'), 'text/html'], '/favicon.svg': [path.join(ROOT, 'src/static/favicon.svg'), 'image/svg+xml'],
  '/img/phone-barber.webp': [path.join(ROOT, 'src/static/img/phone-barber.webp'), 'image/webp'], '/img/home-dashboard.webp': [path.join(ROOT, 'src/static/img/home-dashboard.webp'), 'image/webp'], '/img/home-calendar.webp': [path.join(ROOT, 'src/static/img/home-calendar.webp'), 'image/webp'],
  '/mp4-muxer.js': [path.join(HERE, 'node_modules/mp4-muxer/build/mp4-muxer.js'), 'text/javascript'],
  '/inter.woff2': [path.join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), 'font/woff2'],
};
const server = http.createServer((req, res) => { const f = FILES[req.url.split('?')[0]]; if (!f) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': f[1] }); fs.createReadStream(f[0]).pipe(res); });
await new Promise(r => server.listen(5191, r));

const PORT = 9333, profile = path.join(process.env.TEMP || '.', 'pencil-promo-profile');
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--autoplay-policy=no-user-gesture-required', '--window-size=1080,1920', '--hide-scrollbars', '--mute-audio=false', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(), page = list.find(x => x.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; }
    } catch { /* not up yet */ }
    await sleep(300);
  }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const evalJs = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, timeout: 600000 }); if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 400)); return r.result.result.value; };

try {
  await connect();
  await send('Page.enable'); await send('Page.navigate', { url: 'http://127.0.0.1:5191/?v=' + VID });
  await sleep(2500);
  if (mode === 'stills') {
    for (const t of [0.5, 1.4, 3.3, 5.2, 7.6, 10.4, 11.9, 13.8]) {
      const url = await evalJs(`window.BookablePromo.still(${t})`);
      fs.writeFileSync(path.join(HERE, `still${VID}-${String(t).replace('.', '_')}.png`), Buffer.from(url.split(',')[1], 'base64'));
    }
    console.log('stills written');
  } else {
    const out = await evalJs('window.BookablePromo.encode()');
    const ext = out.type.includes('mp4') ? 'mp4' : 'webm';
    fs.writeFileSync(path.join(HERE, `bookable-${({ 1: 'intro', 2: 'security', 3: 'pricing', 4: 'before-after', 5: 'while-you-sleep', 6: 'no-shows' })[VID]}.${ext}`), Buffer.from(out.data, 'base64'));
    console.log('recorded', out.type, ext);
  }
} finally { try { ws?.close(); } catch { /* ignore */ } edge.kill(); server.close(); }
process.exit(0);
