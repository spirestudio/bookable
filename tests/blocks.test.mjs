/* Blocked times (part-day unavailability) against a locally running Worker.
   Start: npx wrangler dev --local --port 8787   Run: node tests/blocks.test.mjs */
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
const doc = (slug, blocks) => ({ trade: 'barber', biz: { name: 'Block Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day(true), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) }, timeOff: [], blocks, rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), anon = new Client(), slug = 'blk-' + tag;
  const d1 = addDays(today(), 4), d2 = addDays(d1, 7), d3 = addDays(d1, 1);
  const blocks = [{ id: 'b1', date: d1, start: '12:00', end: '13:00', label: 'Dentist', weekly: false }, { id: 'b2', date: d1, start: '15:00', end: '16:00', label: 'Lunch club', weekly: true }];
  ok((await A.req('POST', '/api/signup', { email: `blk-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner signs up');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug, [{ id: 'x', date: d1, start: '13:00', end: '12:00', label: '', weekly: false }]) })).status === 422, 'a block that ends before it starts is refused');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug, [{ id: 'x', date: 'nope', start: '12:00', end: '13:00' }]) })).status === 422, 'a block with a bad date is refused');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug, blocks) })).status === 200, 'blocked times save');
  ok((await A.req('GET', '/api/me')).data.doc.blocks.length === 2, 'and come back with the account');

  const pub = await anon.req('GET', '/api/public/' + slug);
  ok(pub.data.doc.blocks.length === 2 && !pub.text.includes('Dentist') && !pub.text.includes('Lunch club'), 'the public page gets the times but never the reasons');
  const book = (date, time) => anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time, name: 'Kim', phone: '07700 900' + String(Math.floor(Math.random() * 900) + 100) });
  ok((await book(d1, '12:00')).status === 409, 'a booking inside a blocked time is refused');
  ok((await book(d1, '12:30')).status === 409, 'and one that starts inside it');
  ok((await book(d1, '11:30')).status === 201, 'a slot that ends exactly when the block starts is fine');
  ok((await book(d1, '13:00')).status === 201, 'a slot that starts exactly when the block ends is fine');
  ok((await book(d3, '12:00')).status === 201, 'the same time on another day is fine');
  ok((await book(d2, '15:00')).status === 409, 'a weekly block also blocks the same weekday a week later');
  ok((await book(d2, '12:00')).status === 201, 'but the one-off block does not repeat');

  await A.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} blocked-time check(s) FAILED` : '\nall blocked-time checks passed');
  process.exit(fails ? 1 : 0);
})();
