/* API tests against a locally running Worker. Start it with: npx wrangler dev --local --port 8787
   Run: node tests/api.test.mjs   (it clears the LOCAL database first) */
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };

if (!process.env.NO_RESET) {
  const sql = ['rl', 'bookings', 'profiles', 'sessions', 'users'].map(t => `DELETE FROM ${t};`).join(' ');
  execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "' + sql + '"', { stdio: 'ignore' });
}

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body, { json = true, headers = {} } = {}) {
    const h = { ...headers }; if (json) h['content-type'] = 'application/json'; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data, headers: r.headers };
  }
}
const pad = n => String(n).padStart(2, '0');
const londonToday = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const nextTuesday = minAhead => { let d = addDays(londonToday(), minAhead); while (new Date(d + 'T00:00:00Z').getUTCDay() !== 2) d = addDays(d, 1); return d; };
const nextMonday = minAhead => { let d = addDays(londonToday(), minAhead); while (new Date(d + 'T00:00:00Z').getUTCDay() !== 1) d = addDays(d, 1); return d; };

const doc = (slug, extra = {}) => ({
  trade: 'barber', biz: { name: 'Sam Okafor', slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' },
  services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }, { id: 'fade', name: 'Skin fade', mins: 45, price: 22 }],
  hours: { 0: { on: false, start: '09:00', end: '17:00' }, 1: { on: false, start: '09:00', end: '17:00' }, 2: { on: true, start: '09:00', end: '17:30' }, 3: { on: true, start: '09:00', end: '17:30' }, 4: { on: true, start: '09:00', end: '17:30' }, 5: { on: true, start: '09:00', end: '17:30' }, 6: { on: true, start: '09:00', end: '17:00' } },
  timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 },
  reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' }, ...extra,
});
const person = { name: 'Test Client', phone: '07700 900555', note: 'Short back and sides' };

