/* Owner booking alerts on Telegram: link, webhook, alert on a booking, stop. Fake Telegram on port 9876.
   .dev.vars needs: TELEGRAM_BOT_TOKEN, TELEGRAM_API=http://localhost:9876, TELEGRAM_WEBHOOK_SECRET=testhook
   Start: npx wrangler dev --local --port 8787   Run: node tests/telegram-owner.test.mjs */
import http from 'node:http';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl"', { stdio: 'ignore' });
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
const doc = slug => ({ trade: 'barber', biz: { name: 'Alert Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day, 1: day, 2: day, 3: day, 4: day, 5: day, 6: day }, timeOff: [], blocks: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}' } });
const addDays = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const HOOK = { 'x-telegram-bot-api-secret-token': 'testhook' };

const tag = Math.random().toString(36).slice(2, 6), A = new Client(), anon = new Client(), slug = 'tg-' + tag;
await A.req('POST', '/api/signup', { email: `tg-${tag}@example.com`, password: 'a long enough password' });
await A.req('PUT', '/api/profile', { doc: doc(slug) });
ok((await A.req('GET', '/api/me')).data.telegram === false, 'telegram starts off');

const link = await A.req('POST', '/api/telegram/link', {});
ok(link.status === 200 && /^https:\/\/t\.me\/\w+\?start=[\w-]{16,}$/.test(link.data.url), 'owner gets a Telegram link');
const code = link.data.url.split('start=')[1];

const noSecret = await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 777, type: 'private' }, text: '/start ' + code } });
ok(noSecret.status === 403, 'the webhook refuses calls without the secret');
ok((await A.req('GET', '/api/me')).data.telegram === false, 'and nothing got connected');

got.length = 0;
const hook = await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 777, type: 'private' }, text: '/start ' + code } }, HOOK);
ok(hook.status === 200, 'webhook accepts /start with the secret');
await wait(1);
ok(got.length === 1 && got[0].chat_id === 777 && /Connected/.test(got[0].text), 'the bot replies "Connected" to that chat');
ok((await A.req('GET', '/api/me')).data.telegram === true, 'the owner now shows as connected');
const again = await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 888, type: 'private' }, text: '/start ' + code } }, HOOK);
await wait(2);
ok(again.status === 200 && /expired/.test(got[got.length - 1].text), 'a used link cannot be used again');

got.length = 0;
const bk = await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date: addDays(3), time: '11:00', name: 'Sam Client', phone: '07700 900321' });
ok(bk.status === 201, 'a client books through the link');
await wait(1);
ok(got.length === 1 && String(got[0].chat_id) === "777" && /Sam Client/.test(got[0].text) && /Haircut/.test(got[0].text) && /11:00/.test(got[0].text), 'the owner gets an alert with name, service and time');
ok(!/07700|900321/.test(got[0].text), 'the client phone number is not sent to Telegram');

got.length = 0;
await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 777, type: 'private' }, text: '/stop' } }, HOOK);
await wait(1);
ok((await A.req('GET', '/api/me')).data.telegram === false, '/stop switches alerts off');
got.length = 0;
await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date: addDays(3), time: '12:00', name: 'Quiet One', phone: '07700 900322' });
await new Promise(r => setTimeout(r, 600));
ok(got.length === 0, 'no alert is sent after switching off');

const l2 = await A.req('POST', '/api/telegram/link', {}); const c2 = l2.data.url.split('start=')[1];
await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: 777, type: 'private' }, text: '/start ' + c2 } }, HOOK);
await wait(1);
ok((await A.req('GET', '/api/me')).data.telegram === true, 'reconnecting works');
await A.req('POST', '/api/telegram/unlink', {});
ok((await A.req('GET', '/api/me')).data.telegram === false, 'the Turn off button works');
ok((await anon.req('POST', '/api/telegram/link', {})).status === 401, 'signed-out people cannot make links');
const grp = await anon.req('POST', '/api/telegram/webhook', { message: { chat: { id: -5, type: 'group' }, text: '/start ' + c2 } }, HOOK);
ok(grp.status === 200, 'group chats are ignored');

await A.req('DELETE', '/api/account', {});
fake.close();
console.log(fails ? `\n${fails} Telegram owner check(s) FAILED` : '\nall Telegram owner checks passed');
process.exit(fails ? 1 : 0);
