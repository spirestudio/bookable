/* "Could this lose a business money?" checks, against a locally running Worker.
   Clock changes (BST/GMT), the calendar feed, many people booking the same slot at once, and bookings surviving edits.
   Start: npx wrangler dev --local --port 8787   Run: node tests/safety.test.mjs */
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m, why) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m + (!c && why ? '  -> ' + why : '')); };
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl"', { stdio: 'ignore' });

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, headers = {}) {
    const h = { 'content-type': 'application/json', ...headers }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data, text };
  }
}
const day = (on, start = '09:00', end = '17:30') => ({ on, start, end });
const allDays = on => ({ 0: day(on), 1: day(on), 2: day(on), 3: day(on), 4: day(on), 5: day(on), 6: day(on) });
const doc = (slug, hours) => ({ trade: 'barber', biz: { name: 'Safety Cuts', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }, { id: 'old', name: 'Old service', mins: 30, price: 10 }], hours: hours || allDays(true), timeOff: [], blocks: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const unfold = s => s.replace(/\r\n[ \t]/g, '');

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), anon = new Client(), slug = 'sf-' + tag;
  await A.req('POST', '/api/signup', { email: `sf-${tag}@example.com`, password: 'a long enough password' });
  ok((await A.req('PUT', '/api/profile', { doc: doc(slug) })).status === 200, 'owner and business set up');

  console.log('-- clock changes: a 10:00 appointment must land at the right time in every calendar');
  const cases = [['2026-10-24', '10:00', '20261024T090000Z', 'the day before the clocks go back (BST)'], ['2026-10-25', '10:00', '20261025T100000Z', 'the day the clocks go back (GMT)'], ['2026-12-15', '10:00', '20261215T100000Z', 'winter (GMT)'], ['2027-03-27', '10:00', '20270327T100000Z', 'the day before the clocks go forward (GMT)'], ['2027-03-28', '10:00', '20270328T090000Z', 'the day the clocks go forward (BST)'], ['2027-07-10', '15:30', '20270710T143000Z', 'summer afternoon (BST)']];
  for (const [d, t, z] of cases) { const r = await A.req('POST', '/api/bookings', { svcId: 'cut', date: d, time: t, name: 'Clock ' + d, phone: '07700 900100' }); ok(r.status === 201, `owner can add a booking on ${d}`, 'status ' + r.status); }
  const tok = (await A.req('POST', '/api/calendar/token', {})).data.token;
  const ics = unfold(await (await fetch(`${BASE}/api/cal/${tok}.ics`)).text());
  for (const [d, t, z, label] of cases) ok(ics.includes('DTSTART:' + z), `calendar feed: ${d} ${t} is ${z} (${label})`);
  const me = await A.req('GET', '/api/me');
  ok(me.data.bookings.filter(b => b.name.startsWith('Clock')).every(b => /^\d\d:\d\d$/.test(b.time)), 'owner app gets plain local times back');
  ok(me.data.bookings.some(b => b.date === '2026-10-25' && b.time === '10:00'), 'a booking on the clock-change day keeps its time');

  console.log('-- many people booking the same slot at the same moment');
  const date = addDays(today(), 3);
  const results = await Promise.all(Array.from({ length: 12 }, (_, i) => new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'Racer ' + i, phone: '07700 90' + String(2000 + i) })));
  const wins = results.filter(r => r.status === 201).length, taken = results.filter(r => r.status === 409).length;
  ok(wins === 1 && wins + taken >= 11, 'exactly one of 12 simultaneous bookings gets the slot, the rest are told it is taken', `wins ${wins}, taken ${taken}, statuses ${results.map(r => r.status).join(',')}`);
  const rows = (await A.req('GET', '/api/me')).data.bookings.filter(b => b.date === date && b.time === '11:00' && b.status === 'booked');
  ok(rows.length === 1, 'the owner sees one booking for that slot, never two', 'count ' + rows.length);
  const overlap = await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'Late', phone: '07700 902222' });
  ok(overlap.status === 409, 'the slot stays taken afterwards');
  const wid = rows[0].id;
  ok((await A.req('PATCH', '/api/bookings/' + wid, { status: 'cancelled' })).status === 200, 'owner cancels it');
  ok((await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date, time: '11:00', name: 'After cancel', phone: '07700 903333' })).status === 201, 'and the slot can be booked again straight away');

  console.log('-- bookings survive the owner editing their business');
  const keep = await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'old', date: addDays(today(), 5), time: '14:00', name: 'Keep Me', phone: '07700 904444' });
  ok(keep.status === 201, 'a booking for a service is made');
  const edited = doc(slug, allDays(false)); edited.services = [{ id: 'cut', name: 'Haircut', mins: 30, price: 25 }];
  ok((await A.req('PUT', '/api/profile', { doc: edited })).status === 200, 'owner removes that service, raises prices and closes every day');
  const after = (await A.req('GET', '/api/me')).data.bookings;
  const kept = after.find(b => b.name === 'Keep Me');
  ok(kept && kept.status === 'booked' && kept.svcName === 'Old service' && kept.price === 10, 'the booking is still there with its original service name and price');
  ok(after.filter(b => b.name.startsWith('Clock')).length === 6, 'the other bookings are all still there');
  const pub = await anon.req('GET', '/api/public/' + slug);
  ok(pub.data.busy.some(b => b.date === addDays(today(), 5) && b.time === '14:00'), 'and that time still counts as busy for new clients');
  ok((await new Client().req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date: addDays(today(), 6), time: '10:00', name: 'Closed day', phone: '07700 905555' })).status === 409, 'a day the owner has closed cannot be booked');

  console.log('-- a signed-in owner cannot be locked out by someone else');
  const B = new Client(); await B.req('POST', '/api/signup', { email: `sf2-${tag}@example.com`, password: 'a long enough password' });
  ok((await B.req('PUT', '/api/profile', { doc: doc(slug) })).status === 409, 'nobody can take another business\'s booking link name');
  ok((await A.req('GET', '/api/me')).data.doc.biz.slug === slug, 'the original business keeps its link');

  await B.req('DELETE', '/api/account', {}); await A.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} safety check(s) FAILED` : '\nall safety checks passed');
  process.exit(fails ? 1 : 0);
})();
