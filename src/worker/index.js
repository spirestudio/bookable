/* Bookable API. Runs on Cloudflare Workers with a D1 (SQLite) database. Everything else is served as static assets. */
import { blogRoute, indexNow } from './blog.js';
import siteConfig from '../../site.config.json';

const enc = new TextEncoder();
const pad = n => String(n).padStart(2, '0');
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const SESSION_DAYS = 30, COOKIE = 'pencil_session';
const TRADES = ['barber', 'nails', 'dogs', 'other'];
const ACCENTS = ['sea', 'red', 'yellow', 'green', 'blue', 'pink', 'violet', 'black'];
const addDaysStr = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

class HttpError extends Error { constructor(status, code, extra) { super(code); this.status = status; this.code = code; this.extra = extra; } }
const json = (data, status = 200, headers = {}) => new Response(data === null ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export default {
  async fetch(req, env, ctx) {
    try {
      const u = new URL(req.url);
      const res = (u.pathname === '/sitemap.xml' || u.pathname === '/blog' || u.pathname.startsWith('/blog/')) ? await blogRoute(req, env, u) : (u.pathname.startsWith('/api/') ? await handle(req, env, ctx) : await env.ASSETS.fetch(req));
      if (req.method === 'GET' && res.status === 200) ctx.waitUntil(countVisit(req, env, u, res));
      return res;
    }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.code, ...(e.extra || {}) }, e.status);
      console.error('unhandled', e && e.stack || e);
      return json({ error: 'server_error' }, 500);
    }
  },
  /* daily: delete expired sign-in sessions and anti-abuse records (they hold IP addresses and booking phone numbers) older than 24 hours */
  async scheduled(event, env) {
    if (event.cron !== '7 * * * *') {      // the daily run
      await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run();
      await env.DB.prepare('DELETE FROM rl WHERE ts < ?').bind(Date.now() - 864e5).run();
      await expireDeposits(env);
      await env.DB.prepare('DELETE FROM visits WHERE day < ?').bind(dayOf(Date.now() - 120 * 864e5)).run();
    }
    try { await indexNow(env, new URL(siteConfig.url).hostname, siteConfig.indexNowKey); } catch (e) { console.error('indexnow error', e && e.message); }
  },
};

/* ---------- visit counts: public pages only, one counter per day, page and source. Nothing about the visitor is stored. ---------- */
const BOT = /bot|crawl|spider|slurp|preview|monitor|curl|wget|python|node|axios|headless|lighthouse|facebookexternalhit|whatsapp/i;
function refSource(ref, host) {
  if (!ref) return 'direct';
  let h = ''; try { h = new URL(ref).hostname.replace(/^www\./, ''); } catch { return 'other'; }
  if (h === host.replace(/^www\./, '')) return 'internal';
  if (/google\./.test(h)) return 'google'; if (/bing\.com|duckduckgo|yahoo|ecosia/.test(h)) return 'search'; if (/tiktok/.test(h)) return 'tiktok'; if (/instagram|l\.instagram/.test(h)) return 'instagram'; if (/facebook|fb\.com/.test(h)) return 'facebook'; if (/whatsapp|wa\.me/.test(h)) return 'whatsapp'; if (/github/.test(h)) return 'github'; if (/reddit/.test(h)) return 'reddit';
  return 'other';
}
async function countVisit(req, env, u, res) {
  try {
    const ct = res.headers.get('content-type') || '', p = u.pathname;
    if (!ct.includes('text/html') || /^\/(api|admin|assets|cdn-cgi)\b/.test(p) || /^\/app\/.+/.test(p) || BOT.test(req.headers.get('user-agent') || '')) return;
    const ref = refSource(req.headers.get('referer'), u.hostname); if (ref === 'internal') return;
    await env.DB.prepare('INSERT INTO visits (day, path, ref, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, path, ref) DO UPDATE SET n = n + 1').bind(dayOf(Date.now()), p.slice(0, 120), ref).run();
  } catch { /* counting must never break a page */ }
}

/* ---------- time (the business is in the UK) ---------- */
function londonNow() {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const g = t => +p.find(x => x.type === t).value;
  return { date: `${g('year')}-${pad(g('month'))}-${pad(g('day'))}`, min: g('hour') * 60 + g('minute') };
}
const dayNum = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const dow = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); };
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const validTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/* ---------- validation ---------- */
const str = (v, min, max, field) => { if (typeof v !== 'string') throw new HttpError(422, 'invalid_' + field); const s = v.trim(); if (s.length < min || s.length > max) throw new HttpError(422, 'invalid_' + field); return s; };
const int = (v, min, max, field) => { if (!Number.isInteger(v) || v < min || v > max) throw new HttpError(422, 'invalid_' + field); return v; };
const num = (v, min, max, field) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new HttpError(422, 'invalid_' + field); return Math.round(v * 100) / 100; };
const normPhone = p => { let d = String(p || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '44' + d.slice(1); return d; };

const TRADE_WORDS = { barber: 'barber barbers barbershop haircut', nails: 'nails nail technician manicure', dogs: 'dog dogs walker walking pet' };
const searchText = doc => [doc.biz.name, doc.biz.town, doc.biz.tradeLabel || '', TRADE_WORDS[doc.trade] || ''].join(' ').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/ +/g, ' ').trim();
const TRADE_LABEL = { barber: 'Barber', nails: 'Nail technician', dogs: 'Dog walker' };

function cleanDoc(d, created) {
  if (!d || typeof d !== 'object') throw new HttpError(422, 'invalid_doc');
  const b = d.biz || {};
  const slug = str(b.slug, 3, 40, 'slug');
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new HttpError(422, 'invalid_slug');
  const phone = str(b.phone, 6, 25, 'phone');
  if (normPhone(phone).replace(/\D/g, '').length < 9) throw new HttpError(422, 'invalid_phone');
  if (!TRADES.includes(d.trade)) throw new HttpError(422, 'invalid_trade');
  if (!Array.isArray(d.services) || d.services.length < 1 || d.services.length > 30) throw new HttpError(422, 'invalid_services');
  const ids = new Set();
  const services = d.services.map(s => {
    const id = str(String(s.id ?? ''), 1, 24, 'service'); if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) throw new HttpError(422, 'invalid_service_id'); ids.add(id);
    return { id, name: str(s.name, 1, 60, 'service_name'), mins: int(s.mins, 5, 480, 'service_mins'), price: num(s.price, 0, 10000, 'service_price'), desc: typeof s.desc === 'string' ? s.desc.trim().slice(0, 120) : '', hidden: s.hidden === true, deposit: s.deposit === undefined ? 0 : Math.min(num(s.deposit, 0, 10000, 'service_deposit'), num(s.price, 0, 10000, 'service_price')) };
  });
  const hours = {};
  for (let i = 0; i < 7; i++) {
    const h = (d.hours || {})[i]; if (!h || typeof h.on !== 'boolean' || !validTime(h.start) || !validTime(h.end) || toMin(h.end) <= toMin(h.start)) throw new HttpError(422, 'invalid_hours');
    hours[i] = { on: h.on, start: h.start, end: h.end };
  }
  if (!Array.isArray(d.timeOff) || d.timeOff.length > 200) throw new HttpError(422, 'invalid_time_off');
  const timeOff = d.timeOff.map(t => { if (!validDate(t.date)) throw new HttpError(422, 'invalid_time_off'); return { id: str(String(t.id ?? ''), 1, 24, 'time_off'), date: t.date, label: typeof t.label === 'string' ? t.label.trim().slice(0, 60) : '' }; });
  /* blocked times: part of a day you are not available (lunch, a personal appointment). weekly = every week on that weekday from that date */
  if (d.blocks !== undefined && (!Array.isArray(d.blocks) || d.blocks.length > 300)) throw new HttpError(422, 'invalid_blocks');
  const blocks = (d.blocks || []).map(t => {
    if (!t || !validDate(t.date) || !validTime(t.start) || !validTime(t.end) || toMin(t.end) <= toMin(t.start)) throw new HttpError(422, 'invalid_blocks');
    return { id: str(String(t.id ?? ''), 1, 24, 'block'), date: t.date, start: t.start, end: t.end, label: typeof t.label === 'string' ? t.label.trim().slice(0, 60) : '', weekly: t.weekly === true };
  });
  const r = d.rules || {};
  const rules = { lead: int(r.lead, 0, 720, 'rules'), ahead: int(r.ahead, 1, 365, 'rules'), buffer: int(r.buffer, 0, 120, 'rules'), slot: int(r.slot, 5, 120, 'rules') };
  if (![5, 10, 15, 20, 30, 45, 60, 90, 120].includes(rules.slot)) throw new HttpError(422, 'invalid_rules');
  const m = d.reminders || {};
  if (typeof m.confirm !== 'boolean' || typeof m.askConfirm !== 'boolean' || !['24', '2', 'both'].includes(m.before)) throw new HttpError(422, 'invalid_reminders');
  return {
    v: 1, created, trade: d.trade,
    biz: { name: str(b.name, 1, 80, 'name'), slug, phone, town: str(b.town, 1, 60, 'town'), intro: typeof b.intro === 'string' ? b.intro.trim().slice(0, 240) : '', accent: ACCENTS.includes(b.accent) ? b.accent : 'sea', noteLabel: typeof b.noteLabel === 'string' ? b.noteLabel.trim().slice(0, 60) : '', noteRequired: b.noteRequired === true, listed: b.listed === true, confirmMessage: typeof b.confirmMessage === 'string' ? b.confirmMessage.trim().slice(0, 240) : '', depositInfo: typeof b.depositInfo === 'string' ? b.depositInfo.trim().slice(0, 400) : '', depositHold: b.depositHold === undefined ? 2 : int(b.depositHold, 1, 48, 'deposit_hold'), ...(d.trade === 'other' ? { tradeLabel: str(b.tradeLabel, 1, 40, 'trade_label') } : {}) },
    services, hours, timeOff, blocks, rules,
    reminders: { confirm: m.confirm, before: m.before, askConfirm: m.askConfirm, template: str(m.template, 1, 400, 'template') },
  };
}

