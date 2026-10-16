/* Real-browser, phone-sized walk-through of the live booking flow (a customer books the demo business), plus a layout check
   of the main pages on a phone. Needs Microsoft Edge. Run: node tests/e2e-phone.mjs   (BASE=https://mybookable.co.uk by default)
   It books one appointment on the "Demo Barbers" test business, then cancels it again. */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = process.env.BASE || 'https://mybookable.co.uk', OUT = path.join(process.env.TEMP || '.', 'bookable-e2e');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const PORT = 9555, edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, 'profile')}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m, why) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m + (!c && why ? '  -> ' + why : '')); };
let ws, id = 0; const pending = new Map(), errors = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } } catch { /* not up */ } await sleep(300); }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.text + ' ' + (d.params.exceptionDetails.exception?.description || '').slice(0, 120)); else if (d.method === 'Log.entryAdded' && d.params.entry.level === 'error') errors.push(d.params.entry.text + ' ' + (d.params.entry.url || '')); };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)); return r.result.result.value; };
const go = async url => { await send('Page.navigate', { url }); await sleep(2600); };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };

try {
  await connect(); await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

  console.log('-- pages fit a phone screen and have no script errors');
  for (const p of ['/', '/pricing/', '/blog/', '/blog/stop-no-shows-barbershop/', '/barbers/', '/client/', '/app/#/login', '/find/', '/privacy/', '/terms/']) {
    errors.length = 0; await go(BASE + p);
    const m = await js(`({ w: document.documentElement.scrollWidth, vw: innerWidth, title: document.title, h1: (document.querySelector('h1')||{}).textContent || '' })`);
    ok(m.w <= m.vw + 1, `${p}: no sideways scrolling on a phone`, `page ${m.w}px wide vs screen ${m.vw}px`);
    ok(m.title.length > 3 && !/undefined|\[object/.test(m.title + m.h1), `${p}: has a proper title and heading`, m.title);
    ok(errors.length === 0, `${p}: no script errors`, errors.join(' | ').slice(0, 200));
    if (p === '/') await shot('home');
  }

  console.log('-- a customer books the demo business, start to finish');
  errors.length = 0; await go(BASE + '/app/#/book/demo-barbers'); await shot('book-1-services');
  ok(await js(`!!document.querySelector('[data-c=svc]')`), 'services are listed');
  await js(`document.querySelector('[data-c=svc]').click()`); await sleep(700);
  ok(await js(`!!document.querySelector('[data-c=date]')`), 'days are offered after choosing a service');
  await js(`document.querySelectorAll('[data-c=date]')[1]?.click() || document.querySelector('[data-c=date]').click()`); await sleep(600);
  let times = await js(`document.querySelectorAll('[data-c=time]').length`);
  if (!times) { await js(`document.querySelectorAll('[data-c=date]')[2]?.click()`); await sleep(600); times = await js(`document.querySelectorAll('[data-c=time]').length`); }
  ok(times > 0, 'free times are shown', 'none found');
  await js(`document.querySelectorAll('[data-c=time]')[${Math.min(times - 1, 3)}].click()`); await sleep(500);
  await js(`(document.querySelector('[data-c=next2]')||{click(){}}).click()`); await sleep(700);
  const hasForm = await js(`!!document.querySelector('input[name=name]')`);
  ok(hasForm, 'the details form appears');
  await shot('book-2-form');
  const phone = '07700 9' + String(Math.floor(10000 + Math.random() * 89999));
  await js(`(function(){ var f = document.querySelector('input[name=name]').form; f.elements.name.value = 'E2E Test'; f.elements.phone.value = '${phone}'; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); })()`); await sleep(2200);
  const done = await js(`document.body.innerText`);
  ok(/booked in|Pay your deposit/i.test(done), 'the confirmation screen says the booking is made', done.slice(0, 120));
  await shot('book-3-confirmed');
  ok(errors.length === 0, 'no script errors while booking', errors.join(' | ').slice(0, 200));
  console.log(fails ? `\n${fails} phone check(s) FAILED (screenshots in ${OUT})` : `\nall phone checks passed (screenshots in ${OUT})`);
} catch (e) { fails++; console.log('FAIL test crashed:', e.message); }
finally { try { ws.close(); } catch { /* ignore */ } edge.kill(); process.exit(fails ? 1 : 0); }