(async () => {
  const A = new Client(), B = new Client(), anon = new Client();
  let r; const slugA = 'sam-' + Math.random().toString(36).slice(2, 7);

  /* ---- accounts ---- */
  r = await anon.req('GET', '/api/me'); ok(r.status === 200 && r.data.email === null, 'signed-out /api/me is a calm 200 with no email');
  ok((await A.req('POST', '/api/signup', { email: 'nope', password: 'a long enough password' })).status === 422, 'signup rejects a bad email');
  ok((await A.req('POST', '/api/signup', { email: 'a@example.com', password: 'short' })).status === 422, 'signup rejects a short password');
  r = await A.req('POST', '/api/signup', { email: 'A@Example.com', password: 'a long enough password' });
  ok(r.status === 201 && r.data.email === 'a@example.com', 'signup works and lowercases the email');
  const sc = r.headers.getSetCookie().join(';'); ok(/HttpOnly/i.test(sc) && /SameSite=Lax/i.test(sc), 'session cookie is HttpOnly + SameSite');
  ok(!JSON.stringify(r.data).includes('hash'), 'signup response leaks nothing');
  ok((await new Client().req('POST', '/api/signup', { email: 'a@example.com', password: 'another long password' })).status === 409, 'duplicate email is 409');
  r = await A.req('GET', '/api/me'); ok(r.status === 200 && r.data.doc === null && r.data.bookings.length === 0, '/api/me for a new account: no profile, no bookings');

  /* ---- request safety ---- */
  ok((await A.req('POST', '/api/logout', undefined, { json: false })).status === 415, 'non-JSON POST is refused (CSRF guard)');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slugA) }, { headers: { origin: 'https://evil.example' } })).status === 403, 'cross-origin write is refused');

  /* ---- profile ---- */
  ok((await A.req('PUT', '/api/profile', { doc: doc('x') })).status === 422, 'short slug rejected');
  ok((await A.req('PUT', '/api/profile', { doc: doc('Bad Slug!') })).status === 422, 'slug with spaces rejected');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slugA, { services: [] }) })).status === 422, 'no services rejected');
  const badHours = doc(slugA); badHours.hours[2] = { on: true, start: '18:00', end: '09:00' };
  ok((await A.req('PUT', '/api/profile', { doc: badHours })).status === 422, 'closing before opening rejected');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slugA, { services: [{ id: 'cut', name: 'Haircut', mins: 0, price: 18 }] }) })).status === 422, 'zero-minute service rejected');
  r = await A.req('PUT', '/api/profile', { doc: doc(slugA) }); ok(r.status === 200 && typeof r.data.doc.created === 'number', 'profile saved and created timestamp set by the server');
  const created = r.data.doc.created;
  await new Promise(x => setTimeout(x, 20));
  r = await A.req('PUT', '/api/profile', { doc: doc(slugA, { created: 1 }) }); ok(r.data.doc.created === created, 'client cannot change the created timestamp');
  ok((await B.req('POST', '/api/signup', { email: 'b@example.com', password: 'a long enough password' })).status === 201, 'second account created');
  ok((await B.req('PUT', '/api/profile', { doc: doc(slugA) })).status === 409, 'taken booking link name is 409');
  const slugB = 'maya-' + Math.random().toString(36).slice(2, 7);
  ok((await B.req('PUT', '/api/profile', { doc: doc(slugB, { trade: 'nails' }) })).status === 200, 'second account profile saved');
  ok((await B.req('PUT', '/api/profile', { doc: doc(slugB, { trade: 'other' }) })).status === 422, 'trade "other" needs a description of the business');
  const other = doc(slugB, { trade: 'other' }); other.biz.tradeLabel = 'Personal trainer';
  ok((await B.req('PUT', '/api/profile', { doc: other })).status === 200, 'trade "other" with a description is saved');
  r = await anon.req('GET', `/api/public/${slugB}`); ok(r.data.doc.trade === 'other' && r.data.doc.biz.tradeLabel === 'Personal trainer', 'the public page carries the custom business type');
  const tooLong = doc(slugB, { trade: 'other' }); tooLong.biz.tradeLabel = 'x'.repeat(41);
  ok((await B.req('PUT', '/api/profile', { doc: tooLong })).status === 422, 'an over-long business type is refused');
  const stray = doc(slugB, { trade: 'nails' }); stray.biz.tradeLabel = 'ignored';
  r = await B.req('PUT', '/api/profile', { doc: stray }); ok(r.status === 200 && !('tradeLabel' in r.data.doc.biz), 'a business type label is dropped for the built-in trades');

  /* ---- public booking page ---- */
  r = await anon.req('GET', `/api/public/${slugA}`);
  ok(r.status === 200 && r.data.doc.biz.name === 'Sam Okafor' && Array.isArray(r.data.busy), 'public page loads without signing in');
  ok(!JSON.stringify(r.data).includes('a@example.com') && !('reminders' in r.data.doc), 'public page does not leak the email or private settings');
  ok((await anon.req('GET', '/api/public/does-not-exist')).status === 404, 'unknown booking link is 404');

  /* ---- booking page options: colour, question, message, descriptions, hidden services ---- */
  const custom = doc(slugA); custom.services[1].hidden = true; custom.services[0].desc = 'Includes a hot towel'; Object.assign(custom.biz, { accent: 'blue', noteLabel: "Your dog's name", noteRequired: true, confirmMessage: 'Please arrive 5 minutes early.' });
  r = await A.req('PUT', '/api/profile', { doc: custom }); ok(r.status === 200 && r.data.doc.biz.accent === 'blue' && r.data.doc.services[0].desc === 'Includes a hot towel', 'booking page options are saved');
  r = await anon.req('GET', `/api/public/${slugA}`); ok(r.data.doc.services.length === 1 && r.data.doc.services[0].desc === 'Includes a hot towel' && r.data.doc.biz.noteLabel === "Your dog's name" && r.data.doc.biz.confirmMessage.includes('5 minutes'), 'the public page shows the options and leaves out hidden services');
  const tue0 = nextTuesday(8), post = b => anon.req('POST', `/api/public/${slugA}/book`, { svcId: 'cut', date: tue0, time: '12:00', ...person, ...b });
  ok((await post({ svcId: 'fade' })).status === 422, 'a hidden service cannot be booked');
  r = await post({ note: '' }); ok(r.status === 422 && r.data.error === 'note_required', 'a required question must be answered');
  const badColour = doc(slugA); badColour.biz.accent = 'hotpink'; r = await A.req('PUT', '/api/profile', { doc: badColour }); ok(r.status === 200 && r.data.doc.biz.accent === 'sea', 'an unknown accent colour falls back to the default deep sea blue');
  await A.req('PUT', '/api/profile', { doc: doc(slugA) });

  const tue = nextTuesday(8), mon = nextMonday(8);
  const book = (body, c = anon, slug = slugA) => c.req('POST', `/api/public/${slug}/book`, { svcId: 'cut', date: tue, time: '10:00', ...person, ...body });
  r = await book({}); ok(r.status === 201 && r.data.booking.time === '10:00' && r.data.booking.svcName === 'Haircut', 'a client can book an open slot without an account');
  ok((await book({})).status === 409, 'same slot again is 409');
  ok((await book({ time: '10:15' })).status === 409, 'a start time that is not on the slot grid is refused');
  ok((await book({ svcId: 'fade', time: '09:30' })).status === 409, 'overlapping booking (45 min over a 30 min one) is refused');
  ok((await book({ time: '08:30' })).status === 409, 'before opening time is refused');
  ok((await book({ time: '17:30' })).status === 409, 'running past closing time is refused');
  ok((await book({ date: mon })).status === 409, 'a closed day is refused');
  ok((await book({ date: addDays(londonToday(), -1) })).status === 409, 'a past date is refused');
  ok((await book({ date: addDays(londonToday(), 60) })).status === 409, 'too far ahead is refused');
  ok((await book({ svcId: 'nope' })).status === 422, 'unknown service is 422');
  ok((await book({ phone: '123' })).status === 422, 'bad phone number is 422');
  ok((await book({ name: '' })).status === 422, 'empty name is 422');
  ok((await book({ date: '2026-02-30' })).status === 422, 'impossible date is 422');
  ok((await book({}, anon, 'nobody-here')).status === 404, 'booking on an unknown page is 404');
  r = await anon.req('GET', `/api/public/${slugA}`); ok(r.data.busy.some(b => b.date === tue && b.time === '10:00' && b.mins === 30) && !JSON.stringify(r.data.busy).includes('Test'), 'busy times are public but names are not');

  /* ---- double booking race ---- */
  const racers = await Promise.all(Array.from({ length: 10 }, (_, i) => new Client().req('POST', `/api/public/${slugA}/book`, { svcId: 'cut', date: tue, time: '14:00', name: 'Racer ' + i, phone: '07700 9005' + pad(i) })));
  const won = racers.filter(x => x.status === 201).length, lost = racers.filter(x => x.status === 409).length;
  ok(won === 1 && won + lost + racers.filter(x => x.status === 429).length === 10, `10 simultaneous bookings for one slot: ${won} won, ${lost} refused (expected exactly 1 winner)`);

  /* ---- the owner's view ---- */
  r = await A.req('GET', '/api/me'); const mine = r.data.bookings.find(b => b.time === '10:00' && b.date === tue);
  ok(mine && mine.name === 'Test Client' && mine.phone === '07700 900555' && mine.source === 'link' && mine.status === 'booked', 'the owner sees the booking with the client details');
  ok(r.data.bookings.length === 2, 'the owner sees 2 bookings (one 10:00, one race winner)');
  ok((await B.req('GET', '/api/me')).data.bookings.length === 0, 'another account sees none of them');
  ok((await A.req('POST', '/api/bookings', { svcId: 'cut', date: tue, time: '10:00', name: 'Walk-in' })).status === 409, 'owner cannot double-book over an existing booking');
  r = await A.req('POST', '/api/bookings', { svcId: 'cut', date: tue, time: '11:00', name: 'Walk-in', phone: '07700 900777' }); ok(r.status === 201 && r.data.bookings[0].source === 'manual', 'owner can add a walk-in');
  r = await anon.req('GET', `/api/public/${slugA}`); ok(r.data.busy.some(b => b.time === '11:00'), 'walk-in blocks the public page too');
  ok((await book({ time: '11:00' })).status === 409, 'clients cannot book over the walk-in');

  /* ---- more ways to add a booking ---- */
  const wed = addDays(tue, 1), mk = body => A.req('POST', '/api/bookings', body);
  r = await mk({ svcId: 'custom', svcName: 'Home visit', mins: 90, price: 55, date: wed, time: '09:00', name: 'Custom Client', phone: '07700 900888', note: 'Gate code 1234' });
  ok(r.status === 201 && r.data.bookings[0].svcName === 'Home visit' && r.data.bookings[0].mins === 90 && r.data.bookings[0].price === 55 && r.data.bookings[0].svcId === '', 'owner can add a one-off service with its own length and price');
  r = await mk({ svcId: 'cut', mins: 20, price: 12, date: wed, time: '11:00', name: 'Discount' });
  ok(r.status === 201 && r.data.bookings[0].mins === 20 && r.data.bookings[0].price === 12 && r.data.bookings[0].svcName === 'Haircut', 'owner can change the length and price for just one booking');
  ok((await mk({ svcId: 'custom', svcName: '', mins: 30, price: 5, date: wed, time: '13:00', name: 'X' })).status === 422, 'a one-off service needs a name');
  ok((await mk({ svcId: 'custom', svcName: 'Odd', mins: 2, price: 5, date: wed, time: '13:00', name: 'X' })).status === 422, 'a one-off service needs a sensible length');
  r = await mk({ svcId: 'cut', date: addDays(londonToday(), -3), time: '10:00', name: 'Past Client', status: 'done' });
  ok(r.status === 201 && r.data.bookings[0].status === 'done', 'owner can log an appointment that already happened');
  ok((await mk({ svcId: 'cut', date: wed, time: '14:00', name: 'Rep', repeat: { every: 5, count: 3 } })).status === 422, 'repeats must be weekly, fortnightly or every 4 weeks');
  ok((await mk({ svcId: 'cut', date: wed, time: '14:00', name: 'Rep', repeat: { every: 7, count: 40 } })).status === 422, 'the repeat count is capped');
  r = await mk({ svcId: 'cut', date: wed, time: '14:00', name: 'Weekly Client', phone: '07700 900999', repeat: { every: 7, count: 4 } });
  ok(r.status === 201 && r.data.bookings.length === 4 && r.data.skipped.length === 0 && r.data.bookings.map(b => b.date).join() === [0, 7, 14, 21].map(n => addDays(wed, n)).join(), 'a weekly repeat creates 4 bookings, 7 days apart');
  ok((await mk({ svcId: 'cut', date: wed, time: '14:00', name: 'Clash', repeat: { every: 7, count: 3 } })).status === 409, 'a repeat where every date clashes is refused');
  await mk({ svcId: 'cut', date: addDays(wed, 7), time: '15:00', name: 'Blocker' });
  r = await mk({ svcId: 'cut', date: wed, time: '15:00', name: 'Mix', repeat: { every: 7, count: 3 } });
  ok(r.status === 201 && r.data.bookings.length === 2 && r.data.skipped.join() === addDays(wed, 7), 'a repeat skips the dates that clash and says which');

  /* ---- changing bookings ---- */
  ok((await A.req('PATCH', `/api/bookings/${mine.id}`, { reminded: true })).status === 200, 'owner can mark a reminder sent');
  ok((await A.req('PATCH', `/api/bookings/${mine.id}`, { status: 'weird' })).status === 422, 'invalid status refused');
  ok((await B.req('PATCH', `/api/bookings/${mine.id}`, { status: 'cancelled' })).status === 404, 'another account cannot change my booking');
  ok((await anon.req('PATCH', `/api/bookings/${mine.id}`, { status: 'cancelled' })).status === 401, 'signed-out cannot change bookings');
  ok((await A.req('PATCH', `/api/bookings/${mine.id}`, { status: 'cancelled' })).status === 200, 'owner can cancel');
  ok((await book({})).status === 201, 'a cancelled slot can be booked again');
  r = await A.req('GET', '/api/me'); ok(r.data.bookings.find(b => b.id === mine.id).reminded === true, 'reminded flag was saved');

  /* ---- sample bookings are labelled, never block real clients, and can be removed ---- */
  r = await A.req('POST', '/api/bookings/sample', { bookings: [{ svcId: 'cut', svcName: 'Haircut', mins: 30, price: 18, date: tue, time: '16:00', name: 'Sample Person', phone: '07700 900101', note: '', status: 'booked', source: 'link' }] });
  ok(r.status === 201 && r.data.bookings.find(b => b.name === 'Sample Person').source === 'sample', 'sample bookings are always marked as samples');
  r = await anon.req('GET', `/api/public/${slugA}`); ok(!r.data.busy.some(b => b.time === '16:00'), 'sample bookings do not show as busy on the public page');
  ok((await book({ time: '16:00' })).status === 201, 'a real client can book over a sample booking');
  ok((await B.req('DELETE', '/api/bookings/sample')).data.removed === 0, 'another account removing samples touches nothing of mine');
  ok((await A.req('DELETE', '/api/bookings/sample')).data.removed === 1, 'all sample bookings can be removed in one go');
  r = await A.req('GET', '/api/me'); ok(!r.data.bookings.some(b => b.source === 'sample') && r.data.bookings.some(b => b.name === 'Test Client'), 'real bookings are kept when samples are removed');
  const del = r.data.bookings.find(b => b.name === 'Walk-in');
  ok((await B.req('DELETE', `/api/bookings/${del.id}`)).status === 404, 'another account cannot delete my booking');
  ok((await anon.req('DELETE', `/api/bookings/${del.id}`)).status === 401, 'signed-out cannot delete bookings');
  ok((await A.req('DELETE', `/api/bookings/${del.id}`)).status === 200 && !(await A.req('GET', '/api/me')).data.bookings.some(b => b.id === del.id), 'the owner can delete a booking');
  ok((await A.req('DELETE', `/api/bookings/${del.id}`)).status === 404, 'deleting it twice is a clean 404');

  /* ---- days off and notice ---- */
  const off = doc(slugA, { timeOff: [{ id: 'h1', date: nextTuesday(15), label: 'Holiday' }] });
  await A.req('PUT', '/api/profile', { doc: off });
  ok((await book({ date: nextTuesday(15), time: '10:00' })).status === 409, 'a day off cannot be booked');
  r = await anon.req('GET', `/api/public/${slugA}`); ok(!JSON.stringify(r.data).includes('Holiday'), 'day-off reasons are private');
  const sooner = doc(slugA, { rules: { lead: 0, ahead: 28, buffer: 15, slot: 30 } });
  await A.req('PUT', '/api/profile', { doc: sooner });
  ok((await book({ time: '15:00' })).status === 201, 'booking with a 15 minute buffer rule still works');
  ok((await book({ svcId: 'cut', time: '15:30' })).status === 409, 'the buffer rule blocks the next slot (30 min + 15 min gap)');

  /* ---- sign in and out ---- */
  ok((await A.req('POST', '/api/logout')).status === 204, 'logout');
  ok((await A.req('GET', '/api/me')).data.email === null, 'after logout the session is gone');
  ok((await A.req('POST', '/api/login', { email: 'a@example.com', password: 'wrong password!!' })).status === 401, 'wrong password is 401');
  ok((await A.req('POST', '/api/login', { email: 'nobody@example.com', password: 'whatever it is' })).status === 401, 'unknown email gives the same 401');
  r = await A.req('POST', '/api/login', { email: 'a@example.com', password: 'a long enough password' }); ok(r.status === 200, 'login with the right password works');
  ok((await A.req('GET', '/api/me')).data.doc.biz.slug === slugA, 'data is still there after logging back in');
  const brute = new Client(); let limited = 0; for (let i = 0; i < 12; i++) if ((await brute.req('POST', '/api/login', { email: 'brute@example.com', password: 'guess number ' + i })).status === 429) limited++;
  ok(limited >= 4, `repeated wrong logins get rate limited (${limited} blocked)`);

  /* ---- deleting an account ---- */
  ok((await B.req('DELETE', '/api/account')).status === 204, 'account deletion works');
  ok((await B.req('GET', '/api/me')).data.email === null, 'deleted account cannot use its old session');
  ok((await anon.req('GET', `/api/public/${slugB}`)).status === 404, 'a deleted business page is gone');

  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} API checks passed`);
  process.exit(fails ? 1 : 0);
})();
