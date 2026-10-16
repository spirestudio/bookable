/* Waiting list and the 6pm Telegram summary, against a local Worker and a fake Telegram on port 9876.
   .dev.vars needs TELEGRAM_BOT_TOKEN, TELEGRAM_API=http://localhost:9876, TELEGRAM_WEBHOOK_SECRET=testhook
   Start: npx wrangler dev --local --port 8787 --test-scheduled      Run: node tests/features.test.mjs */
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl; DELETE FROM waitlist; DELETE FROM bookings; DELETE FROM profiles; DELETE FROM sessions; DELETE FROM users;"', { stdio: 'ignore' });
const got = [];
const fake = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { got.push(JSON.parse(b || '{}')); res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }); });
await new Promise(r => fake.listen(9876, r));
const wait = async (n, ms = 4000) => { const t0 = Date.now(); while (got.length < n && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const h = { 'content-type': 'application/json', ...headers }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data };
  }
}
const day = { on: true, start: '09:00', end: '17:30' };
const doc = (slug, name) => ({ trade: 'barber', biz: { name, slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day }, timeOff: [], blocks: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}' } });
const addDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOOK = { 'x-telegram-bot-api-secret-token': 'testhook' };

const tag = Math.random().toString(36).slice(2, 6), A = new Client(), B = new Client(), anon = new Client(), slugA = 'wa-' + tag, slugB = 'wb-' + tag;
await A.req('POST', '/api/signup', { email: `wa-${tag}@example.com`, password: 'a long enough password' }); await A.req('PUT', '/api/profile', { doc: doc(slugA, 'Wait Cuts') });
await B.req('POST', '/api/signup', { email: `wb-${tag}@example.com`, password: 'a long enough password' }); await B.req('PUT', '/api/profile', { doc: doc(slugB, 'Other Cuts') });
const join = (slug, o) => new Client().req('POST', `/api/public/${slug}/waitlist`, { svcId: 'cut', date: addDays(2), name: 'Pat Waiting', phone: '07700 900401', ...o });

console.log('-- waiting list');
ok((await A.req('GET', '/api/me')).data.waitlist.length === 0, 'starts empty');
ok((await join(slugA, {})).status === 201, 'a client joins for a day');
ok((await join(slugA, { date: '', phone: '07700 900402', name: 'Any Day' })).status === 201, 'a client joins for any day');
await join(slugA, {});
let wl = (await A.req('GET', '/api/me')).data.waitlist;
ok(wl.length === 2, 'the same person asking twice only appears once', 'count ' + wl.length);
ok(wl.every(x => x.svc_name === 'Haircut'), 'each entry shows the service');
ok((await B.req('GET', '/api/me')).data.waitlist.length === 0, 'another business sees nothing');
ok((await join(slugA, { svcId: 'nope' })).status === 422, 'an unknown service is refused');
ok((await join(slugA, { name: '' })).status === 422, 'a name is required');
ok((await join(slugA, { phone: '123' })).status === 422, 'a real phone number is required');
ok((await join(slugA, { date: '2020-01-01' })).status === 422, 'a day in the past is refused');
ok((await join('no-such-biz-xx', {})).status === 404, 'an unknown business is a 404');
ok((await B.req('DELETE', '/api/waitlist/' + wl[0].id)).status === 200 && (await A.req('GET', '/api/me')).data.waitlist.length === 2, 'another owner cannot remove my entries');
ok((await anon.req('DELETE', '/api/waitlist/' + wl[0].id)).status === 401, 'signed-out people cannot remove entries');
ok((await A.req('DELETE', '/api/waitlist/' + wl[0].id)).status === 200 && (await A.req('GET', '/api/me')).data.waitlist.length === 1, 'the owner removes one');

console.log('-- waiting list alerts and the evening summary');
const link = await A.req('POST', '/api/telegram/link', {}); const code = link.data.url.split('start=')[1];
await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 555, type: 'private' }, text: '/start ' + code } }, HOOK); await wait(1);
got.length = 0;
await join(slugA, { phone: '07700 900403', name: 'Via Alert' }); await wait(1);
ok(got.length === 1 && String(got[0].chat_id) === '555' && /Waiting list: Via Alert/.test(got[0].text), 'the owner is told on Telegram when someone joins');
ok(!/07700|900403/.test(got[0].text), 'and no phone number is sent');

got.length = 0;
const tomorrow = addDays(1);
await A.req('POST', '/api/bookings', { svcId: 'cut', date: tomorrow, time: '09:30', name: 'First Up', phone: '07700 900410' });
await A.req('POST', '/api/bookings', { svcId: 'cut', date: tomorrow, time: '14:00', name: 'Later On', phone: '07700 900411' });
const hourNow = +new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date());
const cfg = Number((fs.readFileSync('.dev.vars', 'utf8').match(/^SUMMARY_HOUR=(\d+)/m) || [])[1]);
if (cfg !== hourNow) { console.log('FAIL .dev.vars needs SUMMARY_HOUR=' + hourNow + ' (the current UK hour), then restart wrangler dev'); fails++; }
else {
  execSync(`npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM settings WHERE k = 'tgsum_last'"`, { stdio: 'ignore' });
  const trig = async () => (await fetch(BASE + '/__scheduled?cron=7+*+*+*+*')).status;
  await trig(); await wait(1, 5000);
  const sum = got.filter(g => /Tomorrow/.test(g.text || '') && /First Up/.test(g.text || ''));
  ok(sum.length === 1 && /2 bookings/.test(sum[0].text) && /09:30/.test(sum[0].text) && /First Up/.test(sum[0].text), 'in the summary hour the owner gets "2 bookings, first at 09:30"');
  ok(sum.length === 1 && !/0770/.test(sum[0].text), 'the summary has no phone numbers');
  await trig(); await new Promise(r => setTimeout(r, 800));
  ok(got.filter(g => /Tomorrow/.test(g.text || '') && /First Up/.test(g.text || '')).length === 1, 'it is only sent once a day');
}

console.log('-- clean up');
await A.req('DELETE', '/api/account', {}); await B.req('DELETE', '/api/account', {});
fake.close();
console.log(fails ? `\n${fails} feature check(s) FAILED` : '\nall feature checks passed');
process.exit(fails ? 1 : 0);
