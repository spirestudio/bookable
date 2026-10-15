/* Smoke test for the LIVE site. Creates a throwaway account, books a time, then deletes everything it made.
   Run: node tests/smoke.mjs   (BASE=https://... to point somewhere else) */
const BASE = process.env.BASE || 'https://mybookable.co.uk';
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
let cookie = '';
const call = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: body && JSON.stringify(body) });
  for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; cookie = /=$/.test(kv) ? '' : kv; }
  const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null, headers: r.headers };
};
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = new Date().toISOString().slice(0, 10);
let date = addDays(today, 9); while (new Date(date + 'T00:00:00Z').getUTCDay() !== 3) date = addDays(date, 1);

const email = `smoke${Date.now()}@example.com`, slug = 'smoke-' + Math.random().toString(36).slice(2, 8);
let r = await call('POST', '/api/signup', { email, password: 'a long enough password' });
ok(r.status === 201, 'sign up on the live site');
ok(/HttpOnly/i.test(r.headers.getSetCookie().join(';')) && /Secure/i.test(r.headers.getSetCookie().join(';')), 'session cookie is HttpOnly and Secure over https');
const hours = {}; for (let i = 0; i < 7; i++) hours[i] = { on: true, start: '09:00', end: '17:00' };
r = await call('PUT', '/api/profile', { doc: { trade: 'barber', biz: { name: 'Smoke Test', slug, phone: '07123 456789', town: 'Lichfield', intro: '' }, services: [{ id: 'a', name: 'Cut', mins: 30, price: 10 }], hours, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}' } } });
ok(r.status === 200, 'save a business profile');
const anon = await fetch(`${BASE}/api/public/${slug}`); ok(anon.status === 200, 'the public booking page loads with no account');
cookie = cookie; // still the owner
const book = body => fetch(`${BASE}/api/public/${slug}/book`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ svcId: 'a', date, time: '10:00', name: 'Smoke Client', phone: '07700 900123', ...body }) });
ok((await book({})).status === 201, 'a client books a time (no account, no cookie)');
ok((await book({})).status === 409, 'the same time is refused the second time');
r = await call('GET', '/api/me'); ok(r.data.bookings.length === 1 && r.data.bookings[0].name === 'Smoke Client', 'the owner sees the booking');
r = await call('DELETE', '/api/account'); ok(r.status === 204, 'the throwaway account is deleted');
ok((await fetch(`${BASE}/api/public/${slug}`)).status === 404, 'and its public page is gone');
const h = (await fetch(BASE + '/app/')).headers; ok(/default-src 'self'/.test(h.get('content-security-policy') || '') && h.get('x-frame-options') === 'DENY', 'security headers are on the app page');
console.log(fails ? `\n${fails} FAILED` : '\nlive site smoke test passed');
process.exit(fails ? 1 : 0);