/* the same rules the app uses to list free times, applied again here so nobody can book a time that is not offered */
function slotAllowed(doc, date, start, mins, now) {
  const h = doc.hours[dow(date)];
  if (!h || !h.on || doc.timeOff.some(t => t.date === date)) return false;
  const hs = toMin(h.start), he = toMin(h.end), step = doc.rules.slot;
  if (start < hs || start + mins > he || (start - hs) % step !== 0) return false;
  if ((doc.blocks || []).some(b => (b.date === date || (b.weekly && date > b.date && dow(date) === dow(b.date))) && start < toMin(b.end) && start + mins > toMin(b.start))) return false;
  const ahead = dayNum(date) - dayNum(now.date);
  if (ahead < 0 || ahead > doc.rules.ahead) return false;
  return dayNum(date) * 1440 + start >= dayNum(now.date) * 1440 + now.min + doc.rules.lead * 60;
}

/* ---------- crypto ---------- */
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const randomToken = (n = 32) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const sha256 = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
async function hashPassword(password, salt, pepper) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt + pepper), iterations: 100000 }, key, 256));
}
const safeEqual = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

/* ---------- rate limiting ---------- */
async function isLimited(env, key, limit, windowSec) {
  const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM rl WHERE k = ? AND ts > ?').bind(key, Date.now() - windowSec * 1000).first();
  return r.c >= limit;
}
const record = (env, key) => env.DB.prepare('INSERT INTO rl (k, ts) VALUES (?, ?)').bind(key, Date.now()).run();

/* ---------- request helpers ---------- */
async function readJson(req, max = 60000) {
  const text = await req.text();
  if (text.length > max) throw new HttpError(413, 'too_large');
  try { return text ? JSON.parse(text) : {}; } catch { throw new HttpError(400, 'bad_json'); }
}
const cookieOf = req => { const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + COOKIE + '=([^;]+)')); return m ? m[1] : null; };
const setCookie = (url, token, maxAge) => `${COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${url.protocol === 'https:' ? '; Secure' : ''}`;
const clientIp = req => req.headers.get('cf-connecting-ip') || 'local';

async function userFrom(req, env) {
  const token = cookieOf(req); if (!token) return null;
  return await env.DB.prepare('SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').bind(await sha256(token), Date.now()).first();
}
/* ---------- two-factor sign-in: standard TOTP (RFC 6238), works with Google Authenticator, Microsoft Authenticator, Authy, 1Password ---------- */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32enc(bytes) { let bits = 0, val = 0, out = ''; for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; val &= (1 << bits) - 1; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
function b32dec(s) { let bits = 0, val = 0; const out = []; for (const c of String(s).replace(/[\s=]+/g, '').toUpperCase()) { const i = B32.indexOf(c); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; } } return new Uint8Array(out); }
async function hotp(secret, counter) {
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']), buf = new ArrayBuffer(8); new DataView(buf).setBigUint64(0, BigInt(counter));
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');
}
async function totpOk(secretB32, code) {
  const c = String(code || '').replace(/\s/g, ''); if (!/^\d{6}$/.test(c)) return false;
  const step = Math.floor(Date.now() / 30000), k = b32dec(secretB32); let ok = false;
  for (const d of [-1, 0, 1]) if (safeEqual(await hotp(k, step + d), c)) ok = true;
  return ok;
}
const totpKey = async env => crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', enc.encode(env.PEPPER + ':totp')), 'AES-GCM', false, ['encrypt', 'decrypt']);
async function sealSecret(env, plain) { const iv = crypto.getRandomValues(new Uint8Array(12)), ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await totpKey(env), enc.encode(plain))); return btoa(String.fromCharCode(...iv, ...ct)); }
async function openSecret(env, sealed) { const raw = Uint8Array.from(atob(sealed), c => c.charCodeAt(0)); return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: raw.slice(0, 12) }, await totpKey(env), raw.slice(12))); }
/* checks an authenticator code, or one of the saved recovery codes (each works once) */
async function secondFactorOk(env, userId, row, code) {
  const c = String(code || '').trim(); if (!c) return false;
  if (row.totp_secret && await totpOk(await openSecret(env, row.totp_secret), c)) return true;
  const list = row.totp_backup ? JSON.parse(row.totp_backup) : [], h = await sha256(c.toLowerCase().replace(/[^a-z0-9]/g, ''));
  if (list.includes(h)) { await env.DB.prepare('UPDATE users SET totp_backup = ? WHERE id = ?').bind(JSON.stringify(list.filter(x => x !== h)), userId).run(); return true; }
  return false;
}

/* a customer (not a business owner): signed in through the same cookie, but only ever matched against the clients table */
async function clientFrom(req, env) {
  const token = cookieOf(req); if (!token) return null;
  return await env.DB.prepare('SELECT c.id, c.email, c.name, c.phone FROM sessions s JOIN clients c ON c.id = s.user_id WHERE s.token_hash = ? AND s.expires > ?').bind(await sha256(token), Date.now()).first();
}
async function startSession(env, url, userId) {
  const token = randomToken();
  const maxAge = SESSION_DAYS * 86400;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, ?, ?)').bind(await sha256(token), userId, Date.now() + maxAge * 1000),
  ]);
  return { 'set-cookie': setCookie(url, token, maxAge) };
}

const rowToBooking = r => ({ id: r.id, svcId: r.svc_id, svcName: r.svc_name, mins: r.mins, price: r.price, date: r.date, time: fromMin(r.start), name: r.name, phone: r.phone, note: r.note || '', status: r.status, source: r.source, created: r.created, reminded: !!r.reminded, confirmed: !!r.confirmed, deposit: r.deposit || 0, depositPaid: !!r.deposit_paid, depositDue: r.deposit_due || 0 });

/* a deposit that is still unpaid when its hold runs out frees the slot */
const expireDeposits = (env, userId) => (userId ? env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE user_id = ? AND status = 'booked' AND deposit > 0 AND deposit_paid = 0 AND deposit_due > 0 AND deposit_due < ?").bind(userId, Date.now()) : env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE status = 'booked' AND deposit > 0 AND deposit_paid = 0 AND deposit_due > 0 AND deposit_due < ?").bind(Date.now())).run();

/* insert a booking only if it does not overlap another live booking: one statement, so two clients can never take the same slot */
async function insertIfFree(env, userId, b, buffer) {
  const end = b.start + b.mins + buffer;
  const res = await env.DB.prepare(
    `INSERT INTO bookings (id, user_id, date, start, mins, svc_id, svc_name, price, name, phone, note, status, source, created, reminded, confirmed)
     SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 0, ?15
     WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE user_id = ?2 AND date = ?3 AND status != 'cancelled' AND source != 'sample' AND start < ?16 AND start + mins + ?17 > ?4)`
  ).bind(b.id, userId, b.date, b.start, b.mins, b.svcId, b.svcName, b.price, b.name, b.phone, b.note, b.status, b.source, Date.now(), b.confirmed ? 1 : 0, end, buffer).run();
  return res.meta.changes > 0;
}

