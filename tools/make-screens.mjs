/* Retakes the product screenshots in src/static/img from the real app, with sample bookings.
   Needs: the app running locally (npx wrangler dev --local --port 8787, after node build.mjs) and Microsoft Edge.
   Run: node tools/make-screens.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), OUT = path.join(ROOT, 'src/static/img');
const BASE = process.env.BASE || 'http://localhost:8787';
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const tag = Math.random().toString(36).slice(2, 6);
const JOBS = [
  { trade: 'barber', name: 'Joe’s Barbers', phone: '07700 900123', town: 'Lichfield', key: 'barber' },
  { trade: 'nails', name: 'Amy’s Nails', phone: '07700 900124', town: 'Lichfield', key: 'nails' },
  { trade: 'dogs', name: 'Happy Paws Walks', phone: '07700 900125', town: 'Lichfield', key: 'dogs' },
];

const PORT = 9444, profile = path.join(process.env.TEMP || '.', 'bookable-shots-profile');
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
let ws, id = 0; const pending = new Map();
async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; }
    } catch { /* not up yet */ }
    await sleep(300);
  }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
const LIVE = 'https://pencil-booking.pencil-booking.workers.dev';
async function shot(file, w, h, scale, mobile) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: scale, mobile: !!mobile });
  await sleep(1200);
  /* show the live address instead of localhost */
  await js(`document.querySelectorAll('input').forEach(function(i){ if (i.value.indexOf('localhost') > -1) i.value = i.value.replace(/https?:\/\/localhost:\d+/, ${JSON.stringify(LIVE)}); });`);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await sharp(Buffer.from(r.result.data, 'base64')).webp({ quality: 84 }).toFile(file);
}

try {
  await connect(); await send('Page.enable'); await send('Network.enable');
  for (const j of JOBS) {
    const email = `shot-${j.key}-${tag}@example.com`;
    const r = await fetch(BASE + '/api/signup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'a long enough password ' + tag }) });
    if (r.status !== 201) throw new Error('signup failed ' + r.status);
    const [kv] = r.headers.getSetCookie()[0].split(';'), [cname, cval] = [kv.slice(0, kv.indexOf('=')), kv.slice(kv.indexOf('=') + 1)];
    await send('Network.clearBrowserCookies'); await send('Network.setCookie', { name: cname, value: cval, url: BASE, httpOnly: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 956, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: 'about:blank' }); await sleep(400); await send('Page.navigate', { url: BASE + '/app/#/today' }); await sleep(2500);
    await js(`(function(){ var f = document.getElementById('setup'); if (!f) return 'no form';
      f.querySelector('input[name=trade][value=${j.trade}]').click(); f.elements.name.value = ${JSON.stringify(j.name)}; f.elements.phone.value = ${JSON.stringify(j.phone)}; f.elements.town.value = ${JSON.stringify(j.town)}; f.elements.sample.checked = true;
      f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); return 'ok'; })()`);
    await sleep(3500);
    const slug = await js(`fetch('/api/me').then(r => r.json()).then(d => d.doc && d.doc.biz.slug)`);
    if (!slug) throw new Error('no business created for ' + j.key);
    if (j.key === 'barber') {
      await send('Page.navigate', { url: BASE + '/app/#/today' }); await sleep(2200); await shot(path.join(OUT, 'home-dashboard.webp'), 1600, 956, 1, false);
      await send('Page.navigate', { url: BASE + '/app/#/calendar' }); await sleep(2200); await shot(path.join(OUT, 'home-calendar.webp'), 1600, 956, 1, false);
    }
    await send('Page.navigate', { url: BASE + '/app/#/book/' + slug }); await sleep(2500);
    await shot(path.join(OUT, `phone-${j.key}.webp`), 360, 779, 2, true);
    console.log('done', j.key, slug);
  }
} finally { try { ws.close(); } catch { /* ignore */ } edge.kill(); }
process.exit(0);
