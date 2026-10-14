/* The app lists free times and the server accepts bookings: they must agree exactly.
   For every 15-minute start time, for two services, check "offered by the app" == "accepted by the server". */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist'), BASE = process.env.BASE || 'http://localhost:8787';
let html = fs.readFileSync(path.join(DIST, 'app/index.html'), 'utf8').replace(/<link[^>]+>/g, '');
html = html.replace(/<script src="([^"]+)" defer><\/script>/, (m, src) => '<script>' + fs.readFileSync(DIST + src, 'utf8').split('</script>').join('<\\/script>') + '</script>');
const w = new JSDOM(html, { runScripts: 'dangerously', url: BASE + '/app/' }).window;
const pad = n => String(n).padStart(2, '0');
const londonToday = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
let ip = 0, fails = 0, cookie = '';
const call = async (method, p, body, headers = {}) => {
  const r = await fetch(BASE + p, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.1.' + (ip >> 8) + '.' + (ip++ & 255), ...(cookie ? { cookie } : {}), ...headers }, body: body && JSON.stringify(body) });
  for (const c of r.headers.getSetCookie?.() || []) cookie = c.split(';')[0];
  const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null };
};

const email = `parity${Date.now()}@example.com`;
await call('POST', '/api/signup', { email, password: 'a long enough password' });
const doc = (rules, hours) => ({
  trade: 'barber', biz: { name: 'Parity Test', slug: 'parity-' + Math.random().toString(36).slice(2, 7), phone: '07123 456789', town: 'Lichfield', intro: '' },
  services: [{ id: 'a', name: 'Half hour', mins: 30, price: 10 }, { id: 'b', name: 'Three quarters', mins: 45, price: 15 }],
  hours, timeOff: [], rules, reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}' },
});
const closed = { on: false, start: '09:00', end: '17:00' };
const hoursFor = (open, close) => { const h = {}; for (let i = 0; i < 7; i++) h[i] = { on: true, start: open, end: close }; return h; };

const cases = [
  { label: '30 minute grid, 09:00 to 12:00', rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 }, hours: hoursFor('09:00', '12:00') },
  { label: '15 minute grid, odd hours 09:15 to 11:50', rules: { lead: 2, ahead: 28, buffer: 0, slot: 15 }, hours: hoursFor('09:15', '11:50') },
  { label: '60 minute grid, 10:00 to 15:00', rules: { lead: 12, ahead: 28, buffer: 10, slot: 60 }, hours: hoursFor('10:00', '15:00') },
];
for (const c of cases) {
  const d = doc(c.rules, c.hours);
  let r = await call('PUT', '/api/profile', { doc: d }); if (r.status !== 200) { console.log('FAIL profile', r.status, r.data); process.exit(1); }
  const slug = d.biz.slug, date = addDays(londonToday(), 9);
  const pub = (await call('GET', `/api/public/${slug}`)).data;
  for (const svc of d.services) {
    const offered = new Set(w.slotsFor(date, svc.mins, { ...pub.doc, bookings: [] }));
    const accepted = new Set();
    for (let m = 6 * 60; m <= 21 * 60; m += 15) {
      const t = `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
      const b = await call('POST', `/api/public/${slug}/book`, { svcId: svc.id, date, time: t, name: 'Parity', phone: '07700 90' + String(1000 + ip).slice(-4) + '1' });
      if (b.status === 201) { accepted.add(t); const me = (await call('GET', '/api/me')).data; await call('PATCH', '/api/bookings/' + me.bookings.find(x => x.name === 'Parity' && x.status === 'booked').id, { status: 'cancelled' }); }
      else if (b.status !== 409) { console.log('FAIL unexpected', b.status, b.data); fails++; }
    }
    const onlyApp = [...offered].filter(x => !accepted.has(x)), onlyServer = [...accepted].filter(x => !offered.has(x));
    const same = !onlyApp.length && !onlyServer.length && offered.size > 0;
    if (!same) fails++;
    console.log(same ? 'ok  ' : 'FAIL', `${c.label}, ${svc.mins} min: app offers ${offered.size}, server accepts ${accepted.size}` + (same ? '' : ` | only app: ${onlyApp} | only server: ${onlyServer}`));
  }
}
console.log(fails ? `\n${fails} MISMATCH(ES)` : '\nthe app and the server agree on every time');
process.exit(fails ? 1 : 0);
