// Builds the public website for GitHub Pages from dist/ (run `node build.mjs` first).
//   node tools/pages-site.mjs            ->  pages-dist/
// Settings (environment variables): PAGES_ORIGIN (default https://spirestudio.github.io), PAGES_BASE (default /bookable),
//   PAGES_NOW (testing only: pretend it is this UK date and time, e.g. 2026-10-20T10:00)
// Only blog posts whose release time (UK time) has passed are published, so running this every hour on GitHub
// Actions keeps the blog, its index, the sitemap and the RSS feed up to date by itself.
// The booking app, search, customer area and admin stay on the live server; links to them point there.
import fs from 'node:fs';
import path from 'node:path';
import { POST_META } from '../src/site/posts.mjs';

const ORIGIN = (process.env.PAGES_ORIGIN || 'https://spirestudio.github.io').replace(/\/$/, '');
const BASE = '/' + (process.env.PAGES_BASE ?? '/bookable').replace(/^\/+|\/+$/g, '');
const cfg = JSON.parse(fs.readFileSync('site.config.json', 'utf8')), LIVE = cfg.url.replace(/\/$/, '');
const SELF = ORIGIN + (BASE === '/' ? '' : BASE), PFX = BASE === '/' ? '' : BASE;
const SRC = 'dist', OUT = 'pages-dist';
const LIVE_ONLY = /^\/(app|find|client|admin|api)(\/|$|\?|#)/;

/* what time is it in the UK (summer and winter handled by Intl) */
function londonNow() {
  const d = process.env.PAGES_NOW ? new Date(process.env.PAGES_NOW + 'Z') : new Date();
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: process.env.PAGES_NOW ? 'UTC' : 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const g = t => +p.find(x => x.type === t).value, pad = n => String(n).padStart(2, '0');
  return { date: `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`, min: g('hour') * 60 + g('minute') };
}
const toMin = t => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };
const now = londonNow();
const released = p => p.date < now.date || (p.date === now.date && now.min >= toMin(p.time));
const live = POST_META.filter(released).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
const liveSlugs = new Set(live.map(p => p.slug));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rssDate = p => new Date(`${p.date}T${p.time}:00Z`).toUTCString();

