/* Daily blog release. Every post page exists as a static file, but this Worker only serves a post once its release
   time (UK time) on the post's date has passed. It also fills the blog index and the sitemap with released posts only. */
import { POST_META } from '../site/posts.mjs';

const toMin = t => { const [h, m] = (t || '09:00').split(':').map(Number); return h * 60 + m; };   // Europe/London time, summer and winter handled by Intl

function londonNow() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = t => +p.find(x => x.type === t).value, pad = n => String(n).padStart(2, '0');
  return { date: `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`, min: g('hour') * 60 + g('minute') };
}
const released = (p, now) => p.date < now.date || (p.date === now.date && now.min >= toMin(p.time));
const livePosts = () => { const now = londonNow(); return POST_META.filter(p => released(p, now)).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const longDate = s => { const [y, m, d] = s.split('-').map(Number); return `${d} ${MONTHS[m - 1]} ${y}`; };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const withCache = (res, seconds) => { const r = new Response(res.body, res); r.headers.set('cache-control', `public, max-age=${seconds}`); return r; };
const asset = (env, url, path) => env.ASSETS.fetch(new Request(new URL(path, url).toString()));

export async function blogRoute(req, env, url) {
  const path = url.pathname;
  if (req.method !== 'GET' && req.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });

  if (path === '/sitemap.xml') {
    const res = await asset(env, url, '/sitemap.xml'), xml = await res.text();
    const base = url.origin, posts = livePosts();
    const lines = posts.map(p => `  <url><loc>${base}/blog/${p.slug}/</loc><lastmod>${p.date}</lastmod></url>`).join('\n');
    return new Response(xml.replace('<!--BLOGURLS-->', lines), { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }

  if (path === '/blog' || path === '/blog/') {
    const res = await asset(env, url, '/blog/'), html = await res.text();
    const posts = livePosts();
    const list = posts.length
      ? posts.map(p => `<a href="/blog/${p.slug}/"><strong>${esc(p.title)}</strong><span>${longDate(p.date)}</span><i aria-hidden="true">Read →</i></a>`).join('')
      : '<p class="note">The first post goes live soon.</p>';
    return new Response(html.replace('<!--POSTS-->', list), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  }

  const m = path.match(/^\/blog\/([a-z0-9-]+)\/?$/);
  const post = m && POST_META.find(p => p.slug === m[1]);
  if (!post || !released(post, londonNow())) {
    const nf = await asset(env, url, '/404.html');
    return new Response(nf.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  }
  return withCache(await asset(env, url, `/blog/${post.slug}/`), 300);
}