/* ---------- routes ---------- */
async function handle(req, env, ctx) {
  const url = new URL(req.url), path = url.pathname.replace(/\/+$/, ''), method = req.method;
  if (!env.PEPPER) throw new HttpError(500, 'not_configured');
  if (method !== 'GET' && method !== 'HEAD') {
    if (!(req.headers.get('content-type') || '').includes('application/json')) throw new HttpError(415, 'json_only');
    const origin = req.headers.get('origin'); if (origin && origin !== url.origin) throw new HttpError(403, 'bad_origin');
  }
  const ip = clientIp(req);

  /* ----- public: a business's booking page ----- */
  let m;
  /* ----- public (secret link): an owner's bookings as a calendar feed ----- */
  if ((m = path.match(/^\/api\/cal\/([A-Za-z0-9_-]{32,64})\.ics$/)) && method === 'GET') {
    if (await isLimited(env, 'cal404:' + ip, 30, 600)) throw new HttpError(429, 'slow_down');
    const p = await env.DB.prepare('SELECT user_id, doc FROM profiles WHERE cal_token = ?').bind(m[1]).first();
    if (!p) { await record(env, 'cal404:' + ip); throw new HttpError(404, 'not_found'); }
    const rows = (await env.DB.prepare("SELECT * FROM bookings WHERE user_id = ? AND date >= ? AND status != 'cancelled' AND source != 'sample' ORDER BY date, start LIMIT 1500").bind(p.user_id, addDaysStr(londonNow().date, -30)).all()).results;
    return new Response(buildIcs(JSON.parse(p.doc), rows), { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'private, max-age=300', 'x-robots-tag': 'noindex', 'content-disposition': 'inline; filename="pencil.ics"' } });
  }

  /* ----- public: search for businesses that chose to be listed ----- */
  if (path === '/api/search' && method === 'GET') {
    if (await isLimited(env, 'search:' + ip, 60, 600)) throw new HttpError(429, 'slow_down');
    await record(env, 'search:' + ip);
    const q = (url.searchParams.get('q') || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').trim().slice(0, 50);
    const words = q.split(' ').filter(Boolean).slice(0, 5);
    const where = words.map(() => 'search LIKE ?').join(' AND ');
    const rows = (await env.DB.prepare('SELECT slug, doc FROM profiles WHERE listed = 1' + (where ? ' AND ' + where : '') + ' ORDER BY updated DESC LIMIT 20').bind(...words.map(x => '%' + x + '%')).all()).results;
    return json({ results: rows.map(r => { const d = JSON.parse(r.doc); return { name: d.biz.name, town: d.biz.town, trade: d.biz.tradeLabel || TRADE_LABEL[d.trade] || 'Business', slug: r.slug }; }) }, 200, { 'cache-control': 'no-store' });
  }
  if ((m = path.match(/^\/api\/public\/([a-z0-9-]{3,40})$/)) && method === 'GET') {
    const p = await env.DB.prepare('SELECT user_id, doc FROM profiles WHERE slug = ?').bind(m[1]).first();
    if (!p) throw new HttpError(404, 'not_found');
    await expireDeposits(env, p.user_id);
    const doc = JSON.parse(p.doc), now = londonNow(), { depositInfo, ...pubBiz } = doc.biz;
    const busy = (await env.DB.prepare("SELECT date, start, mins FROM bookings WHERE user_id = ? AND date >= ? AND status != 'cancelled' AND source != 'sample'").bind(p.user_id, now.date).all()).results.map(r => ({ date: r.date, time: fromMin(r.start), mins: r.mins }));
    return json({ doc: { trade: doc.trade, biz: pubBiz, services: doc.services.filter(s => !s.hidden).map(s => depositInfo ? s : { ...s, deposit: 0 }), hours: doc.hours, timeOff: doc.timeOff.map(t => ({ id: t.id, date: t.date })), blocks: (doc.blocks || []).map(t => ({ id: t.id, date: t.date, start: t.start, end: t.end, weekly: t.weekly })), rules: doc.rules }, busy });
  }
  if ((m = path.match(/^\/api\/public\/([a-z0-9-]{3,40})\/book$/)) && method === 'POST') {
    if (await isLimited(env, 'book:' + ip, 8, 3600)) throw new HttpError(429, 'slow_down');
    const p = await env.DB.prepare('SELECT user_id, doc FROM profiles WHERE slug = ?').bind(m[1]).first();
    if (!p) throw new HttpError(404, 'not_found');
    await expireDeposits(env, p.user_id);
    const doc = JSON.parse(p.doc), body = await readJson(req, 4000);
    const svc = doc.services.find(s => s.id === body.svcId && !s.hidden); if (!svc) throw new HttpError(422, 'invalid_service');
    if (!validDate(body.date) || !validTime(body.time)) throw new HttpError(422, 'invalid_time');
    const name = str(body.name, 1, 80, 'name'), phone = str(body.phone, 6, 25, 'phone'), note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    if (doc.biz.noteRequired && !note) throw new HttpError(422, 'note_required');
    if (normPhone(phone).replace(/\D/g, '').length < 10) throw new HttpError(422, 'invalid_phone');
    if (await isLimited(env, `bookphone:${p.user_id}:${normPhone(phone)}`, 5, 86400)) throw new HttpError(429, 'slow_down');
    const sameClient = normPhone(phone), upcoming = (await env.DB.prepare("SELECT phone FROM bookings WHERE user_id = ? AND date >= ? AND status = 'booked' AND source = 'link'").bind(p.user_id, londonNow().date).all()).results.filter(r => normPhone(r.phone) === sameClient).length;
    if (upcoming >= 3) throw new HttpError(409, 'too_many_bookings');
    const start = toMin(body.time);
    if (!slotAllowed(doc, body.date, start, svc.mins, londonNow())) throw new HttpError(409, 'taken');
    const b = { id: crypto.randomUUID(), svcId: svc.id, svcName: svc.name, mins: svc.mins, price: svc.price, date: body.date, start, name, phone, note, status: 'booked', source: 'link', confirmed: false };
    if (!(await insertIfFree(env, p.user_id, b, doc.rules.buffer))) throw new HttpError(409, 'taken');
    const who = await clientFrom(req, env);
    if (who) await env.DB.prepare('UPDATE bookings SET client_id = ? WHERE id = ?').bind(who.id, b.id).run();
    const dep = doc.biz.depositInfo && svc.deposit > 0 ? svc.deposit : 0, due = dep ? Date.now() + (doc.biz.depositHold || 2) * 36e5 : 0;
    if (dep) await env.DB.prepare('UPDATE bookings SET deposit = ?, deposit_due = ? WHERE id = ?').bind(dep, due, b.id).run();
    await Promise.all([record(env, 'book:' + ip), record(env, `bookphone:${p.user_id}:${normPhone(phone)}`)]);
    ctx.waitUntil(alertOwner(env, p.user_id, `📅 New booking: ${name} · ${svc.name} · ${niceWhen(body.date, body.time)}${dep ? ' · deposit £' + dep + ' due' : ''}`));
    return json({ booking: { ...(dep ? { deposit: dep, depositDue: due, depositInfo: doc.biz.depositInfo } : {}), id: b.id, svcName: b.svcName, mins: b.mins, price: b.price, date: b.date, time: body.time, name, phone, note } }, 201);
  }

  /* ----- admin (owner only: ADMIN_EMAIL and ADMIN_PASSWORD secrets) ----- */
  if (path.startsWith('/api/admin')) return await adminRoutes(req, env, url, path, method, ip, ctx);

  /* ----- accounts ----- */
  if (path === '/api/signup' && method === 'POST') {
    if (await isLimited(env, 'signup:' + ip, 10, 3600)) throw new HttpError(429, 'slow_down');
    const body = await readJson(req, 2000), email = str(body.email, 5, 254, 'email').toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'invalid_email');
    const password = str(body.password, 8, 200, 'password');
    if (weakPassword(password, email)) throw new HttpError(422, 'weak_password');
    const id = crypto.randomUUID(), salt = randomToken(16), hash = await hashPassword(password, salt, env.PEPPER);
    try { await env.DB.prepare('INSERT INTO users (id, email, salt, hash, created) VALUES (?, ?, ?, ?, ?)').bind(id, email, salt, hash, Date.now()).run(); }
    catch (e) { if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, 'email_taken'); throw e; }
    await record(env, 'signup:' + ip);
    ctx.waitUntil(notify(env, `🆕 New sign-up: ${maskEmail(email)}`));
    return json({ email }, 201, await startSession(env, url, id));
  }
  if (path === '/api/login' && method === 'POST') {
    const body = await readJson(req, 2000), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
    if (await isLimited(env, 'fail:' + ip, 15, 900) || await isLimited(env, 'fail:' + email, 8, 900)) throw new HttpError(429, 'slow_down');
    if (await adminCredsOk(env, email, password)) return json({ admin: true }, 200, await adminSession(env, url));
    const u = await env.DB.prepare('SELECT id, salt, hash, totp_on, totp_secret, totp_backup FROM users WHERE email = ?').bind(email).first();
    const attempt = await hashPassword(password, u ? u.salt : 'no-such-user', env.PEPPER); // same work either way
    if (!u || !safeEqual(attempt, u.hash)) { await Promise.all([record(env, 'fail:' + ip), record(env, 'fail:' + email)]); throw new HttpError(401, 'invalid_login'); }
    if (u.totp_on) {
      if (!String(body.code || '').trim()) throw new HttpError(401, 'code_required');
      if (!(await secondFactorOk(env, u.id, u, body.code))) { await Promise.all([record(env, 'fail:' + ip), record(env, 'fail:' + email)]); throw new HttpError(401, 'invalid_code'); }
    }
    ctx.waitUntil(notify(env, `🔑 Sign-in: ${maskEmail(email)}`));
    return json({ email }, 200, await startSession(env, url, u.id));
  }
  if (path === '/api/logout' && method === 'POST') {
    const t = cookieOf(req); if (t) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(t)).run();
    return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(url, '', 0), 'cache-control': 'no-store' } });
  }

  /* ----- customer accounts: keep your appointments in one place ----- */
  if (path === '/api/telegram/webhook' && method === 'POST') {
    if (!env.TELEGRAM_WEBHOOK_SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== env.TELEGRAM_WEBHOOK_SECRET) throw new HttpError(403, 'forbidden');
    const upd = await readJson(req, 8000), msg = upd && upd.message, chat = msg && msg.chat && msg.chat.id, text = msg && typeof msg.text === 'string' ? msg.text.trim() : '';
    if (!chat || msg.chat.type !== 'private') return json({ ok: true });
    const start = text.match(/^\/start(?:@\w+)?\s+([A-Za-z0-9_-]{16,64})$/);
    if (start) {
      const r = await env.DB.prepare('UPDATE users SET tg_chat = ?, tg_code = NULL WHERE tg_code = ?').bind(String(chat), start[1]).run();
      ctx.waitUntil(sendTelegram(env, chat, r.meta.changes ? '✅ Connected. You will get a message here whenever a client books through your Bookable link. Send /stop to switch this off.' : 'That link has expired. Open Bookable, go to Plan, and press Connect Telegram again.'));
    } else if (/^\/stop(@\w+)?$/.test(text)) {
      await env.DB.prepare('UPDATE users SET tg_chat = NULL WHERE tg_chat = ?').bind(String(chat)).run();
      ctx.waitUntil(sendTelegram(env, chat, 'Booking alerts are off. You can switch them back on from the Plan page in Bookable.'));
    } else ctx.waitUntil(sendTelegram(env, chat, 'This is the Bookable alerts bot. To connect it, open Bookable, go to Plan, and press Connect Telegram.'));
    return json({ ok: true });
  }
  if (path === '/api/contact' && method === 'POST') {
    if (await isLimited(env, 'contact:' + ip, 5, 3600)) throw new HttpError(429, 'slow_down');
    const body = await readJson(req, 3000);
    if (typeof body.website === 'string' && body.website) return json({ ok: true });
    const message = str(body.message, 5, 1000, 'message').replace(/\s+/g, ' ');
    const from = typeof body.email === 'string' ? body.email.trim().slice(0, 120) : '';
    if (from && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(from)) throw new HttpError(422, 'invalid_email');
    await record(env, 'contact:' + ip);
    ctx.waitUntil(notify(env, '📩 Message from the site' + (from ? ' (' + from + ')' : ' (no email left)') + ':\n' + message.slice(0, 380)));
    return json({ ok: true });
  }
  if (path.startsWith('/api/client/')) {
    if (path === '/api/client/signup' && method === 'POST') {
      if (await isLimited(env, 'csignup:' + ip, 10, 3600)) throw new HttpError(429, 'slow_down');
      const body = await readJson(req, 2000), email = str(body.email, 5, 254, 'email').toLowerCase(), name = str(body.name, 1, 80, 'name');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(422, 'invalid_email');
      const password = str(body.password, 8, 200, 'password');
      if (weakPassword(password, email)) throw new HttpError(422, 'weak_password');
      const phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 25) : '';
      const id = crypto.randomUUID(), salt = randomToken(16), hash = await hashPassword(password, salt, env.PEPPER);
      try { await env.DB.prepare('INSERT INTO clients (id, email, salt, hash, name, phone, created) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, email, salt, hash, name, phone, Date.now()).run(); }
      catch (e) { if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, 'email_taken'); throw e; }
      await record(env, 'csignup:' + ip);
      ctx.waitUntil(notify(env, `🙋 New customer sign-up: ${maskEmail(email)}`));
      return json({ email, name }, 201, await startSession(env, url, id));
    }
    if (path === '/api/client/login' && method === 'POST') {
      const body = await readJson(req, 2000), email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
      if (await isLimited(env, 'fail:' + ip, 15, 900) || await isLimited(env, 'fail:' + email, 8, 900)) throw new HttpError(429, 'slow_down');
      const u = await env.DB.prepare('SELECT id, salt, hash, name FROM clients WHERE email = ?').bind(email).first();
      const attempt = await hashPassword(password, u ? u.salt : 'no-such-user', env.PEPPER);
      if (!u || !safeEqual(attempt, u.hash)) { await Promise.all([record(env, 'fail:' + ip), record(env, 'fail:' + email)]); throw new HttpError(401, 'invalid_login'); }
      return json({ email, name: u.name }, 200, await startSession(env, url, u.id));
    }
    const cl = await clientFrom(req, env);
    if (path === '/api/client/me' && method === 'GET') {
      if (!cl) return json({ email: null });
      await expireDeposits(env);
      const rows = (await env.DB.prepare('SELECT b.*, p.slug AS slug, p.doc AS pdoc FROM bookings b LEFT JOIN profiles p ON p.user_id = b.user_id WHERE b.client_id = ? ORDER BY b.date DESC, b.start DESC LIMIT 100').bind(cl.id).all()).results;
      return json({ email: cl.email, name: cl.name, phone: cl.phone, bookings: rows.map(r => { const d = r.pdoc ? JSON.parse(r.pdoc) : null; return { ...rowToBooking(r), business: d ? d.biz.name : 'A business', slug: r.slug || '', bizPhone: d ? d.biz.phone : '' }; }), today: londonNow().date }, 200, { 'cache-control': 'no-store' });
    }
    if (!cl) throw new HttpError(401, 'signed_out');
    if (path === '/api/client/profile' && method === 'PATCH') {
      const body = await readJson(req, 1000), name = str(body.name, 1, 80, 'name'), phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 25) : '';
      await env.DB.prepare('UPDATE clients SET name = ?, phone = ? WHERE id = ?').bind(name, phone, cl.id).run();
      return json({ ok: true });
    }
    let cm;
    if ((cm = path.match(/^\/api\/client\/bookings\/([0-9a-f-]{36})\/cancel$/)) && method === 'POST') {
      const r = await env.DB.prepare("UPDATE bookings SET status = 'cancelled' WHERE id = ? AND client_id = ? AND status = 'booked' AND date >= ?").bind(cm[1], cl.id, londonNow().date).run();
      if (!r.meta.changes) throw new HttpError(404, 'not_found');
      return json({ ok: true });
    }
    if (path === '/api/client/logout-all' && method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cl.id).run();
      return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(url, '', 0), 'cache-control': 'no-store' } });
    }
    if (path === '/api/client/account' && method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('UPDATE bookings SET client_id = NULL WHERE client_id = ?').bind(cl.id), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(cl.id), env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(cl.id)]);
      return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(url, '', 0) } });
    }
    throw new HttpError(404, 'not_found');
  }

  /* ----- everything below needs a signed-in user ----- */
  const user = await userFrom(req, env);
  if (!user && path === '/api/me' && method === 'GET') return json({ email: null, doc: null, bookings: [] });
  if (!user) throw new HttpError(401, 'signed_out');

  /* once the trial is over and nothing has been paid, the owner can read their account but not change anything until the payment is recorded */
  if (method !== 'GET' && !['/api/logout', '/api/logout-all', '/api/account'].includes(path)) {
    const uRow = (await getSettings(env)).paywall === 'on' && await env.DB.prepare('SELECT created FROM users WHERE id = ?').bind(user.id).first();
    if (uRow && ['overdue', 'cancelled'].includes(billingState(uRow.created, await getBilling(env, user.id), londonNow().date).status)) throw new HttpError(402, 'payment_required');
  }

  if (path === '/api/me' && method === 'GET') {
    await expireDeposits(env, user.id);
    const p = await env.DB.prepare('SELECT doc FROM profiles WHERE user_id = ?').bind(user.id).first();
    const rows = (await env.DB.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY date, start LIMIT 3000').bind(user.id).all()).results;
    const uRow = await env.DB.prepare('SELECT created, totp_on, tg_chat FROM users WHERE id = ?').bind(user.id).first(), bs = billingState(uRow.created, await getBilling(env, user.id), londonNow().date), st = await getSettings(env);
    return json({ twofa: !!uRow.totp_on, telegram: !!uRow.tg_chat, admin: !!env.ADMIN_EMAIL && user.email.toLowerCase() === env.ADMIN_EMAIL.trim().toLowerCase(), email: user.email, doc: p ? JSON.parse(p.doc) : null, bookings: rows.map(rowToBooking), billing: { enforce: st.paywall === 'on', status: bs.status, plan: bs.plan, price: bs.price, paidUntil: bs.paidUntil, trialEnd: bs.trialEnd, daysLeft: bs.daysLeft, overdueDays: bs.overdueDays }, payInfo: st.payInfo });
  }
  if (path === '/api/telegram/link' && method === 'POST') {
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_WEBHOOK_SECRET) throw new HttpError(503, 'unavailable');
    if (await isLimited(env, 'tglink:' + user.id, 10, 3600)) throw new HttpError(429, 'slow_down');
    const code = randomToken(18); await env.DB.prepare('UPDATE users SET tg_code = ? WHERE id = ?').bind(code, user.id).run(); await record(env, 'tglink:' + user.id);
    return json({ url: 'https://t.me/' + (env.TELEGRAM_BOT_USERNAME || 'Pencilbooking_bot') + '?start=' + code });
  }
  if (path === '/api/telegram/unlink' && method === 'POST') { await env.DB.prepare('UPDATE users SET tg_chat = NULL, tg_code = NULL WHERE id = ?').bind(user.id).run(); return json({ ok: true }); }
  if (path === '/api/logout-all' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(url, '', 0), 'cache-control': 'no-store' } });
  }
  if (path.startsWith('/api/2fa/') && method === 'POST') {
    const body = await readJson(req, 1000), row = await env.DB.prepare('SELECT salt, hash, totp_on, totp_secret, totp_backup FROM users WHERE id = ?').bind(user.id).first();
    if (await isLimited(env, 'fail2fa:' + user.id, 8, 900)) throw new HttpError(429, 'slow_down');
    if (path === '/api/2fa/setup') {
      if (row.totp_on) throw new HttpError(409, 'already_on');
      const secret = b32enc(crypto.getRandomValues(new Uint8Array(20)));
      await env.DB.prepare('UPDATE users SET totp_secret = ?, totp_on = 0 WHERE id = ?').bind(await sealSecret(env, secret), user.id).run();
      return json({ secret, uri: 'otpauth://totp/Bookable:' + encodeURIComponent(user.email) + '?secret=' + secret + '&issuer=Bookable&digits=6&period=30' }, 200, { 'cache-control': 'no-store' });
    }
    if (path === '/api/2fa/enable') {
      if (row.totp_on) throw new HttpError(409, 'already_on');
      if (!row.totp_secret || !(await totpOk(await openSecret(env, row.totp_secret), body.code))) { await record(env, 'fail2fa:' + user.id); throw new HttpError(422, 'invalid_code'); }
      const codes = Array.from({ length: 8 }, () => { const t = b32enc(crypto.getRandomValues(new Uint8Array(5))).toLowerCase(); return t.slice(0, 4) + '-' + t.slice(4, 8); });
      await env.DB.prepare('UPDATE users SET totp_on = 1, totp_backup = ? WHERE id = ?').bind(JSON.stringify(await Promise.all(codes.map(c => sha256(c.replace(/[^a-z0-9]/g, ''))))), user.id).run();
      return json({ backup: codes }, 200, { 'cache-control': 'no-store' });
    }
    if (path === '/api/2fa/disable') {
      if (!row.totp_on) throw new HttpError(409, 'not_on');
      const pwOk = safeEqual(await hashPassword(String(body.password || ''), row.salt, env.PEPPER), row.hash);
      if (!pwOk || !(await secondFactorOk(env, user.id, row, body.code))) { await record(env, 'fail2fa:' + user.id); throw new HttpError(422, 'invalid_code'); }
      await env.DB.prepare('UPDATE users SET totp_on = 0, totp_secret = NULL, totp_backup = NULL WHERE id = ?').bind(user.id).run();
      return json({ ok: true });
    }
    throw new HttpError(404, 'not_found');
  }
  if (path === '/api/calendar/token' && method === 'POST') {
    const body = await readJson(req, 200);
    const p = await env.DB.prepare('SELECT cal_token FROM profiles WHERE user_id = ?').bind(user.id).first();
    if (!p) throw new HttpError(409, 'no_profile');
    let token = p.cal_token;
    if (!token || body.reset === true) { token = randomToken(24); await env.DB.prepare('UPDATE profiles SET cal_token = ? WHERE user_id = ?').bind(token, user.id).run(); }
    return json({ token });
  }
  if (path === '/api/profile' && method === 'PUT') {
    const body = await readJson(req, 40000);
    const existing = await env.DB.prepare('SELECT doc FROM profiles WHERE user_id = ?').bind(user.id).first();
    const doc = cleanDoc(body.doc, existing ? JSON.parse(existing.doc).created : Date.now());
    try {
      await env.DB.prepare('INSERT INTO profiles (user_id, slug, doc, updated, listed, search) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(user_id) DO UPDATE SET slug = ?2, doc = ?3, updated = ?4, listed = ?5, search = ?6').bind(user.id, doc.biz.slug, JSON.stringify(doc), Date.now(), doc.biz.listed ? 1 : 0, searchText(doc)).run();
    } catch (e) { if (/UNIQUE/i.test(String(e.message))) throw new HttpError(409, 'slug_taken'); throw e; }
    return json({ doc });
  }
  if (path === '/api/bookings' && method === 'POST') {
    const body = await readJson(req, 4000);
    const p = await env.DB.prepare('SELECT doc FROM profiles WHERE user_id = ?').bind(user.id).first(); if (!p) throw new HttpError(409, 'no_profile');
    const doc = JSON.parse(p.doc);
    let svcId = '', svcName, mins, price;
    if (body.svcId === 'custom') { svcName = str(body.svcName, 1, 60, 'svc_name'); mins = int(body.mins, 5, 480, 'mins'); price = num(body.price, 0, 10000, 'price'); }
    else {
      const svc = doc.services.find(s => s.id === body.svcId); if (!svc) throw new HttpError(422, 'invalid_service');
      svcId = svc.id; svcName = svc.name; mins = body.mins === undefined ? svc.mins : int(body.mins, 5, 480, 'mins'); price = body.price === undefined ? svc.price : num(body.price, 0, 10000, 'price');
    }
    if (!validDate(body.date) || !validTime(body.time)) throw new HttpError(422, 'invalid_time');
    let dates = [body.date];
    if (body.repeat) {
      const { every, count } = body.repeat;
      if (![7, 14, 28].includes(every) || !Number.isInteger(count) || count < 2 || count > 12) throw new HttpError(422, 'invalid_repeat');
      dates = Array.from({ length: count }, (_, k) => addDaysStr(body.date, k * every));
    }
    const name = str(body.name, 1, 80, 'name'), phone = typeof body.phone === 'string' ? body.phone.trim().slice(0, 25) : '', note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    const created = [], skipped = [];
    for (const [k, date] of dates.entries()) {
      const bk = { id: crypto.randomUUID(), svcId, svcName, mins, price, date, start: toMin(body.time), name, phone, note, status: body.status === 'done' && dates.length === 1 ? 'done' : 'booked', source: 'manual', confirmed: true };
      if (await insertIfFree(env, user.id, bk, 0)) created.push(bk.id); else skipped.push(date);
    }
    if (!created.length) throw new HttpError(409, 'overlap');
    const rows = (await env.DB.prepare(`SELECT * FROM bookings WHERE id IN (${created.map(() => '?').join(',')}) ORDER BY date, start`).bind(...created).all()).results;
    return json({ bookings: rows.map(rowToBooking), skipped }, 201);
  }
  if (path === '/api/bookings/sample' && method === 'POST') {
    const body = await readJson(req, 20000); if (!Array.isArray(body.bookings) || body.bookings.length > 20) throw new HttpError(422, 'invalid_sample');
    const stmts = body.bookings.map(x => {
      if (!validDate(x.date) || !validTime(x.time) || !['booked', 'done'].includes(x.status)) throw new HttpError(422, 'invalid_sample');
      return env.DB.prepare('INSERT INTO bookings (id, user_id, date, start, mins, svc_id, svc_name, price, name, phone, note, status, source, created, reminded, confirmed) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1)')
        .bind(crypto.randomUUID(), user.id, x.date, toMin(x.time), int(x.mins, 5, 480, 'mins'), String(x.svcId || '').slice(0, 24), str(x.svcName, 1, 60, 'svc'), num(x.price, 0, 10000, 'price'), str(x.name, 1, 80, 'name'), str(x.phone, 6, 25, 'phone'), String(x.note || '').slice(0, 200), x.status, 'sample', Date.now());
    });
    if (stmts.length) await env.DB.batch(stmts);
    const rows = (await env.DB.prepare('SELECT * FROM bookings WHERE user_id = ? ORDER BY date, start LIMIT 3000').bind(user.id).all()).results;
    return json({ bookings: rows.map(rowToBooking) }, 201);
  }
  if (path === '/api/bookings/sample' && method === 'DELETE') {
    const r = await env.DB.prepare("DELETE FROM bookings WHERE user_id = ? AND source = 'sample'").bind(user.id).run();
    return json({ removed: r.meta.changes });
  }
  if ((m = path.match(/^\/api\/bookings\/([0-9a-f-]{36})$/)) && method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM bookings WHERE id = ? AND user_id = ?').bind(m[1], user.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/bookings\/([0-9a-f-]{36})$/)) && method === 'PATCH') {
    const body = await readJson(req, 1000), sets = [], vals = [];
    if (body.status !== undefined) { if (!['booked', 'done', 'cancelled'].includes(body.status)) throw new HttpError(422, 'invalid_status'); sets.push('status = ?'); vals.push(body.status); }
    if (body.depositPaid !== undefined) { if (typeof body.depositPaid !== 'boolean') throw new HttpError(422, 'invalid_depositPaid'); sets.push('deposit_paid = ?'); vals.push(body.depositPaid ? 1 : 0); }
    for (const k of ['reminded', 'confirmed']) if (body[k] !== undefined) { if (typeof body[k] !== 'boolean') throw new HttpError(422, 'invalid_' + k); sets.push(`${k} = ?`); vals.push(body[k] ? 1 : 0); }
    if (!sets.length) throw new HttpError(422, 'nothing_to_change');
    const r = await env.DB.prepare(`UPDATE bookings SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...vals, m[1], user.id).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ ok: true });
  }
  if (path === '/api/account' && method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM bookings WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM profiles WHERE user_id = ?').bind(user.id),
      env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM billing WHERE user_id = ?').bind(user.id), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(user.id),
    ]);
    return new Response(null, { status: 204, headers: { 'set-cookie': setCookie(url, '', 0), 'cache-control': 'no-store' } });
  }
  throw new HttpError(404, 'not_found');
}

/* ---------- admin (owner only) ---------- */
const ADMIN_COOKIE = 'pencil_admin';
const adminCookie = (url, token, maxAge) => `${ADMIN_COOKIE}=${token}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Strict${url.protocol === 'https:' ? '; Secure' : ''}`;
const adminToken = req => { const m = (req.headers.get('cookie') || '').match(new RegExp('(?:^|; )' + ADMIN_COOKIE + '=([^;]+)')); return m ? m[1] : null; };
async function isAdmin(req, env) {
  const t = adminToken(req); if (!t) return false;
  return !!(await env.DB.prepare("SELECT 1 AS x FROM sessions WHERE token_hash = ? AND user_id = 'admin' AND expires > ?").bind(await sha256(t), Date.now()).first());
}
const dayOf = ms => new Date(ms).toISOString().slice(0, 10);
const lastDays = (n, rows) => { const map = new Map(rows.map(r => [r.d, r.c])), out = []; for (let i = n - 1; i >= 0; i--) { const d = dayOf(Date.now() - i * 864e5); out.push({ d, c: map.get(d) || 0 }); } return out; };
/* ---------- calendar feed: a private link (webcal) that puts an owner's bookings into Google, Apple or any phone calendar ---------- */
function londonToUtcMs(dateStr, min) {
  const [y, m, d] = dateStr.split('-').map(Number), want = Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60);
  let guess = want;
  for (let i = 0; i < 2; i++) {   // London is UTC or UTC+1: nudge the guess until London's clock shows the wanted time
    const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(guess)), g = t => +p.find(x => x.type === t).value;
    guess += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
  }
  return guess;
}
const icsDate = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsEsc = s => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function icsFold(line) {   // lines are folded at 75 bytes
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const n = enc.encode(ch).length; if (bytes + n > 75) { out.push(cur); cur = ' '; bytes = 1; } cur += ch; bytes += n; }
  out.push(cur); return out.join('\r\n');
}
function buildIcs(doc, rows) {
  const stamp = icsDate(Date.now());
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookable//Bookings//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + icsEsc('Bookable: ' + doc.biz.name), 'X-WR-TIMEZONE:Europe/London', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const r of rows) {
    const s = londonToUtcMs(r.date, r.start), e = s + r.mins * 60000;
    const desc = ['Client: ' + r.name, 'Phone: ' + r.phone, r.note ? 'Note: ' + r.note : '', 'Price: £' + r.price].filter(Boolean).join('\n');
    L.push('BEGIN:VEVENT', 'UID:' + r.id + '@pencil', 'DTSTAMP:' + stamp, 'LAST-MODIFIED:' + icsDate(r.created), 'DTSTART:' + icsDate(s), 'DTEND:' + icsDate(e), 'SUMMARY:' + icsEsc(r.svc_name + ': ' + r.name), 'DESCRIPTION:' + icsEsc(desc), 'STATUS:CONFIRMED', 'TRANSP:OPAQUE',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEsc(r.svc_name + ' with ' + r.name + ' in 1 hour'), 'TRIGGER:-PT60M', 'END:VALARM', 'END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(icsFold).join('\r\n') + '\r\n';
}

/* ---------- owner alerts on Telegram (secrets TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID). Only a masked email, a business name
   and an amount are ever sent; no client names, phone numbers or booking details. Skipped silently if the secrets are not set. ---------- */
async function sendTelegram(env, chatId, text) {
  if (!env.TELEGRAM_BOT_TOKEN) return;
  try { await fetch(`${env.TELEGRAM_API || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: String(text).slice(0, 500), disable_web_page_preview: true }), signal: AbortSignal.timeout(4000) }); } catch { /* alerts are best effort */ }
}
async function alertOwner(env, userId, text) {
  try { const r = await env.DB.prepare('SELECT tg_chat FROM users WHERE id = ?').bind(userId).first(); if (r && r.tg_chat) await sendTelegram(env, r.tg_chat, text); } catch { /* best effort */ }
}
const niceWhen = (date, time) => new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z')) + ' at ' + time;
const maskEmail = e => { const [u, d] = String(e).split('@'); return (u ? u[0] : '?') + '***@' + (d || '?'); };
async function notify(env, text) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`${env.TELEGRAM_API || 'https://api.telegram.org'}/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: String(text).slice(0, 500), disable_web_page_preview: true }), signal: AbortSignal.timeout(4000) });
  } catch (e) { console.error('telegram alert failed', e && e.message); }
}

/* ---------- billing (set from /admin; payments are recorded by hand, no card data is stored) ---------- */
const PLANS = ['standard', 'founding', 'custom', 'free', 'cancelled'];
const METHODS = ['bank', 'cash', 'card', 'other'];
const TRIAL_DAYS = 7;
const londonDateOf = ms => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms)); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const addMonthsStr = (s, n) => { const d = new Date(s + 'T00:00:00Z'), day = d.getUTCDate(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n); const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate(); d.setUTCDate(Math.min(day, last)); return d.toISOString().slice(0, 10); };
function billingState(created, b, today) {
  const plan = b ? b.plan : 'standard', price = b ? b.price : 14.99, paidUntil = (b && b.paid_until) || null;
  const trialEnd = addDaysStr(londonDateOf(created), TRIAL_DAYS);
  let status, overdueDays = 0;
  if (plan === 'free') status = 'free';
  else if (plan === 'cancelled') status = 'cancelled';
  else if (paidUntil && paidUntil >= today) status = 'paid';
  else if (today <= trialEnd) status = 'trial';
  else { status = 'overdue'; overdueDays = dayNum(today) - dayNum(paidUntil && paidUntil > trialEnd ? paidUntil : trialEnd); }
  const endsOn = status === 'paid' ? paidUntil : status === 'trial' ? trialEnd : null, daysLeft = endsOn ? dayNum(endsOn) - dayNum(today) : null;
  return { plan, price, status, paidUntil, trialEnd, overdueDays, daysLeft, dueSoon: endsOn !== null && daysLeft <= 3, note: b ? b.note : '', chased: b ? b.chased : 0 };
}
const getBilling = (env, id) => env.DB.prepare('SELECT * FROM billing WHERE user_id = ?').bind(id).first();
const SETTING_DEFAULTS = {
  payInfo: '',
  paywall: 'off',
  chaseTrial: "Hi {name}, it's Reuben from Bookable. Your free trial ends on {date}. After that it's {price} a month, no contract. {payinfo} Any questions, just ask!",
  chaseOverdue: "Hi {name}, it's Reuben from Bookable. Your {price} payment is {days} overdue. {payinfo} If you'd rather stop, just reply and I'll cancel it, no problem.",
};
async function getSettings(env) {
  const rows = (await env.DB.prepare('SELECT k, v FROM settings').all()).results, out = { ...SETTING_DEFAULTS };
  for (const r of rows) if (r.k in out) out[r.k] = r.v;
  return out;
}
/* ---------- password quality: common passwords, repeats and anything containing the email name are refused at sign-up ---------- */
const COMMON_PW = new Set(['password', 'password1', 'password12', 'password123', 'password1234', '12345678', '123456789', '1234567890', '11111111', '00000000', 'qwertyui', 'qwerty123', 'qwertyuiop', 'iloveyou', 'letmein1', 'letmein123', 'welcome1', 'welcome123', 'admin123', 'abc12345', 'abcd1234', 'passw0rd', 'p@ssw0rd', 'monkey123', 'football1', 'baseball1', 'dragon123', 'sunshine1', 'princess1', 'trustno1', 'whatever1', 'changeme1', 'changeme123', 'pencil123', 'pencilbooking', 'barber123', 'barbershop', 'dogwalker1', 'nails1234']);
function weakPassword(pw, email) {
  const p = pw.toLowerCase(), local = String(email).split('@')[0].toLowerCase();
  return COMMON_PW.has(p) || /^(.)\1+$/.test(pw) || p === String(email).toLowerCase() || (local.length >= 4 && p.includes(local));
}
const parseDoc = s => { try { return JSON.parse(s); } catch { return null; } };
/* ADMIN_CODE holds one access code, or several separated by commas (one per team member) */
async function adminCodeOk(env, code) {
  if (!env.ADMIN_CODE || typeof code !== 'string' || !code.trim()) return false;
  const given = await sha256(code.trim());
  let ok = false;
  for (const c of env.ADMIN_CODE.split(',')) if (c.trim() && safeEqual(given, await sha256(c.trim()))) ok = true;
  return ok;
}
async function adminCredsOk(env, email, password) {
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) return false;
  const [a, b, c, d] = await Promise.all([sha256(String(email || '').trim().toLowerCase()), sha256(env.ADMIN_EMAIL.trim().toLowerCase()), sha256(String(password || '')), sha256(env.ADMIN_PASSWORD)]);
  return safeEqual(a, b) && safeEqual(c, d);
}
async function adminSession(env, url) {
  const token = randomToken(), maxAge = 8 * 3600;
  await env.DB.batch([env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()), env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires) VALUES (?, 'admin', ?)").bind(await sha256(token), Date.now() + maxAge * 1000)]);
  return { 'set-cookie': adminCookie(url, token, maxAge) };
}
async function adminRoutes(req, env, url, path, method, ip, ctx) {
  if (!env.ADMIN_CODE && !(env.ADMIN_EMAIL && env.ADMIN_PASSWORD)) throw new HttpError(404, 'not_found');
  if (path === '/api/admin/login' && method === 'POST') {
    if (await isLimited(env, 'adminfail:' + ip, 5, 900) || await isLimited(env, 'adminfail:all', 30, 3600)) throw new HttpError(429, 'slow_down');
    const body = await readJson(req, 1000);
    if (!(await adminCodeOk(env, body.code)) && !(await adminCredsOk(env, body.email, body.password))) { ctx.waitUntil(notify(env, '⚠️ Wrong admin code tried on the admin panel')); await Promise.all([record(env, 'adminfail:' + ip), record(env, 'adminfail:all')]); throw new HttpError(401, 'invalid_login'); }
    if (env.ADMIN_TOTP) {
      if (!String(body.totp || '').trim()) throw new HttpError(401, 'code_required');
      if (!(await totpOk(env.ADMIN_TOTP.trim(), body.totp))) { ctx.waitUntil(notify(env, '⚠️ Wrong admin authenticator code')); await Promise.all([record(env, 'adminfail:' + ip), record(env, 'adminfail:all')]); throw new HttpError(401, 'invalid_login'); }
    }
    ctx.waitUntil(notify(env, '🔐 Admin panel sign-in'));
    return json({ ok: true }, 200, await adminSession(env, url));
  }
  if (!(await isAdmin(req, env))) throw new HttpError(401, 'not_signed_in');
  if (path === '/api/admin/logout' && method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(adminToken(req))).run();
    return json({ ok: true }, 200, { 'set-cookie': adminCookie(url, '', 0) });
  }
  if (path === '/api/admin/data' && method === 'GET') {
    const now = Date.now(), today = londonNow().date, q = (sql, ...b) => env.DB.prepare(sql).bind(...b);
    const one = async (sql, ...b) => (await q(sql, ...b).first()) || { c: 0 };
    const real = "source != 'sample'";
    const [totU, newU7, newU30, realB, upcoming, todayB, wk, active30, bySrc, byStatus, signups, bks, users, recent, sess, fails] = await Promise.all([
      one('SELECT COUNT(*) c FROM users'), one('SELECT COUNT(*) c FROM users WHERE created > ?', now - 7 * 864e5), one('SELECT COUNT(*) c FROM users WHERE created > ?', now - 30 * 864e5),
      one(`SELECT COUNT(*) c FROM bookings WHERE ${real}`),
      one(`SELECT COUNT(*) c FROM bookings WHERE ${real} AND status = 'booked' AND date >= ?`, today),
      one(`SELECT COUNT(*) c FROM bookings WHERE ${real} AND date = ? AND status != 'cancelled'`, today),
      one(`SELECT COUNT(*) c FROM bookings WHERE ${real} AND created > ?`, now - 7 * 864e5),
      one(`SELECT COUNT(DISTINCT user_id) c FROM bookings WHERE ${real} AND created > ?`, now - 30 * 864e5),
      q(`SELECT source k, COUNT(*) c FROM bookings WHERE ${real} GROUP BY source`).all(), q(`SELECT status k, COUNT(*) c FROM bookings WHERE ${real} GROUP BY status`).all(),
      q("SELECT date(created/1000,'unixepoch') d, COUNT(*) c FROM users WHERE created > ? GROUP BY d", now - 15 * 864e5).all(),
      q(`SELECT date(created/1000,'unixepoch') d, COUNT(*) c FROM bookings WHERE ${real} AND created > ? GROUP BY d`, now - 15 * 864e5).all(),
      q(`SELECT u.id, u.email, u.created, p.slug, p.doc, (SELECT COUNT(*) FROM bookings b WHERE b.user_id = u.id AND b.${real}) AS bookings, (SELECT MAX(created) FROM bookings b WHERE b.user_id = u.id AND b.${real}) AS last FROM users u LEFT JOIN profiles p ON p.user_id = u.id ORDER BY u.created DESC LIMIT 500`).all(),
      q(`SELECT b.id, b.date, b.start, b.svc_name, b.price, b.status, b.source, b.created, p.doc FROM bookings b LEFT JOIN profiles p ON p.user_id = b.user_id WHERE b.${real} ORDER BY b.created DESC LIMIT 60`).all(),
      one("SELECT COUNT(*) c FROM sessions WHERE user_id != 'admin' AND expires > ?", now), one("SELECT COUNT(*) c FROM rl WHERE k LIKE '%fail:%' AND ts > ?", now - 864e5),
    ]);
    const trades = {};
    const outUsers = users.results.map(u => {
      const d = parseDoc(u.doc), t = d ? (d.trade === 'other' ? (d.biz.tradeLabel || 'other') : d.trade) : null; if (t) trades[t] = (trades[t] || 0) + 1;
      return { id: u.id, email: u.email, created: u.created, slug: u.slug, business: d ? d.biz.name : null, trade: t, town: d ? d.biz.town : null, bookings: u.bookings, last: u.last, trialLeft: Math.max(0, 14 - Math.floor((now - u.created) / 864e5)) };
    });
    const billRows = new Map((await q('SELECT * FROM billing').all()).results.map(r => [r.user_id, r]));
    for (const o of outUsers) o.billing = billingState(o.created, billRows.get(o.id), today);
    const phones = new Map(users.results.map(u => { const d = parseDoc(u.doc); return [u.id, d ? d.biz.phone : null]; }));
    for (const o of outUsers) o.phone = phones.get(o.id) || null;
    const payRows = (await q('SELECT p.id, p.user_id, p.amount, p.method, p.paid_on, p.note, p.created, pr.doc FROM payments p LEFT JOIN profiles pr ON pr.user_id = p.user_id ORDER BY p.created DESC LIMIT 60').all()).results;
    const collected = (await one('SELECT COALESCE(SUM(amount), 0) c FROM payments WHERE paid_on >= ?', today.slice(0, 8) + '01')).c;
    const sum = st => outUsers.filter(o => o.billing.status === st);
    const money = list => Math.round(list.reduce((a, o) => a + o.billing.price, 0) * 100) / 100;
    const bill = { paying: sum('paid').length, mrr: money(sum('paid')), trial: sum('trial').length, trialValue: money(sum('trial')), overdue: sum('overdue').length, owed: money(sum('overdue')), free: sum('free').length, cancelled: sum('cancelled').length, collected: Math.round(collected * 100) / 100 };
    const vis = (await q('SELECT day d, SUM(n) c FROM visits WHERE day >= ? GROUP BY day', dayOf(now - 15 * 864e5)).all()).results,
      visTop = (await q('SELECT path, SUM(n) c FROM visits WHERE day >= ? GROUP BY path ORDER BY c DESC LIMIT 8', dayOf(now - 14 * 864e5)).all()).results,
      visSrc = (await q('SELECT ref k, SUM(n) c FROM visits WHERE day >= ? GROUP BY ref ORDER BY c DESC', dayOf(now - 14 * 864e5)).all()).results;
    const settings = await getSettings(env);
    const counts = {}; for (const t of ['users', 'profiles', 'bookings', 'sessions', 'rl']) counts[t] = (await one(`SELECT COUNT(*) c FROM ${t}`)).c;
    let dbBytes = null; try { dbBytes = (await q('SELECT page_count * page_size AS c FROM pragma_page_count(), pragma_page_size()').first()).c; } catch {}
    return json({
      now, today, billing: bill, settings, payments: payRows.map(r => { const d = parseDoc(r.doc); return { id: r.id, userId: r.user_id, business: d ? d.biz.name : '(deleted)', amount: r.amount, method: r.method, paidOn: r.paid_on, note: r.note, created: r.created }; }), kpi: { users: totU.c, new7: newU7.c, new30: newU30.c, bookings: realB.c, upcoming: upcoming.c, today: todayB.c, week: wk.c, active30: active30.c, withPage: outUsers.filter(u => u.slug).length, noBookings: outUsers.filter(u => !u.bookings).length },
      visits: { perDay: lastDays(14, vis), top: visTop, sources: visSrc }, signups: lastDays(14, signups.results), bookingsPerDay: lastDays(14, bks.results), trades, bySource: bySrc.results, byStatus: byStatus.results, users: outUsers,
      recent: recent.results.map(r => { const d = parseDoc(r.doc); return { id: r.id, business: d ? d.biz.name : '?', svc: r.svc_name, price: r.price, date: r.date, time: fromMin(r.start), status: r.status, source: r.source, created: r.created }; }),
      system: { counts, dbBytes, sessions: sess.c, failedLogins24h: fails.c, config: { pepper: !!env.PEPPER, adminLogin: true, database: true } },
    });
  }
  let m;
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})$/))) {
    if (method === 'GET') {
      const u = await env.DB.prepare('SELECT u.id, u.email, u.created, p.slug, p.doc FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?').bind(m[1]).first();
      if (!u) throw new HttpError(404, 'not_found');
      const bks = (await env.DB.prepare("SELECT id, date, start, mins, svc_name, price, status, source FROM bookings WHERE user_id = ? AND source != 'sample' ORDER BY date DESC, start DESC LIMIT 40").bind(m[1]).all()).results;
      const sess = await env.DB.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ? AND expires > ?').bind(m[1], Date.now()).first();
      const d = parseDoc(u.doc);
      const billing = billingState(u.created, await getBilling(env, m[1]), londonNow().date);
      const pays = (await env.DB.prepare('SELECT id, amount, method, paid_on, note FROM payments WHERE user_id = ? ORDER BY paid_on DESC, created DESC LIMIT 30').bind(m[1]).all()).results;
      return json({ billing, payments: pays.map(p => ({ id: p.id, amount: p.amount, method: p.method, paidOn: p.paid_on, note: p.note })), id: u.id, email: u.email, created: u.created, slug: u.slug, biz: d && { name: d.biz.name, town: d.biz.town, phone: d.biz.phone }, trade: d && d.trade, services: d ? d.services.map(s => ({ name: s.name, mins: s.mins, price: s.price, hidden: !!s.hidden })) : [], sessions: sess.c, bookings: bks.map(b => ({ id: b.id, date: b.date, time: fromMin(b.start), mins: b.mins, svc: b.svc_name, price: b.price, status: b.status, source: b.source })) });
    }
    if (method === 'DELETE') {
      await env.DB.batch([env.DB.prepare('DELETE FROM bookings WHERE user_id = ?').bind(m[1]), env.DB.prepare('DELETE FROM profiles WHERE user_id = ?').bind(m[1]), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(m[1]), env.DB.prepare('DELETE FROM billing WHERE user_id = ?').bind(m[1]), env.DB.prepare('DELETE FROM users WHERE id = ?').bind(m[1])]);
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/signout$/)) && method === 'POST') {
    const r = await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(m[1]).run();
    return json({ signedOut: r.meta.changes });
  }
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/billing$/)) && method === 'PUT') {
    const body = await readJson(req, 2000);
    if (!PLANS.includes(body.plan)) throw new HttpError(422, 'invalid_plan');
    const price = body.plan === 'free' ? 0 : num(body.price, 0, 1000, 'price');
    if (body.paidUntil && !validDate(body.paidUntil)) throw new HttpError(422, 'invalid_date');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';
    const u = await env.DB.prepare('SELECT created FROM users WHERE id = ?').bind(m[1]).first(); if (!u) throw new HttpError(404, 'not_found');
    await env.DB.prepare('INSERT INTO billing (user_id, plan, price, paid_until, note, updated) VALUES (?1, ?2, ?3, ?4, ?5, ?6) ON CONFLICT(user_id) DO UPDATE SET plan = ?2, price = ?3, paid_until = ?4, note = ?5, updated = ?6').bind(m[1], body.plan, price, body.paidUntil || null, note, Date.now()).run();
    return json({ billing: billingState(u.created, await getBilling(env, m[1]), londonNow().date) });
  }
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/payments$/)) && method === 'POST') {
    const body = await readJson(req, 2000), today = londonNow().date;
    const amount = num(body.amount, 0.01, 10000, 'amount');
    if (!METHODS.includes(body.method)) throw new HttpError(422, 'invalid_method');
    const paidOn = body.paidOn || today; if (!validDate(paidOn) || paidOn > today) throw new HttpError(422, 'invalid_date');
    const months = body.months === undefined ? 1 : int(body.months, 0, 24, 'months');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';
    const u = await env.DB.prepare('SELECT created FROM users WHERE id = ?').bind(m[1]).first(); if (!u) throw new HttpError(404, 'not_found');
    const cur = billingState(u.created, await getBilling(env, m[1]), today);
    const base = [today, cur.trialEnd, cur.paidUntil || ''].reduce((a, b) => (b > a ? b : a)), until = months ? addMonthsStr(base, months) : cur.paidUntil;
    const id = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare('INSERT INTO payments (id, user_id, amount, method, paid_on, note, created) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, m[1], amount, body.method, paidOn, note, Date.now()),
      env.DB.prepare("INSERT INTO billing (user_id, plan, price, paid_until, updated) VALUES (?1, 'standard', 14.99, ?2, ?3) ON CONFLICT(user_id) DO UPDATE SET paid_until = ?2, plan = CASE WHEN plan = 'cancelled' THEN 'standard' ELSE plan END, updated = ?3").bind(m[1], until, Date.now()),
    ]);
    const pr = await env.DB.prepare('SELECT doc FROM profiles WHERE user_id = ?').bind(m[1]).first(), bn = (pr && parseDoc(pr.doc) && parseDoc(pr.doc).biz.name) || 'a business';
    const paidTo = until ? new Date(until + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : 'no change';
    ctx.waitUntil(notify(env, `💷 Payment recorded: £${amount} · ${body.method === 'bank' ? 'bank transfer' : body.method} · ${bn} · paid to ${paidTo}`));
    return json({ id, billing: billingState(u.created, await getBilling(env, m[1]), today) }, 201);
  }
  if ((m = path.match(/^\/api\/admin\/payments\/([0-9a-f-]{36})$/)) && method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM payments WHERE id = ?').bind(m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/password$/)) && method === 'POST') {   // support: the owner sets a new password for someone, which also signs them out everywhere
    const body = await readJson(req, 600), pw = str(body.password, 8, 200, 'password');
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(m[1]).first(); if (!u) throw new HttpError(404, 'not_found');
    const salt = randomToken(16), hash = await hashPassword(pw, salt, env.PEPPER);
    await env.DB.batch([env.DB.prepare('UPDATE users SET salt = ?, hash = ?, totp_on = 0, totp_secret = NULL, totp_backup = NULL WHERE id = ?').bind(salt, hash, m[1]), env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(m[1])]);
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/chased$/)) && method === 'POST') {
    const u = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(m[1]).first(); if (!u) throw new HttpError(404, 'not_found');
    await env.DB.prepare('INSERT INTO billing (user_id, price, chased, updated) VALUES (?1, 14.99, ?2, ?2) ON CONFLICT(user_id) DO UPDATE SET chased = ?2, updated = ?2').bind(m[1], Date.now()).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/api\/admin\/bookings\/([0-9a-f-]{36})$/)) && method === 'DELETE') {
    const r = await env.DB.prepare('DELETE FROM bookings WHERE id = ?').bind(m[1]).run();
    if (!r.meta.changes) throw new HttpError(404, 'not_found');
    return json({ ok: true });
  }
  if (path === '/api/admin/settings' && method === 'PUT') {
    const body = await readJson(req, 6000), keys = ['payInfo', 'chaseTrial', 'chaseOverdue'];
    for (const k of keys) if (typeof body[k] !== 'string' || body[k].length > 800) throw new HttpError(422, 'invalid_' + k);
    if (body.paywall !== undefined) { if (!['on', 'off'].includes(body.paywall)) throw new HttpError(422, 'invalid_paywall'); keys.push('paywall'); }
    await env.DB.batch(keys.map(k => env.DB.prepare('INSERT INTO settings (k, v) VALUES (?1, ?2) ON CONFLICT(k) DO UPDATE SET v = ?2').bind(k, body[k].trim())));
    return json({ settings: await getSettings(env) });
  }
  if (path === '/api/admin/cleanup' && method === 'POST') {
    const a = await env.DB.prepare('DELETE FROM sessions WHERE expires < ?').bind(Date.now()).run(), b = await env.DB.prepare('DELETE FROM rl WHERE ts < ?').bind(Date.now() - 864e5).run();
    return json({ sessions: a.meta.changes, rateLimits: b.meta.changes });
  }
  throw new HttpError(404, 'not_found');
}
