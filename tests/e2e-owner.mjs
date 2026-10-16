/* Real-browser check of the owner features and the public waiting list on a phone-sized screen.
   Needs Microsoft Edge and a local Worker (npx wrangler dev --local --port 8787). Run: node tests/e2e-owner.mjs */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787', OUT = path.join(process.env.TEMP || '.', 'bookable-e2e-owner');
fs.mkdirSync(OUT, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
const PORT = 9557, edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(OUT, 'profile' + Date.now())}`, '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0; const ok = (c, m, why) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m + (!c && why ? '  -> ' + why : '')); };
let ws, id = 0; const pending = new Map(), errors = [];
async function connect() {
  for (let i = 0; i < 60; i++) { try { const page = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find(x => x.type === 'page'); if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; }); break; } } catch { /* not up */ } await sleep(300); }
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else if (d.method === 'Runtime.exceptionThrown') errors.push((d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text).slice(0, 160)); };
}
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error('page error: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 200)); return r.result.result.value; };
const go = async url => { await send('Page.navigate', { url }); await sleep(1800); };
const hash = async h => { await js(`location.hash = ${JSON.stringify(h)}`); await sleep(900); };
const shot = async name => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64')); };
const api = (m, p, b) => js(`fetch(${JSON.stringify(p)}, { method: ${JSON.stringify(m)}, headers: { 'content-type': 'application/json' }, body: ${b === undefined ? 'undefined' : JSON.stringify(JSON.stringify(b))} }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }))`);
const addDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

try {
  await connect(); await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  const tag = Math.random().toString(36).slice(2, 6), slug = 'e2e-' + tag, day = { on: true, start: '09:00', end: '17:30' };
  await go(BASE + '/app/#/login');
  await api('POST', '/api/signup', { email: `e2e-${tag}@example.com`, password: 'a long enough password' });
  await api('PUT', '/api/profile', { doc: { trade: 'barber', biz: { name: 'Owner E2E Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day }, timeOff: [], blocks: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } } });
  await api('POST', '/api/bookings', { svcId: 'cut', date: addDays(-60), time: '10:00', name: 'Quiet Quentin', phone: '07700 900501', status: 'done' });
  await api('POST', '/api/bookings', { svcId: 'cut', date: addDays(-5), time: '10:00', name: 'Recent Rita', phone: '07700 900502', status: 'done' });
  await api('POST', '/api/bookings', { svcId: 'cut', date: addDays(1), time: '11:00', name: 'Upcoming Ulf', phone: '07700 900503' });

  console.log('-- owner screens');
  errors.length = 0; await go(BASE + '/app/?r=1#/today');
  ok(await js(`document.body.innerText.includes('Today')`), 'the dashboard loads');
  await hash('#/page'); await sleep(900);
  const qr = await js(`(() => { const b = document.querySelector('#qrbox'); return b ? { svg: !!b.querySelector('svg'), paths: b.querySelectorAll('path').length, w: b.getBoundingClientRect().width } : null })()`);
  ok(qr && qr.svg && qr.paths === 1 && qr.w > 100, 'the booking page shows a QR code', JSON.stringify(qr));
  await shot('page-qr');
  const dl = await js(`!!document.querySelector('[data-act=qr-png]')`); ok(dl, 'there is a Download picture button');
  await hash('#/reminders');
  const cl = await js(`({ text: document.body.innerText, msg: [...document.querySelectorAll('a')].filter(a => /Message them/.test(a.textContent)).map(a => decodeURIComponent(a.href)) })`);
  ok(/your clients/i.test(cl.text) && /Quiet Quentin/i.test(cl.text), 'the Reminders page lists clients and shows who has gone quiet');
  ok(cl.msg.length >= 1 && /Quiet|it has been a little while/.test(cl.msg[0]) && /book/.test(cl.msg[0]) && /wa\.me\/447700900501/.test(cl.msg[0]), 'one tap opens WhatsApp to the quiet client with a written message', cl.msg.join(' | '));
  ok(!/Message them[\s\S]*Recent Rita[\s\S]*Message them/.test(cl.text), 'a recent client is not marked as quiet');
  await shot('reminders-clients');
  await hash('#/today');
  const open = await js(`(() => { const r = [...document.querySelectorAll('[data-act=open]')]; return r.length })()`);
  const upcoming = await js(`(async () => { location.hash = '#/calendar'; await new Promise(r => setTimeout(r, 700)); const dbtn = document.querySelector('[data-act=day][data-date="' + new Date(Date.now() + 864e5).toISOString().slice(0, 10) + '"]'); if (dbtn) dbtn.click(); await new Promise(r => setTimeout(r, 600)); const el = [...document.querySelectorAll('[data-act=open]')].find(e => /Upcoming Ulf/i.test(e.textContent)); if (el) el.click(); await new Promise(r => setTimeout(r, 500)); return [...document.querySelectorAll('a')].filter(a => /Send reminder/.test(a.textContent)).map(a => decodeURIComponent(a.href)) })()`);
  ok(upcoming.length === 1 && /Upcoming|reminder for your/.test(upcoming[0]) && /447700900503/.test(upcoming[0]), 'a booking has a Send reminder button that opens WhatsApp with the reminder written', JSON.stringify(upcoming));
  await shot('detail-reminder'); await js(`document.querySelector('[data-act=close]') && document.querySelector('[data-act=close]').click()`);

  console.log('-- a client joins the waiting list from their phone');
  await go(BASE + `/app/#/book/${slug}`);
  await js(`document.querySelector('[data-c=svc]').click()`); await sleep(500);
  ok(await js(`!!document.querySelector('[data-c=wl]')`), 'the booking page offers the waiting list');
  await js(`document.querySelector('[data-c=wl]').click()`); await sleep(500);
  await shot('wl-form');
  ok(await js(`!!document.querySelector('form[data-c=wlform]')`), 'the waiting list form opens');
  await js(`(function(){ var f = document.querySelector('form[data-c=wlform]'); f.elements.name.value = 'Wendy Waiting'; f.elements.phone.value = '07700 900777'; f.elements.date.selectedIndex = 3; f.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); })()`); await sleep(1500);
  ok(await js(`/You are on the list/.test(document.body.innerText)`), 'the client sees that they are on the list');
  await shot('wl-done');
  const me = await api('GET', '/api/me');
  ok(me.data.waitlist.length === 1 && me.data.waitlist[0].name === 'Wendy Waiting', 'the owner has the entry');
  await go(BASE + '/app/?r=2#/today'); await sleep(800);
  const wl = await js(`({ text: document.body.innerText, offer: [...document.querySelectorAll('a')].filter(a => /Offer a time/.test(a.textContent)).map(a => decodeURIComponent(a.href)) })`);
  ok(/waiting list/i.test(wl.text) && /Wendy Waiting/i.test(wl.text), 'the waiting list shows on the owner dashboard');
  ok(wl.offer.length === 1 && /447700900777/.test(wl.offer[0]) && /opened up/.test(wl.offer[0]), 'Offer a time opens WhatsApp with the message ready');
  await shot('today-waitlist');
  await js(`document.querySelector('[data-act=wl-del]').click()`); await sleep(800);
  ok(await js(`!/Wendy Waiting/.test(document.body.innerText)`), 'Remove takes them off the list');
  ok(errors.length === 0, 'no script errors', errors.join(' | '));
  await api('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} owner check(s) FAILED (screenshots in ${OUT})` : `\nall owner checks passed (screenshots in ${OUT})`);
} catch (e) { fails++; console.log('FAIL test crashed:', e.message); }
finally { try { ws.close(); } catch { /* ignore */ } edge.kill(); process.exit(fails ? 1 : 0); }
