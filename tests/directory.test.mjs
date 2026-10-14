/* Search directory + daily blog release, against a locally running Worker.
   Start it: npx wrangler dev --local --port 8787   (apply migrations first: npx wrangler d1 migrations apply pencil-db --local)
   Run: node tests/directory.test.mjs */
import { execSync } from 'node:child_process';
import { POST_META } from '../src/site/posts.mjs';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };

if (!process.env.NO_RESET) {
  const sql = ['rl', 'bookings', 'profiles', 'sessions', 'users'].map(t => `DELETE FROM ${t};`).join(' ');
  execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "' + sql + '"', { stdio: 'ignore' });
}

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
const doc = (slug, name, town, listed) => ({
  trade: 'barber', biz: { name, slug, phone: '07123 456789', town, intro: 'Book here.', listed },
  services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }],
  hours: { 0: day(false), 1: day(false), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(false) },
  timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 },
  reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' },
});
const search = async q => (await fetch(BASE + '/api/search?q=' + encodeURIComponent(q))).json();

(async () => {
  const A = new Client(), B = new Client(), tag = Math.random().toString(36).slice(2, 6);
  const slugA = 'joes-' + tag, slugB = 'hidden-' + tag, nameA = 'Joes Barbers ' + tag, nameB = 'Quiet Cuts ' + tag;
  let r;

  /* ---- directory ---- */
  ok((await A.req('POST', '/api/signup', { email: `a-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner A signs up');
  ok((await B.req('POST', '/api/signup', { email: `b-${tag}@example.com`, password: 'a long enough password' })).status === 201, 'owner B signs up');
  ok((await A.req('PUT', '/api/profile', { doc: doc(slugA, nameA, 'Lichfield', false) })).status === 200, 'A saves a page that is NOT listed');
  ok((await B.req('PUT', '/api/profile', { doc: doc(slugB, nameB, 'Lichfield', false) })).status === 200, 'B saves a page that is NOT listed');

  let s = await search(tag);
  ok(Array.isArray(s.results) && s.results.length === 0, 'unlisted businesses never appear in search');

  r = await A.req('PUT', '/api/profile', { doc: doc(slugA, nameA, 'Lichfield', true) });
  ok(r.status === 200 && r.data.doc.biz.listed === true, 'A switches listing on');
  s = await search(tag);
  ok(s.results.length === 1 && s.results[0].slug === slugA, 'only the listed business appears (B stays hidden)');
  ok(Object.keys(s.results[0]).sort().join() === 'name,slug,town,trade', 'search results expose only name, town, trade and slug');
  ok(s.results[0].trade === 'Barber' && s.results[0].town === 'Lichfield', 'result shows the trade and town');
  ok(!JSON.stringify(s).includes('07123') && !JSON.stringify(s).includes('@example.com'), 'no phone number or email in search results');

  ok((await search('joes lichfield ' + tag)).results.length === 1, 'several words must all match');
  ok((await search('barber ' + tag)).results.length === 1, 'search finds by trade word');
  ok((await search('JOES')).results.some(x => x.slug === slugA), 'search is case-insensitive');
  ok((await search('nonexistentzzz')).results.length === 0, 'no match gives an empty list');
  ok(Array.isArray((await search('')).results), 'an empty search lists recently listed businesses');
  ok(Array.isArray((await search("%' OR 1=1 --; DROP TABLE profiles;")).results), 'odd characters in a search are harmless');
  r = await fetch(BASE + '/api/public/' + slugA); ok(r.status === 200, 'a listed business page still opens from its slug');

  await A.req('PUT', '/api/profile', { doc: doc(slugA, nameA, 'Lichfield', false) });
  ok((await search(tag)).results.length === 0, 'switching listing off removes it at once');
  await A.req('PUT', '/api/profile', { doc: doc(slugA, nameA, 'Lichfield', true) });
  ok((await search(tag)).results.length === 1, 'and back on');
  ok((await A.req('DELETE', '/api/account')).status === 204, 'A deletes their account');
  ok((await search(tag)).results.length === 0, 'a deleted account disappears from search');

  /* ---- daily blog (live at 09:00 UK time on each post's date) ---- */
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = t => +p.find(x => x.type === t).value, pad = n => String(n).padStart(2, '0');
  const today = `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`, min = g('hour') * 60 + g('minute');
  const at = x => { const [h, m] = x.time.split(':').map(Number); return h * 60 + m; };
  const live = POST_META.filter(x => x.date < today || (x.date === today && min >= at(x)));
  const later = POST_META.filter(x => !live.includes(x));
  const index = await (await fetch(BASE + '/blog/')).text();
  const sitemap = await (await fetch(BASE + '/sitemap.xml')).text();
  ok(index.includes('The Bookable blog') && !index.includes('<!--POSTS-->'), 'the blog index renders with its list filled in');
  ok(!sitemap.includes('<!--BLOGURLS-->') && sitemap.includes('/find/') && sitemap.includes('/pricing/'), 'the sitemap keeps its normal pages');
  for (const x of live) {
    const res = await fetch(BASE + '/blog/' + x.slug + '/');
    ok(res.status === 200 && (await res.text()).includes(x.title.slice(0, 20)), `live post is served: ${x.slug}`);
    ok(index.includes('/blog/' + x.slug + '/') && sitemap.includes('/blog/' + x.slug + '/'), `live post is listed in the index and sitemap: ${x.slug}`);
  }
  for (const x of later) {
    const res = await fetch(BASE + '/blog/' + x.slug + '/');
    ok(res.status === 404, `future post is hidden until ${x.time} on ${x.date}: ${x.slug}`);
    ok(!index.includes('/blog/' + x.slug + '/') && !sitemap.includes('/blog/' + x.slug + '/'), `future post is not in the index or sitemap: ${x.slug}`);
  }
  ok((await fetch(BASE + '/blog/not-a-real-post/')).status === 404, 'an unknown post is a 404');
  console.log(`(${live.length} posts live, ${later.length} scheduled; it is ${today} ${pad(Math.floor(min / 60))}:${pad(min % 60)} in London)`);

  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} directory and blog checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
