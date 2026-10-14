/* Customer accounts against a locally running Worker.
   Start: npx wrangler dev --local --port 8787   (apply migrations first)   Run: node tests/clients.test.mjs */
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl"', { stdio: 'ignore' });

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
const doc = slug => ({ trade: 'barber', biz: { name: 'Cust Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day(true), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) }, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), owner = new Client(), C = new Client(), C2 = new Client(), D = new Client(), anon = new Client();
  const slug = 'cust-' + tag, email = `cust-${tag}@example.com`, pw = 'a long enough password', date = addDays(today(), 4);
  ok((await owner.req('POST', '/api/signup', { email: `own-${tag}@example.com`, password: pw })).status === 201, 'an owner signs up');
  await owner.req('PUT', '/api/profile', { doc: doc(slug) });

  /* sign up and in */
  ok((await anon.req('POST', '/api/client/signup', { email, password: 'password123', name: 'Kim Lee' })).data?.error === 'weak_password', 'a weak password is refused');
  ok((await anon.req('POST', '/api/client/signup', { email: 'nope', password: pw, name: 'Kim' })).status === 422, 'a bad email is refused');
  ok((await anon.req('POST', '/api/client/signup', { email, password: pw, name: '' })).status === 422, 'a name is required');
  let r = await C.req('POST', '/api/client/signup', { email, password: pw, name: 'Kim Lee', phone: '07700 900444' });
  ok(r.status === 201 && r.data.name === 'Kim Lee', 'a customer creates an account');
  ok((await anon.req('POST', '/api/client/signup', { email, password: pw, name: 'Kim Lee' })).status === 409, 'the same email cannot sign up twice');
  ok((await C2.req('POST', '/api/client/login', { email, password: 'wrong password here' })).status === 401, 'a wrong password is refused');
  ok((await C2.req('POST', '/api/client/login', { email, password: pw })).status === 200, 'signing in works');
  ok((await anon.req('GET', '/api/client/me')).data.email === null, 'signed-out visitors see no account');
  r = await C.req('GET', '/api/client/me');
  ok(r.data.email === email && r.data.name === 'Kim Lee' && r.data.phone === '07700 900444' && r.data.bookings.length === 0, 'the account shows name, phone and no bookings');

  /* a customer account is not an owner account */
  ok((await C.req('GET', '/api/me')).data.email === null, 'a customer is not signed in as an owner');
  ok((await C.req('PUT', '/api/profile', { doc: doc('x-' + tag) })).status === 401, 'a customer cannot create or edit a business');
  ok((await C.req('GET', '/api/admin/data')).status === 401, 'a customer cannot open admin');
  ok((await owner.req('GET', '/api/client/me')).data.email === null, 'an owner is not a customer');
  ok((await owner.req('POST', '/api/login', { email, password: pw })).status === 401, 'a customer email cannot sign in as an owner');

  /* booking while signed in links to the account */
  r = await C.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '10:00', name: 'Kim Lee', phone: '07700 900444' });
  ok(r.status === 201, 'a signed-in customer books');
  const bid = r.data.booking.id;
  r = await anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'Guest', phone: '07700 900555' });
  ok(r.status === 201, 'guests can still book without an account');
  r = await C.req('GET', '/api/client/me');
  ok(r.data.bookings.length === 1 && r.data.bookings[0].id === bid && r.data.bookings[0].business === 'Cust Cuts' && r.data.bookings[0].slug === slug, 'only the customer’s own booking is listed, with the business name');
  ok(!r.text.includes('Guest') && !r.text.includes('900555'), 'other people’s bookings never appear');

  /* cancel */
  ok((await anon.req('POST', `/api/client/bookings/${bid}/cancel`, {})).status === 401, 'cancelling needs a sign-in');
  ok((await C2.req('POST', '/api/client/login', { email, password: pw })).status === 200 && (await new Client().req('POST', `/api/client/bookings/${bid}/cancel`, {})).status === 401, 'another visitor cannot cancel it');
  const other = new Client(); await other.req('POST', '/api/client/signup', { email: `other-${tag}@example.com`, password: pw, name: 'Other' });
  ok((await other.req('POST', `/api/client/bookings/${bid}/cancel`, {})).status === 404, 'another customer cannot cancel it');
  ok((await C.req('POST', `/api/client/bookings/${bid}/cancel`, {})).status === 200, 'the customer cancels their booking');
  ok((await C.req('GET', '/api/client/me')).data.bookings[0].status === 'cancelled', 'it shows as cancelled');
  ok(!(await anon.req('GET', '/api/public/' + slug)).data.busy.some(b => b.time === '10:00'), 'and the slot is free again');
  ok((await C.req('POST', `/api/client/bookings/${bid}/cancel`, {})).status === 404, 'it cannot be cancelled twice');

  /* sign out everywhere, delete */
  ok((await C.req('POST', '/api/client/logout-all', {})).status === 204, 'sign-out-everywhere works');
  ok((await C2.req('GET', '/api/client/me')).data.email === null, 'other devices are signed out');
  await D.req('POST', '/api/client/login', { email, password: pw });
  ok((await D.req('DELETE', '/api/client/account', {})).status === 204, 'a customer deletes their account');
  ok((await new Client().req('POST', '/api/client/login', { email, password: pw })).status === 401, 'the account is gone');
  ok((await owner.req('GET', '/api/me')).data.bookings.length === 2, 'the business keeps its booking records');

  await owner.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} customer-account check(s) FAILED` : '\nall customer-account checks passed');
  process.exit(fails ? 1 : 0);
})();