/* link rewriting */
const local = p => LIVE_ONLY.test(p) ? LIVE + p : PFX + p;
function rewrite(text, kind) {
  /* absolute links to the live site: app pages stay there, everything else becomes this site */
  text = text.split(LIVE).join('@@LIVE@@');
  text = text.replace(/@@LIVE@@(\/[^"'\s<>)]*)?/g, (m, p) => { p = p || '/'; return LIVE_ONLY.test(p) ? LIVE + p : SELF + p; });
  if (kind === 'html') {
    text = text.replace(/<link rel="manifest"[^>]*>/g, '');
    text = text.replace(/\b(href|src|action)="(\/(?!\/)[^"]*)"/g, (m, a, p) => `${a}="${local(p)}"`);
    text = text.replace(/\bcontent="(\/(?!\/)[^"]*)"/g, (m, p) => `content="${local(p)}"`);
  }
  if (kind === 'html' || kind === 'css') text = text.replace(/url\((["']?)(\/(?!\/)[^)"']*)\1\)/g, (m, q, p) => `url(${q}${local(p)}${q})`);
  return text;
}

fs.rmSync(OUT, { recursive: true, force: true });
const SKIP_DIRS = new Set(['app', 'admin', 'client', 'find']);
function copy(dir, rel = '') {
  fs.mkdirSync(path.join(OUT, rel), { recursive: true });
  for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.posix.join(rel, e.name);
    if (e.isDirectory()) {
      if (!rel && SKIP_DIRS.has(e.name)) continue;
      if (rel === 'blog' && !liveSlugs.has(e.name)) continue;      // not released yet
      copy(dir, r);
    } else {
      if (e.name === '_headers' || e.name === 'manifest.webmanifest' || e.name === 'sitemap.xml' || e.name === 'robots.txt') continue;
      const kind = /\.html$/.test(e.name) ? 'html' : /\.css$/.test(e.name) ? 'css' : /\.(txt|js)$/.test(e.name) ? 'text' : null;
      if (kind) fs.writeFileSync(path.join(OUT, r), rewrite(fs.readFileSync(path.join(dir, r), 'utf8'), kind));
      else fs.copyFileSync(path.join(dir, r), path.join(OUT, r));
    }
  }
}
copy(SRC);

/* blog index: released posts, newest first */
{
  const f = path.join(OUT, 'blog/index.html'); let h = fs.readFileSync(f, 'utf8');
  const list = live.length ? live.map(p => `<a href="${PFX}/blog/${p.slug}/"><strong>${esc(p.title)}</strong><span>${longDate(p.date)}</span><i aria-hidden="true">Read →</i></a>`).join('') : '<p class="note">The first post goes live soon.</p>';
  if (!h.includes('<!--POSTS-->')) throw new Error('blog index has no <!--POSTS--> marker');
  fs.writeFileSync(f, h.replace('<!--POSTS-->', list));
}

/* sitemap: this site's pages and the released posts only */
{
  const xml = fs.readFileSync(path.join(SRC, 'sitemap.xml'), 'utf8').replace('<!--BLOGURLS-->', live.map(p => `  <url><loc>${LIVE}/blog/${p.slug}/</loc><lastmod>${p.date}</lastmod></url>`).join('\n'));
  const out = rewrite(xml, 'text').split('\n').filter(l => !l.includes('<loc>') || (l.includes(SELF) && !LIVE_ONLY.test(l.match(/<loc>([^<]+)</)[1].slice(SELF.length)))).join('\n');
  fs.writeFileSync(path.join(OUT, 'sitemap.xml'), out);
}
/* RSS feed (helps readers, aggregators and crawlers notice new posts) */
fs.writeFileSync(path.join(OUT, 'rss.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Bookable blog</title><link>${SELF}/blog/</link><description>Practical advice for barbers, nail technicians and dog walkers on bookings, no-shows and getting more clients.</description><language>en-gb</language>
${live.slice(0, 30).map(p => `<item><title>${esc(p.title)}</title><link>${SELF}/blog/${p.slug}/</link><guid>${SELF}/blog/${p.slug}/</guid><pubDate>${rssDate(p)}</pubDate><description>${esc(p.description || '')}</description></item>`).join('\n')}
</channel></rss>
`);
fs.writeFileSync(path.join(OUT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SELF}/sitemap.xml\n`);
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

/* checks: every local link must exist, nothing may point at a host root, no unreleased post may be present */
let bad = 0;
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const all = walk(OUT), htmls = all.filter(f => f.endsWith('.html'));
for (const f of htmls) {
  const t = fs.readFileSync(f, 'utf8');
  for (const m of t.matchAll(/\b(?:href|src|action)="([^"]*)"/g)) {
    const u = m[1];
    if (u.startsWith('#') || u.startsWith('mailto:') || u.startsWith('tel:') || /^https?:/.test(u) || u === '') continue;
    if (PFX && !u.startsWith(PFX + '/')) { console.log('BAD (not prefixed):', f, u); bad++; continue; }
    const p = (PFX ? u.slice(PFX.length) : u).split('#')[0].split('?')[0] || '/';
    const target = path.join(OUT, p === '/' ? 'index.html' : p.slice(1));
    if (!(fs.existsSync(target) && (fs.statSync(target).isFile() || fs.existsSync(path.join(target, 'index.html'))))) { console.log('BAD (missing file):', f, u); bad++; }
  }
}
const present = fs.readdirSync(path.join(OUT, 'blog'), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
const early = present.filter(s => !liveSlugs.has(s));
if (early.length) { console.log('BAD: unreleased posts present:', early.join(', ')); bad++; }
const unrel = POST_META.filter(p => !released(p)).length;
console.log(bad ? `${bad} problem(s)` : `ok: ${live.length} posts live, ${unrel} scheduled, ${all.length} files in ${OUT}/ (${SELF}/)`);
process.exit(bad ? 1 : 0);
