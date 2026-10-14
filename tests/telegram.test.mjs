/* Telegram owner alerts, against a locally running Worker and a fake Telegram server.
   Needs these lines in .dev.vars:  TELEGRAM_BOT_TOKEN=test:token   TELEGRAM_CHAT_ID=1   TELEGRAM_API=http://localhost:9876
   Start: npx wrangler dev --local --port 8787   Run: node tests/telegram.test.mjs */
import http from 'node:http';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };
const dv = fs.existsSync('.dev.vars') ? fs.readFileSync('.dev.vars', 'utf8') : '';
const ADMIN = (dv.match(/^ADMIN_CODE=(.+)$/m) || [])[1]?.trim();
if (!ADMIN || !/TELEGRAM_API=http:\/\/localhost:9876/.test(dv)) { console.log('Add ADMIN_CODE and the three TELEGRAM_* test lines to .dev.vars first.'); process.exit(1); }
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl; DELETE FROM bookings; DELETE FROM profiles; DELETE FROM sessions; DELETE FROM users; DELETE FROM billing; DELETE FROM payments;"', { stdio: 'ignore' });

/* a fake Telegram: records every sendMessage it receives */
const got = [];
const fake = http.createServer((req, res) => { let b = ''; req.on('data', d => b += d); req.on('end', () => { got.push({ url: req.url, body: JSON.parse(b || '{}') }); res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); }); }).listen(9876);

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { 'content-type': 'application/json' }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data };
  }
}
const waitFor = async (n, ms = 4000) => { const t0 = Date.now(); while (got.length < n && Date.now() - t0 < ms) await new Promise(r => setTimeout(r, 50)); };
const day = on => ({ on, start: '09:00', end: '17:30' });
const doc = (slug, name) => ({ trade: 'barber', biz: { name, slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day(false), 1: day(false), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(false) }, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });

(async () => {
  const tag = Math.random().toString(36).slice(2, 7), email = `alert-${tag}@example.com`, owner = new Client(), admin = new Client(), anon = new Client();

  ok((await owner.req('POST', '/api/signup', { email, password: 'a long enough password' })).status === 201, 'sign-up works');
  await waitFor(1);
  ok(got.length === 1 && got[0].url === '/bottest:token/sendMessage' && got[0].body.chat_id === '1', 'a sign-up sends one message to the right bot and chat');
  ok(got[0]?.body.text === `🆕 New sign-up: a***@example.com`, 'the sign-up alert shows a masked email');

  await owner.req('PUT', '/api/profile', { doc: doc('alert-' + tag, 'Alert Cuts') });
  ok((await owner.req('POST', '/api/logout', {})).status === 204, 'owner signs out');
  ok((await owner.req('POST', '/api/login', { email, password: 'a long enough password' })).status === 200, 'owner signs in');
  await waitFor(2);
  ok(got[1]?.body.text === '🔑 Sign-in: a***@example.com', 'a sign-in sends a masked alert');

  const before = got.length;
  ok((await anon.req('POST', '/api/login', { email, password: 'wrong password here' })).status === 401, 'a wrong password is refused');
  await new Promise(r => setTimeout(r, 500));
  ok(got.length === before, 'a failed sign-in sends no alert');

  ok((await admin.req('POST', '/api/admin/login', { code: ADMIN })).status === 200, 'admin signs in');
  const users = (await admin.req('GET', '/api/admin/data')).data.users, me = users.find(u => u.email === email);
  const p = await admin.req('POST', `/api/admin/users/${me.id}/payments`, { amount: 7, method: 'bank' });
  ok(p.status === 201, 'admin records a payment');
  await waitFor(4);
  ok(got[2]?.body.text === '🔐 Admin panel sign-in', 'an admin sign-in sends an alert');
  ok(/^💷 Payment recorded: £7 · bank transfer · Alert Cuts · paid to \d{1,2} [A-Z][a-z]{2}$/.test(got[3]?.body.text || ''), `the payment alert shows amount, method, business and date (${got[3]?.body.text})`);

  const everything = JSON.stringify(got);
  ok(!everything.includes(email) && !everything.includes(`alert-${tag}`), 'the full email address is never sent');
  ok(!/07123|Haircut|password/i.test(everything), 'no phone number, service or password is ever sent');
  ok(got.every(g => g.body.disable_web_page_preview === true && g.body.text.length < 200), 'alerts are short plain text');

  /* sending must never break the app: with the fake Telegram switched off, sign-in still works */
  fake.close(); await new Promise(r => setTimeout(r, 200));
  const t0 = Date.now(); const s2 = await new Client().req('POST', '/api/login', { email, password: 'a long enough password' });
  ok(s2.status === 200 && Date.now() - t0 < 3500, `sign-in still works fast when Telegram is unreachable (${Date.now() - t0} ms)`);

  execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl"', { stdio: 'ignore' });
  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} Telegram alert checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
