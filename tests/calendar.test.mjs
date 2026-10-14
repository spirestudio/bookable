/* Calendar feed (private .ics link) against a locally running Worker.
   Start: npx wrangler dev --local --port 8787   (apply migrations first: npx wrangler d1 migrations apply pencil-db --local)
   Run: node tests/calendar.test.mjs */
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };
const sql = q => JSON.parse(execSync(`npx --yes wrangler@4 d1 execute pencil-db --local --json --command "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
sql('DELETE FROM rl; DELETE FROM bookings; DELETE FROM profiles; DELETE FROM sessions; DELETE FROM users; DELETE FROM billing; DELETE FROM payments;');

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { 'content-type': 'application/json' }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data, text, headers: r.headers };
  }
}
const day = on => ({ on, start: '09:00', end: '17:30' });
const doc = (slug, name) => ({ trade: 'barber', biz: { name, slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' }, services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }], hours: { 0: day(false), 1: day(false), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(false) }, timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' } });
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const uid = n => `${n}${n}${n}${n}${n}${n}${n}${n}-1111-4111-8111-111111111111`;

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), B = new Client(), N = new Client(), anon = new Client();
  ok((await A.req('POST', '/api/signup', { email: `cal-a-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner A signs up');
  ok((await B.req('POST', '/api/signup', { email: `cal-b-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner B signs up');
  ok((await N.req('POST', '/api/signup', { email: `cal-n-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'a third owner signs up but sets up no business');
  await A.req('PUT', '/api/profile', { doc: doc('cal-a-' + tag, 'Alpha Cuts') }); await B.req('PUT', '/api/profile', { doc: doc('cal-b-' + tag, 'Beta Cuts') });

  /* ---- the secret link ---- */
  ok((await anon.req('POST', '/api/calendar/token', {})).status === 401, 'asking for a calendar link needs a sign-in');
  ok((await N.req('POST', '/api/calendar/token', {})).status === 409, 'an owner with no business page gets no link');
  let r = await A.req('POST', '/api/calendar/token', {}); const tokenA = r.data.token;
  ok(r.status === 200 && /^[A-Za-z0-9_-]{32}$/.test(tokenA), 'the link has a long random secret');
  ok((await A.req('POST', '/api/calendar/token', {})).data.token === tokenA, 'asking again returns the same link');
  const tokenB = (await B.req('POST', '/api/calendar/token', {})).data.token;
  ok(tokenB !== tokenA, 'each business has its own secret');

  /* ---- bookings in the feed ---- */
  const ids = { winter: uid(1), summer: uid(2), cancelled: uid(3), sample: uid(4), recent: uid(5), old: uid(6), long: uid(7), other: uid(8) };
  const mine = sql(`SELECT user_id, slug FROM profiles WHERE slug = 'cal-a-${tag}'`)[0].user_id, theirs = sql(`SELECT user_id FROM profiles WHERE slug = 'cal-b-${tag}'`)[0].user_id;
  const ins = (id, uidv, date, start, mins, svc, price, name, phone, note, status, source) => sql(`INSERT INTO bookings (id, user_id, date, start, mins, svc_id, svc_name, price, name, phone, note, status, source, created) VALUES ('${id}', '${uidv}', '${date}', ${start}, ${mins}, 'cut', '${svc}', ${price}, '${name}', '${phone}', '${note}', '${status}', '${source}', ${Date.now()})`);
  const longNote = 'Please use the side door at the back of the building near the green gate, and ring twice because the bell is quiet, thank you very much';
  ins(ids.winter, mine, '2026-12-15', 600, 45, 'Skin fade', 22, 'Jake, Jr', '07700 900111', 'keep top; long', 'booked', 'link');
  ins(ids.summer, mine, '2027-07-15', 600, 30, 'Haircut', 18, 'Sam', '07700 900222', '', 'booked', 'link');
  ins(ids.cancelled, mine, '2026-12-16', 600, 30, 'Haircut', 18, 'Cancelled Carl', '07700 900333', '', 'cancelled', 'link');
  ins(ids.sample, mine, '2026-12-17', 600, 30, 'Haircut', 18, 'Sample Sally', '07700 900444', '', 'booked', 'sample');
  ins(ids.recent, mine, addDays(today(), -10), 600, 30, 'Haircut', 18, 'Recent Rob', '07700 900555', '', 'done', 'link');
  ins(ids.old, mine, addDays(today(), -40), 600, 30, 'Haircut', 18, 'Ancient Alf', '07700 900666', '', 'done', 'link');
  ins(ids.long, mine, '2026-12-18', 720, 30, 'Haircut', 18, 'Long Lucy', '07700 900777', longNote, 'booked', 'link');
  ins(ids.other, theirs, '2026-12-15', 600, 30, 'Haircut', 18, 'Zed Zebra', '07700 900888', '', 'booked', 'link');

  r = await anon.req('GET', `/api/cal/${tokenA}.ics`);
  const ics = r.text;
  ok(r.status === 200 && /^text\/calendar/.test(r.headers.get('content-type')), 'the feed is served as a calendar file');
  ok(r.headers.get('x-robots-tag') === 'noindex' && /private/.test(r.headers.get('cache-control')), 'it is private and hidden from search engines');
  ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n') && !/[^\r]\n/.test(ics), 'it is a valid calendar file with proper line endings');
  ok((ics.match(/BEGIN:VEVENT/g) || []).length === 4, 'four events: the winter, summer, recent and long bookings');
  for (const k of ['winter', 'summer', 'recent', 'long']) ok(ics.includes(`UID:${ids[k]}@pencil`), `${k} booking is in the feed`);
  for (const k of ['cancelled', 'sample', 'old', 'other']) ok(!ics.includes(ids[k]), `${k} booking is NOT in the feed`);
  ok(!/Zed|Cancelled Carl|Sample Sally|Ancient Alf/.test(ics), 'nobody else’s clients, cancelled, sample or very old bookings appear');
  ok(ics.includes('DTSTART:20261215T100000Z') && ics.includes('DTEND:20261215T104500Z'), 'a December (GMT) 10:00 booking is 10:00 UTC and lasts 45 minutes');
  ok(ics.includes('DTSTART:20270715T090000Z'), 'a July (BST) 10:00 booking is 09:00 UTC');
  ok(ics.includes('SUMMARY:Skin fade: Jake\\, Jr'), 'commas are escaped in titles');
  ok(ics.includes('Note: keep top\\; long'), 'semicolons are escaped in notes');
  ok(ics.includes('Phone: 07700 900111') && ics.includes('Price: £22'), 'the phone number and price are in the description');
  ok(ics.includes('TRIGGER:-PT60M') && (ics.match(/BEGIN:VALARM/g) || []).length === 4, 'every event reminds the owner an hour before');
  ok(ics.includes('X-WR-CALNAME:Bookable: Alpha Cuts') && ics.includes('REFRESH-INTERVAL'), 'the calendar is named after the business and asks to refresh hourly');
  const lines = ics.split('\r\n');
  ok(lines.every(l => new TextEncoder().encode(l).length <= 75), 'no line is longer than 75 bytes');
  ok(ics.replace(/\r\n /g, '').includes('Note: ' + longNote.replace(/,/g, '\\,')), 'a long note is folded and unfolds back to the original (commas escaped)');

  /* ---- other owner, wrong tokens ---- */
  const icsB = (await anon.req('GET', `/api/cal/${tokenB}.ics`)).text;
  ok(icsB.includes(ids.other) && icsB.includes('Zed Zebra') && !icsB.includes(ids.winter) && !icsB.includes('Jake'), 'owner B’s link shows only owner B’s own bookings')
  ok((await anon.req('GET', '/api/cal/' + 'x'.repeat(32) + '.ics')).status === 404, 'a wrong secret is a 404');
  r = await anon.req('GET', '/api/cal/short.ics'); ok(r.status !== 200 && !r.text.includes('VCALENDAR'), 'a short secret is refused');

  /* ---- replacing the link ---- */
  r = await A.req('POST', '/api/calendar/token', { reset: true }); const newToken = r.data.token;
  ok(r.status === 200 && newToken !== tokenA, 'a new link can be made');
  ok((await anon.req('GET', `/api/cal/${tokenA}.ics`)).status === 404, 'the old link stops working');
  ok((await anon.req('GET', `/api/cal/${newToken}.ics`)).status === 200, 'the new link works');

  /* ---- deleting the account removes the link ---- */
  ok((await A.req('DELETE', '/api/account')).status === 204, 'owner A deletes their account');
  ok((await anon.req('GET', `/api/cal/${newToken}.ics`)).status === 404, 'the calendar link dies with the account');

  /* ---- guessing is throttled (last: it blocks this machine for 10 minutes) ---- */
  let limited = 0; for (let i = 0; i < 40; i++) if ((await anon.req('GET', '/api/cal/' + String(i).padStart(32, 'g') + '.ics')).status === 429) limited++;
  ok(limited >= 1, 'repeated wrong guesses are rate limited');
  sql('DELETE FROM rl');
  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} calendar checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
