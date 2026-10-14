/* Deposits against a locally running Worker.
   Start: npx wrangler dev --local --port 8787   (apply migrations first: npx wrangler d1 migrations apply pencil-db --local)
   Run: node tests/deposits.test.mjs */
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const sql = q => JSON.parse(execSync(`npx --yes wrangler@4 d1 execute pencil-db --local --json --command "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
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
const doc = (slug, info) => ({ trade: 'barber', biz: { name: 'Dep Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.', depositInfo: info, depositHold: 2 }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18, deposit: 5 }, { id: 'big', name: 'Big', mins: 30, price: 10, deposit: 50 }], hours: { 0: day(true), 1: day(true), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(true) }, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), anon = new Client(), slug = 'dep-' + tag, date = addDays(today(), 5);
  ok((await A.req('POST', '/api/signup', { email: `dep-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner signs up');
  let r = await A.req('PUT', '/api/profile', { doc: doc(slug, '') }); ok(r.status === 200, 'profile saved');

  r = await anon.req('GET', '/api/public/' + slug);
  ok(r.data.doc.services.every(s => s.deposit === 0), 'no payment details set: deposits are off on the public page');
  r = await anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '10:00', name: 'Sam', phone: '07700 900111' });
  ok(r.status === 201 && !r.data.booking.deposit, 'no payment details: booking is confirmed straight away');

  r = await A.req('PUT', '/api/profile', { doc: doc(slug, 'Bank transfer to 12-34-56 / 12345678') });
  ok(r.status === 200, 'payment details saved');
  r = await anon.req('GET', '/api/public/' + slug);
  ok(r.data.doc.services.find(s => s.id === 'cut').deposit === 5, 'the public page shows the deposit');
  ok(!r.text.includes('12345678') && !('depositInfo' in r.data.doc.biz), 'the bank details are not on the public page');
  ok((await A.req('GET', '/api/me')).data.doc.services.find(s => s.id === 'big').deposit === 10, 'a deposit can never be bigger than the price');

  r = await anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'Alex', phone: '07700 900222' });
  const bk = r.data.booking;
  ok(r.status === 201 && bk.deposit === 5 && bk.depositInfo.includes('12345678') && bk.depositDue > Date.now(), 'booking returns the deposit, the payment details and the deadline');
  r = await anon.req('GET', '/api/public/' + slug);
  ok(r.data.busy.some(b => b.date === date && b.time === '11:00'), 'the slot is held while the deposit is pending');
  r = await A.req('GET', '/api/me');
  const mine = r.data.bookings.find(b => b.id === bk.id);
  ok(mine && mine.deposit === 5 && !mine.depositPaid && mine.status === 'booked', 'the owner sees the pending deposit');

  /* unpaid and past its deadline: released */
  sql(`UPDATE bookings SET deposit_due = ${Date.now() - 1000} WHERE id = '${bk.id}'`);
  r = await anon.req('GET', '/api/public/' + slug);
  ok(!r.data.busy.some(b => b.date === date && b.time === '11:00'), 'an unpaid deposit past its deadline frees the slot');
  ok((await A.req('GET', '/api/me')).data.bookings.find(b => b.id === bk.id).status === 'cancelled', 'and the booking shows as cancelled to the owner');

  /* paid: never released */
  r = await anon.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'Alex', phone: '07700 900222' });
  ok(r.status === 201, 'the freed slot can be booked again');
  const b2 = r.data.booking;
  ok((await anon.req('PATCH', '/api/bookings/' + b2.id, { depositPaid: true })).status === 401, 'only the owner can mark a deposit as received');
  ok((await A.req('PATCH', '/api/bookings/' + b2.id, { depositPaid: 'yes' })).status === 422, 'depositPaid must be true or false');
  ok((await A.req('PATCH', '/api/bookings/' + b2.id, { depositPaid: true })).status === 200, 'the owner marks the deposit as received');
  sql(`UPDATE bookings SET deposit_due = ${Date.now() - 1000} WHERE id = '${b2.id}'`);
  r = await A.req('GET', '/api/me');
  ok(r.data.bookings.find(b => b.id === b2.id).status === 'booked' && r.data.bookings.find(b => b.id === b2.id).depositPaid, 'a paid deposit is never released');

  /* tidy up */
  await A.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} deposit check(s) FAILED` : '\nall deposit checks passed');
  process.exit(fails ? 1 : 0);
})();
