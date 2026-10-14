/* Security and paywall checks against a locally running Worker (needs ADMIN_CODE in .dev.vars).
   Start: npx wrangler dev --local --port 8787   Run: node tests/security.test.mjs */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const devVars = fs.existsSync('.dev.vars') ? fs.readFileSync('.dev.vars', 'utf8') : '';
const CODE = (devVars.match(/^ADMIN_CODE=(.+)$/m) || [])[1]?.trim();
if (!CODE) { console.log('Add ADMIN_CODE=... to .dev.vars first.'); process.exit(1); }
const sql = q => execSync(`npx --yes wrangler@4 d1 execute pencil-db --local --json --command "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
sql('DELETE FROM rl;');

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { 'content-type': 'application/json' }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data, text };
  }
}
const day = on => ({ on, start: '09:00', end: '17:30' });
const doc = slug => ({ trade: 'barber', biz: { name: 'Sec Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day(true), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) }, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), A2 = new Client(), anon = new Client(), admin = new Client();
  const email = `sec-${tag}@example.com`, pw = 'a long enough password';

  /* weak passwords */
  for (const [p, why] of [['password123', 'a common password'], ['aaaaaaaaaa', 'one repeated character'], [`sec-${tag}-pass`, 'a password containing the email name']]) {
    const r = await anon.req('POST', '/api/signup', { email, password: p });
    ok(r.status === 422 && r.data.error === 'weak_password', `sign-up refuses ${why}`);
  }
  ok((await A.req('POST', '/api/signup', { email, password: pw })).status === 201, 'a decent password is accepted');
  await A.req('PUT', '/api/profile', { doc: doc('sec-' + tag) });

  /* sign out of every device */
  ok((await A2.req('POST', '/api/login', { email, password: pw })).status === 200, 'the owner signs in on a second device');
  ok((await anon.req('POST', '/api/logout-all', {})).status === 401, 'sign-out-everywhere needs a sign-in');
  ok((await A.req('POST', '/api/logout-all', {})).status === 204, 'sign-out-everywhere works');
  ok((await A2.req('GET', '/api/me')).data.email === null, 'the other device is signed out too');
  ok((await A.req('POST', '/api/login', { email, password: pw })).status === 200, 'signing back in still works');

  /* a client cannot hold more than 3 upcoming appointments with one business */
  const date = addDays(today(), 4), slug = 'sec-' + tag;
  const book = time => anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time, name: 'Kim', phone: '07700 900333' });
  const r1 = await book('09:00'), r2 = await book('10:00'), r3 = await book('11:00'), r4 = await book('12:00');
  ok([r1, r2, r3].every(r => r.status === 201), 'three bookings from one phone are fine');
  ok(r4.status === 409 && r4.data.error === 'too_many_bookings', 'a fourth upcoming booking is refused');

  /* the paywall is off until it is switched on */
  const created = Date.now() - 20 * 864e5;
  sql(`UPDATE users SET created = ${created} WHERE email = '${email}'`);
  let me = await A.req('GET', '/api/me');
  ok(me.data.billing.status === 'overdue' && me.data.billing.enforce === false, 'an old unpaid account is overdue but the paywall is off');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug) })).status === 200, 'so the owner can still save changes');
  ok((await admin.req('POST', '/api/admin/login', { code: CODE })).status === 200, 'admin signs in');
  const cur = (await admin.req('GET', '/api/admin/data')).data.settings;
  ok((await admin.req('PUT', '/api/admin/settings', { payInfo: cur.payInfo, chaseTrial: cur.chaseTrial, chaseOverdue: cur.chaseOverdue, paywall: 'on' })).status === 200, 'admin switches the paywall on');
  me = await A.req('GET', '/api/me');
  ok(me.data.billing.enforce === true, 'the app is told to show the payment screen');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug) })).status === 402, 'and the server refuses changes from an unpaid owner');
  ok((await anon.req('GET', '/api/public/' + slug)).status === 200, 'clients can still see the booking page');
  ok((await admin.req('PUT', '/api/admin/settings', { payInfo: cur.payInfo, chaseTrial: cur.chaseTrial, chaseOverdue: cur.chaseOverdue, paywall: 'maybe' })).status === 422, 'the paywall switch only takes on or off');
  await admin.req('PUT', '/api/admin/settings', { payInfo: cur.payInfo, chaseTrial: cur.chaseTrial, chaseOverdue: cur.chaseOverdue, paywall: 'off' });
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug) })).status === 200, 'switching it off lets the owner save again');

  /* headers and files */
  const h = fs.readFileSync('dist/_headers', 'utf8');
  ok(/Strict-Transport-Security: max-age=31536000/.test(h), 'HSTS is set');
  ok(fs.existsSync('dist/.well-known/security.txt') && /Contact:/.test(fs.readFileSync('dist/.well-known/security.txt', 'utf8')), 'security.txt is published');

  await A.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} security check(s) FAILED` : '\nall security checks passed');
  process.exit(fails ? 1 : 0);
})();
