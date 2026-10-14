/* Checks dist/ against the launch checklist. Run: npm run build && npm run audit */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url)), DIST = path.join(ROOT, 'dist');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8')), SITE = cfg.url.replace(/\/$/, '');
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const all = walk(DIST), rel = f => '/' + path.relative(DIST, f).replace(/\\/g, '/');
const exists = u => { const p = u.split('#')[0].split('?')[0]; const f = path.join(DIST, p.endsWith('/') ? p + 'index.html' : p); return fs.existsSync(f); };
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const pass = m => console.log('ok  ', m);

const htmlFiles = all.filter(f => f.endsWith('.html'));
const pages = htmlFiles.filter(f => !/((app|admin|client)[\\/]index|404)\.html$/.test(f));
const titles = new Set(), descs = new Set(), h1s = new Set();
const BAD = /lorem|ipsum|todo|tbd|placeholder text|your (name|text) here|vibe|\bvite\b|react app|coming soon|example\.com/i;

for (const f of htmlFiles) {
  const h = fs.readFileSync(f, 'utf8'), r = rel(f), isApp = r === '/app/index.html' || r === '/admin/index.html' || r === '/client/index.html', is404 = r === '/404.html';
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1], desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  ok(title && title.length >= 10 && title.length <= 70, `${r}: title length (${title && title.length})`);
  ok(desc && desc.length >= 50 && desc.length <= 170, `${r}: description length (${desc && desc.length})`);
  ok(!/vibe|vite|react/i.test(title || ''), `${r}: title mentions vibe/vite/react`);
  ok(/<html lang="en-GB"[ >]/.test(h), `${r}: html lang`);
  ok(/<link rel="icon"/.test(h) && /apple-touch-icon/.test(h), `${r}: favicon links`);
  if (isApp || is404) { ok(/name="robots" content="noindex/.test(h), `${r}: should be noindex`); }
  else {
    ok(!titles.has(title), `${r}: duplicate title`); titles.add(title);
    ok(!descs.has(desc), `${r}: duplicate description`); descs.add(desc);
    const canon = (h.match(/<link rel="canonical" href="([^"]*)"/) || [])[1];
    ok(canon === SITE + (r === '/index.html' ? '/' : r.replace(/index\.html$/, '')), `${r}: canonical (${canon})`);
    const hs = [...h.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim());
    ok(hs.length === 1, `${r}: exactly one h1 (${hs.length})`); ok(!h1s.has(hs[0]), `${r}: duplicate h1`); h1s.add(hs[0]);
    for (const k of ['og:title', 'og:description', 'og:url', 'og:image', 'og:image:alt', 'twitter:card', 'twitter:image']) ok(h.includes(k), `${r}: missing ${k}`);
    const og = (h.match(/property="og:image" content="([^"]*)"/) || [])[1]; ok(og && og.startsWith(SITE) && exists(og.slice(SITE.length)), `${r}: og:image file exists (${og})`);
    const ld = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
    ok(ld.length === 1, `${r}: one JSON-LD block`);
    for (const m of ld) { try { const j = JSON.parse(m[1]); ok(j['@context'] === 'https://schema.org' && Array.isArray(j['@graph']), `${r}: JSON-LD shape`); const types = j['@graph'].map(x => x['@type']); if (r !== '/index.html') ok(types.includes('BreadcrumbList'), `${r}: breadcrumb schema`); if (!r.startsWith('/find/') && !r.startsWith('/blog/')) ok(types.includes('FAQPage'), `${r}: faq schema`); } catch (e) { ok(false, `${r}: JSON-LD parse ${e.message}`); } }
    if (r !== '/index.html') ok(/<nav class="crumbs"/.test(h), `${r}: visible breadcrumbs`);
    const internal = [...h.matchAll(/<a [^>]*href="(\/[^"#]*)(#[^"]*)?"/g)].map(m => m[1]);
    ok(new Set(internal).size >= 4, `${r}: internal links (${new Set(internal).size})`);
  }
  for (const m of h.matchAll(/<img\b[^>]*>/g)) { ok(/ alt="[^"]{8,}"/.test(m[0]), `${r}: image alt: ${m[0].slice(0, 60)}`); ok(/ width="\d+"/.test(m[0]) && / height="\d+"/.test(m[0]), `${r}: image dimensions`); }
  for (const m of h.matchAll(/(?:href|src)="(\/[^"]*)"/g)) { const u = m[1]; if (u.startsWith('//')) continue; ok(exists(u), `${r}: broken link ${u}`); }
  const text = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' ');
  ok(!BAD.test(text), `${r}: placeholder-ish text (${(text.match(BAD) || [])[0]})`);
  ok(!/https?:\/\/(?!(www\.)?(schema\.org|w3\.org))[^"' ]*(cdn|googleapis|cloudflare)/i.test(h), `${r}: third-party asset`);
}

/* anchors on the home page resolve */
const home = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
for (const m of home.matchAll(/href="#([^"]+)"/g)) if (m[1] !== 'main') ok(home.includes(`id="${m[1]}"`), `home: anchor #${m[1]} has a target`);

/* required files */
for (const f of ['/404.html', '/robots.txt', '/sitemap.xml', '/llms.txt', '/favicon.svg', '/favicon.ico', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest', '/_headers']) ok(exists(f), `missing ${f}`);
const sm = fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8'), locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const staticPages = pages.filter(f => !/[\\/]blog[\\/][^\\/]+[\\/]index\.html$/.test(f));   // blog posts are added to the sitemap by the Worker once released
ok(locs.length === staticPages.length, `sitemap has ${locs.length} urls, ${staticPages.length} pages`);
ok(sm.includes('<!--BLOGURLS-->'), 'sitemap has the blog marker');
for (const l of locs) ok(l.startsWith(SITE) && exists(l.slice(SITE.length)), `sitemap url resolves: ${l}`);
const rb = fs.readFileSync(path.join(DIST, 'robots.txt'), 'utf8'); ok(rb.includes(`Sitemap: ${SITE}/sitemap.xml`) && rb.includes('Disallow: /app/'), 'robots.txt content');
const llms = fs.readFileSync(path.join(DIST, 'llms.txt'), 'utf8'); ok(llms.startsWith('# Bookable') && llms.includes(SITE), 'llms.txt content');
const man = JSON.parse(fs.readFileSync(path.join(DIST, 'manifest.webmanifest'), 'utf8')); for (const i of man.icons) ok(exists(i.src), 'manifest icon ' + i.src);

/* production hygiene */
ok(!all.some(f => f.endsWith('.map')), 'source map files present');
for (const f of all.filter(f => /\.(js|css)$/.test(f))) ok(!/sourceMappingURL/.test(fs.readFileSync(f, 'utf8')), `sourceMappingURL in ${rel(f)}`);
const kb = f => fs.statSync(f).size / 1024;
const js = all.filter(f => f.endsWith('.js'));
for (const f of js) console.log(`  ${rel(f).padEnd(34)} ${kb(f).toFixed(1)} KB`);
const eager = js.find(f => /app\./.test(f)); ok(kb(eager) < 95, `eager app bundle ${kb(eager).toFixed(0)} KB should be under 95 KB`);
ok(!js.some(f => /three|curtain/.test(rel(f))), 'no 3D library in the output');
const largest = Math.max(...all.filter(f => /\.(webp|png|woff2)$/.test(f)).map(kb)); ok(largest < 200, `largest asset ${largest.toFixed(0)} KB`);

console.log(fails ? `\n${fails} problem(s)` : `\nall checks passed (${htmlFiles.length} html files, ${all.length} files)`);
process.exit(fails ? 1 : 0);
