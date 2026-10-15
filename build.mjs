/* Builds the production site into dist/. Run: npm run build */
import { transform } from 'esbuild';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { pages, notFound } from './src/site/content.mjs';
import { POSTS } from './src/site/posts.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(ROOT, 'dist'), ASSETS = path.join(DIST, 'assets');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));
const SITE = cfg.url.replace(/\/$/, '');
const TODAY = new Date().toISOString().slice(0, 10), YEAR = new Date().getFullYear();

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const hash = buf => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 10);
const read = (...p) => fs.readFileSync(path.join(ROOT, ...p));
const write = (rel, data) => { const f = path.join(DIST, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, data); };
function emit(name, ext, data) { const file = `assets/${name}.${hash(data)}${ext}`; write(file, data); return '/' + file; }

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(ASSETS, { recursive: true });

/* ---------- font, CSS, JS (minified, no source maps) ---------- */
const fontUrl = emit('inter', '.woff2', fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')));
const css = async rel => (await transform(read(...rel).toString().replace('__INTER__', fontUrl), { loader: 'css', minify: true })).code;
const appCss = emit('app', '.css', await css(['src', 'app', 'app.css']));
const adminCss = emit('admin', '.css', await css(['src', 'admin', 'admin.css']));
const adminJs = emit('admin', '.js', (await transform(read('src', 'admin', 'admin.js').toString(), { minify: true, target: 'es2020', legalComments: 'none' })).code);
const clientCss = emit('client', '.css', await css(['src', 'client', 'client.css']));
const clientJs = emit('client', '.js', (await transform(read('src', 'client', 'client.js').toString(), { minify: true, target: 'es2020', legalComments: 'none' })).code);
const siteCss = emit('site', '.css', await css(['src', 'site', 'site.css']));

const findJs = emit('find', '.js', (await transform(read('src', 'site', 'find.js').toString(), { minify: true, target: 'es2020', legalComments: 'none' })).code);
for (const p of pages) if (p.scriptName === 'find') p.script = findJs;
const siteJs = emit('site', '.js', (await transform(read('src', 'site', 'site.js').toString(), { minify: true, target: 'es2020', legalComments: 'none' })).code);
const appJs = emit('app', '.js', (await transform(read('src', 'app', 'app.js').toString(), { minify: true, target: 'es2020', legalComments: 'none' })).code);

/* ---------- images ---------- */
const imgDir = path.join(ROOT, 'src/static/img'), IMG = {};
if (fs.existsSync(imgDir)) for (const f of fs.readdirSync(imgDir).filter(f => f.endsWith('.webp'))) {
  const buf = fs.readFileSync(path.join(imgDir, f)), m = await sharp(buf).metadata();
  IMG[f.replace('.webp', '')] = { url: emit('img-' + f.replace('.webp', ''), '.webp', buf), w: m.width, h: m.height };
}
const img = (name, alt, { eager } = {}) => {
  const i = IMG[name];
  if (!i) { if (process.env.BOOTSTRAP) return ''; throw new Error('missing image: ' + name); }
  return `<img src="${i.url}" width="${i.w}" height="${i.h}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"'}>`;
};

/* ---------- static files ---------- */
const staticDir = path.join(ROOT, 'src/static');
const OG = {};
for (const f of ['favicon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png']) if (fs.existsSync(path.join(staticDir, f))) write(f, fs.readFileSync(path.join(staticDir, f)));
if (fs.existsSync(path.join(staticDir, '.well-known/security.txt'))) write('.well-known/security.txt', fs.readFileSync(path.join(staticDir, '.well-known/security.txt')));
const ogDir = path.join(staticDir, 'og');
if (fs.existsSync(ogDir)) for (const f of fs.readdirSync(ogDir).filter(f => f.endsWith('.png'))) OG[f.replace('.png', '')] = emit('og-' + f.replace('.png', ''), '.png', fs.readFileSync(path.join(ogDir, f)));

/* ---------- html ---------- */
const NAV = [['/#what', 'Features'], ['/#how', 'How it works'], ['/blog/', 'Blog'], ['/pricing/', 'Pricing']];
const stripTags = s => String(s).replace(/<[^>]+>/g, '');
const abs = p => SITE + p;
/* the blog's main home is the GitHub Pages copy (one copy for Google to rank); blog pages on this server point their canonical there */
const pageUrl = p => (cfg.blogCanonical && typeof p === 'string' && p.startsWith('/blog/')) ? cfg.blogCanonical.replace(/\/$/, '') + p : abs(p);
const ogName = p => (p.path === '/' ? 'home' : p.path.replace(/\//g, ''));

const iconHead = `<link rel="icon" href="/favicon.ico" sizes="32x32"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="${cfg.themeColor}"><meta name="google-site-verification" content="HJWRYtoC95lVf62ZBCP0q5uQE7XjgBhi7Mu_G_boMj0">`;
const fontPreload = `<link rel="preload" href="${fontUrl}" as="font" type="font/woff2" crossorigin>`;

function faqHtml(items) {
  return `<div class="faq">${items.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join('')}</div>`;
}
function crumbsHtml(page) {
  return `<nav class="crumbs" aria-label="Breadcrumb"><ol><li><a href="/">Home</a></li><li><span aria-current="page">${esc(page.nav)}</span></li></ol></nav>`;
}
function graph(page) {
  const url = pageUrl(page.path), g = [];
  const org = { '@type': 'Organization', sameAs: ['https://github.com/spirestudio/bookable'], '@id': SITE + '/#organization', name: cfg.name, url: SITE + '/', logo: { '@type': 'ImageObject', url: abs('/icon-512.png'), width: 512, height: 512 } };
  const site = { '@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: cfg.name, inLanguage: 'en-GB', publisher: { '@id': SITE + '/#organization' } };
  const web = { '@type': 'WebPage', '@id': url + '#webpage', url, name: page.title, description: page.description, inLanguage: 'en-GB', isPartOf: { '@id': SITE + '/#website' }, primaryImageOfPage: { '@type': 'ImageObject', url: abs(OG[ogName(page)] || '') } };
  g.push(web);
  if (page.path === '/') g.push(org, site);
  else {
    web.breadcrumb = { '@id': url + '#breadcrumb' };
    g.push({ '@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' }, { '@type': 'ListItem', position: 2, name: page.nav, item: url }] });
  }
  const app = { '@type': 'SoftwareApplication', '@id': SITE + '/#software', name: cfg.name, applicationCategory: 'BusinessApplication', operatingSystem: 'Any web browser', url: SITE + '/', description: 'Booking pages, a calendar and WhatsApp reminders for any business that takes appointments, including barbers, nail technicians and dog walkers.', inLanguage: 'en-GB', offers: { '@type': 'Offer', price: '14.99', priceCurrency: 'GBP', description: '£14.99 a month after a 7-day free trial. No contract.' } };
  const aud = { '/barbers/': 'Barbers', '/nail-technicians/': 'Nail technicians', '/dog-walkers/': 'Dog walkers' }[page.path];
  if (page.path === '/' || page.path === '/pricing/') g.push(app);
  if (aud) g.push({ ...app, '@id': url + '#software', audience: { '@type': 'Audience', audienceType: aud }, url });
  if (page.article) g.push({ '@type': 'BlogPosting', '@id': url + '#article', headline: page.article.title, description: page.description, datePublished: page.article.date, dateModified: page.article.date, inLanguage: 'en-GB', mainEntityOfPage: { '@id': url + '#webpage' }, author: { '@type': 'Organization', name: cfg.name }, publisher: { '@type': 'Organization', name: cfg.name, logo: { '@type': 'ImageObject', url: abs('/icon-512.png') } } });
  if (page.faq) g.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: page.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  return { '@context': 'https://schema.org', '@graph': g };
}

function layout(page, body, { indexable = true } = {}) {
  const url = pageUrl(page.path || '/'), og = OG[ogName(page)] || OG.home, ogAlt = page.ogTitle ? stripTags(page.ogTitle).replace(/\n/g, ' ') + ' - Bookable' : 'Bookable: bookings for one-person businesses';
  const nav = NAV.map(([h, l]) => `<a href="${h}"${page.path === h ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
${indexable ? `<link rel="canonical" href="${url}">\n<meta name="robots" content="index,follow,max-image-preview:large">` : '<meta name="robots" content="noindex,nofollow">'}
${iconHead}
<meta property="og:type" content="website"><meta property="og:site_name" content="${cfg.name}"><meta property="og:locale" content="en_GB">
<meta property="og:title" content="${esc(page.title)}"><meta property="og:description" content="${esc(page.description)}"><meta property="og:url" content="${url}">
${og ? `<meta property="og:image" content="${abs(og)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="${esc(ogAlt)}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(page.title)}"><meta name="twitter:description" content="${esc(page.description)}"><meta name="twitter:image" content="${abs(og)}"><meta name="twitter:image:alt" content="${esc(ogAlt)}">` : ''}
${fontPreload}
<link rel="stylesheet" href="${siteCss}">
<script src="${siteJs}" defer></script>
${page.script ? `<script src="${page.script}" defer></script>` : ''}
${page.path && indexable ? `<script type="application/ld+json">${JSON.stringify(graph(page))}</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="top"><div class="wrap">
  <a class="brand" href="/" aria-label="Bookable home"><i class="mark"></i>Bookable</a>
  <nav aria-label="Main">${nav}</nav>
  <form class="hsearch" action="/find/" method="get" role="search"><input type="search" name="q" placeholder="Search a business" aria-label="Search for a business" maxlength="50" autocomplete="off"><button type="submit" aria-label="Search"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button></form>
  <a class="login client" id="clientlogin" href="/client/">Customer login</a><a class="login owner" id="ownerlogin" href="/app/#/login">Owner login</a>
</div></header>
<main id="main">${body}</main>
<footer class="foot"><div class="wrap">
  <div><a class="brand" href="/"><i class="mark"></i>Bookable</a><p>Bookings for one-person businesses. Early access.</p></div>
  <div><h2>Built for</h2><ul><li><a href="/barbers/">Barbers</a></li><li><a href="/nail-technicians/">Nail technicians</a></li><li><a href="/dog-walkers/">Dog walkers</a></li></ul></div>
  <div><h2>Bookable</h2><ul><li><a href="/find/">Find a business</a></li><li><a href="/blog/">Blog</a></li><li><a href="/pricing/">Pricing</a></li><li><a href="/app/#/login">Sign in</a></li><li><a href="/privacy/">Privacy</a></li><li><a href="/gdpr/">Data protection</a></li><li><a href="/terms/">Terms</a></li><li><a href="/payments/">Payments</a></li><li><a href="/llms.txt">For AI assistants</a></li></ul></div>
  <div class="legal">&copy; ${YEAR} Bookable</div>
</div></footer>
</body>
</html>
`;
}

for (const p of pages) {
  const body = p.body({ img, faq: faqHtml, crumbs: p.nav ? crumbsHtml(p) : '' });
  write(p.file, layout(p, body));
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = s => { const [y, m, d] = s.split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };
const inl = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
function md(src) {
  const out = []; let list = false; const close = () => { if (list) { out.push('</ul>'); list = false; } };
  for (const raw of src.trim().split('\n')) {
    const l = raw.trim();
    if (!l) { close(); continue; }
    if (l.startsWith('## ')) { close(); out.push('<h2>' + inl(l.slice(3)) + '</h2>'); }
    else if (l.startsWith('- ')) { if (!list) { out.push('<ul class="alist">'); list = true; } out.push('<li>' + inl(l.slice(2)) + '</li>'); }
    else { close(); out.push('<p>' + inl(l) + '</p>'); }
  }
  close();
  /* a Bookable box before the third heading (or before the last one in a short post) */
  const html = out.join('\n'), parts = html.split('<h2>');
  const box = '<aside class="callout"><b>Bookable</b> gives any business one booking link for their bio, a calendar that stops double-booking and reminders ready to send. <a href="/app/#/signup">Try it free for 7 days</a></aside>\n';
  if (parts.length < 3) return html;
  const at = parts.length >= 4 ? 3 : parts.length - 1;
  return parts.slice(0, at).join('<h2>') + '\n' + box + '<h2>' + parts.slice(at).join('<h2>');
}
/* every post links to the three posts before it (they are always live when this one is), which helps readers and search engines move around the blog */
const ORDER = POSTS.slice().sort((a, b) => (a.date + (a.time || '09:00')).localeCompare(b.date + (b.time || '09:00')));
const related = post => { const k = ORDER.findIndex(p => p.slug === post.slug); return ORDER.slice(Math.max(0, k - 3), k).reverse(); };
const seen = new Set();
for (const post of POSTS) {
  if (seen.has(post.slug)) throw new Error('duplicate blog slug ' + post.slug); seen.add(post.slug);
  const page = { path: '/blog/' + post.slug + '/', file: 'blog/' + post.slug + '/index.html', nav: post.title, title: post.title + ' | Bookable', description: post.description, article: { title: post.title, date: post.date } };
  const body = `
<div class="wrap">${crumbsHtml(page)}</div>
<section class="hero sub"><div class="wrap"><h1 style="font-size:clamp(34px,5.4vw,60px);max-width:16em">${esc(post.title)}</h1><p class="byline">${longDate(post.date)} · Bookable blog</p><div class="ctas" style="margin-top:22px"><a class="btn accent sm" href="/app/#/signup">Try Bookable free</a></div></div></section>
<section class="s"><div class="wrap article">
${md(post.body)}
${related(post).length ? '<h2>Keep reading</h2><ul class="alist">' + related(post).map(p => '<li><a href="/blog/' + p.slug + '/">' + esc(p.title) + '</a></li>').join('') + '</ul>' : ''}
<div class="post-cta"><h2>Get your own Bookable booking page</h2><ul class="alist"><li>One link for your Instagram bio and WhatsApp, so clients book themselves</li><li>A calendar that only offers free times and never double-books</li><li>Reminders written for you, ready to send from your own number</li></ul><p>Free for 7 days, then £14.99 a month. No contract, and no card needed while Bookable is in early access.</p><div class="ctas"><a class="btn accent" href="/app/#/signup">Try Bookable free</a><a class="btn ghost" href="${post.cta}">${esc(post.ctaLabel || 'See how it works')}</a></div></div>
</div></section>`;
  write(page.file, layout(page, body));
}
write(notFound.file, layout({ ...notFound, path: '', ogTitle: '' }, notFound.body, { indexable: false }));

/* app shell: private, never indexed */
write('app/index.html', `<!doctype html>
<html lang="en-GB" data-theme="cream" data-layout="top">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Bookable: bookings and reminders</title>
<meta name="description" content="Bookable: your bookings, calendar and WhatsApp reminders.">
<meta name="robots" content="noindex,nofollow">
${iconHead}
${fontPreload}
<link rel="stylesheet" href="${appCss}">
</head>
<body>
<div id="root"></div>
<noscript><p style="font:17px/1.6 system-ui,sans-serif;max-width:32em;margin:15vh auto;padding:0 20px">Bookable needs JavaScript to run. Turn it on in your browser settings, or go back to the <a href="/">Bookable home page</a>.</p></noscript>
<script src="${appJs}" defer></script>
</body>
</html>
`);

/* customer area: sign in or create a customer account, see and cancel your appointments */
write('client/index.html', `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Customer sign in · Bookable</title>
<meta name="description" content="Sign in or create a free customer account to keep your appointments in one place.">
<meta name="robots" content="noindex,nofollow">
${iconHead}
<link rel="stylesheet" href="${clientCss}">
</head>
<body>
<div id="root"></div>
<noscript><p style="font:17px/1.6 system-ui,sans-serif;max-width:32em;margin:15vh auto;padding:0 20px">The customer area needs JavaScript.</p></noscript>
<script src="${clientJs}" defer></script>
</body>
</html>
`);

/* owner panel: private, never indexed, sign-in enforced by the API */
write('admin/index.html', `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Bookable admin: owner panel</title>
<meta name="description" content="Private owner panel for Bookable. Owner sign in is required to view.">
<meta name="robots" content="noindex,nofollow">
${iconHead}
<link rel="stylesheet" href="${adminCss}">
</head>
<body>
<div id="root"></div>
<noscript><p style="font:17px/1.6 system-ui,sans-serif;max-width:32em;margin:15vh auto;padding:0 20px">The admin panel needs JavaScript.</p></noscript>
<script src="${adminJs}" defer></script>
</body>
</html>
`);

/* ---------- sitemap, robots, llms.txt, manifest, headers ---------- */
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map(p => `  <url><loc>${abs(p.path)}</loc><lastmod>${TODAY}</lastmod></url>`).join('\n')}
<!--BLOGURLS-->
</urlset>
`);
write('robots.txt', `User-agent: *\nAllow: /\nDisallow: /app/\nDisallow: /client/\n\nSitemap: ${SITE}/sitemap.xml\n`);
write('llms.txt', `# Bookable

> Bookable is a booking app for any business that takes appointments by message, such as barbers, nail technicians, dog walkers, tutors and trainers. It gives each business one booking link for Instagram and WhatsApp, a calendar with availability rules, and WhatsApp reminders written and ready to send. It costs £14.99 a month after a 7-day free trial.

Bookable is in early access. Businesses sign in to manage bookings, which are stored on Bookable's servers, and clients book from a shared link without an account. Reminders open WhatsApp with the message ready rather than sending automatically, and online payments are not included.

## Pages

${pages.map(p => `- [${p.title.replace(/ \| Bookable$/, '')}](${abs(p.path)}): ${p.description}`).join('\n')}

## Optional

- [Sitemap](${SITE}/sitemap.xml)
`);
write('manifest.webmanifest', JSON.stringify({ name: 'Bookable', short_name: 'Bookable', description: 'Bookings, calendar and WhatsApp reminders for one-person businesses.', id: '/app/', start_url: '/app/', scope: '/', display: 'standalone', background_color: cfg.themeColor, theme_color: cfg.themeColor, lang: 'en-GB', icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/icon-512.png', sizes: '512x512', type: 'image/png' }] }, null, 2));
write('_headers', `/*
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'

/assets/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *

/*.html
  Cache-Control: public, max-age=0, must-revalidate
`);

/* ---------- guard rails ---------- */
const files = fs.readdirSync(DIST, { recursive: true, withFileTypes: true }).filter(d => d.isFile()).map(d => path.join(d.parentPath || d.path, d.name));
for (const f of files) {
  if (f.endsWith('.map')) throw new Error('source map in output: ' + f);
  if (/\.(js|css)$/.test(f) && /sourceMappingURL/.test(fs.readFileSync(f, 'utf8'))) throw new Error('sourceMappingURL in ' + f);
}
const kb = f => (fs.statSync(f).size / 1024).toFixed(1) + ' KB';
console.log(`built ${pages.length} pages + 404 + app for ${SITE}`);
for (const u of [appJs, appCss, siteCss]) console.log('  ' + u.padEnd(34), kb(path.join(DIST, u)));
