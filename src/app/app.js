/* ---------- helpers ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 9);
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const money = n => '£' + (Number.isInteger(+n) ? +n : (+n).toFixed(2));
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const fmtLong = d => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const startOf = b => { const d = parseYmd(b.date); d.setMinutes(toMin(b.time)); return d.getTime(); };
const endOf = b => startOf(b) + b.mins * 60000;
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-bookings';
const dur = m => m >= 60 && m % 60 === 0 ? `${m / 60} hr` : m > 60 ? `${Math.floor(m / 60)} hr ${m % 60} min` : `${m} min`;
const normPhone = p => { let d = String(p || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '44' + d.slice(1); return d; };
const waLink = (phone, text) => `https://wa.me/${normPhone(phone)}?text=${encodeURIComponent(text)}`;
const dayWord = dstr => { const t = ymd(new Date()); if (dstr === t) return 'today'; if (dstr === ymd(addDays(new Date(), 1))) return 'tomorrow'; return fmtLong(parseYmd(dstr)); };
const timeOpts = (sel, from = 5, to = 23) => { let o = ''; for (let m = from * 60; m <= to * 60; m += 30) o += `<option value="${fromMin(m)}"${fromMin(m) === sel ? ' selected' : ''}>${fromMin(m)}</option>`; return o; };

/* ---------- state: the server is the source of truth ---------- */
let S = null;   // the signed-in business: its settings and its bookings
let ME = null;  // the signed-in email
let TWOFA = false, TGON = false;
let BILL = null, PAYINFO = '';   // this owner's plan status and payment instructions, from /api/me
let P = null;   // a public booking page's data, as a client sees it
async function api(method, path, body) {
  try {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin', keepalive: method !== 'GET' });
    let data = null; try { data = await r.json(); } catch (e) { /* empty body */ }
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, status: 0, data: null }; }
}
const failMsg = r => r.status === 0 ? 'Could not reach Bookable. Check your connection.' : r.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : 'Something went wrong. Please try again.';
let saveTimer = 0, savedSlug = null;
const docOf = () => { const { bookings, ...doc } = S; return doc; };
function save() { if (!S || !ME) return; clearTimeout(saveTimer); saveTimer = setTimeout(flush, 500); }
async function flush() {
  clearTimeout(saveTimer); saveTimer = 0;
  if (!S || !ME) return true;
  const r = await api('PUT', '/api/profile', { doc: docOf() });
  if (r.ok) { savedSlug = S.biz.slug; S.created = r.data.doc.created; return true; }
  const code = r.data && r.data.error;
  toast(code === 'slug_taken' ? 'That link name is already taken.' : code === 'invalid_slug' ? 'Link names need at least 3 letters or numbers.' : code === 'invalid_trade_label' ? 'Tell us what kind of business you run.' : failMsg(r));
  if (code === 'slug_taken' || code === 'invalid_slug') { S.biz.slug = savedSlug; if (/#\/page/.test(location.hash)) vPage(); }
  return false;
}
async function loadMe() {
  const r = await api('GET', '/api/me');
  if (r.ok && r.data.email) { ME = r.data.email; TWOFA = !!r.data.twofa; TGON = !!r.data.telegram; BILL = r.data.billing || null; PAYINFO = r.data.payInfo || ''; S = r.data.doc ? { ...r.data.doc, bookings: r.data.bookings } : null; savedSlug = S && S.biz.slug; } else { ME = null; S = null; }
}
async function patchBooking(id, changes) {
  const b = S.bookings.find(x => x.id === id); if (!b) return false;
  const r = await api('PATCH', '/api/bookings/' + id, changes);
  if (r.ok) Object.assign(b, changes); else toast(failMsg(r));
  return r.ok;
}

const TRADES = {
  barber: { label: 'Barber', title: 'Barber', hours: [['10:00', '16:00'], [0, 0], ['09:00', '17:30'], ['09:00', '17:30'], ['09:00', '18:30'], ['09:00', '18:30'], ['09:00', '17:00']],
    intro: 'Pick a service and a time. If you need to change it, message me on WhatsApp.',
    services: [['Haircut', 30, 18], ['Skin fade', 45, 22], ['Beard trim', 20, 10], ['Haircut and beard', 60, 26]],
    notes: ['Skin fade, keep the top long', '', 'Beard trim as well', '', 'Same as last time'] },
  nails: { label: 'Nail technician', title: 'Nail technician', hours: [[0, 0], ['09:30', '18:00'], ['09:30', '18:00'], ['09:30', '18:00'], ['09:30', '19:00'], ['09:30', '18:00'], ['09:30', '16:00']],
    intro: 'Choose your set and a time. Please message me if you need to move it.',
    services: [['Gel manicure', 60, 28], ['Gel infill', 45, 24], ['Gel removal', 20, 8], ['Nail art, per set', 30, 12]],
    notes: ['Short square, nude', '', 'Removal first please', '', 'French tips'], noteLabel: 'Any design ideas?' },
  dogs: { label: 'Dog walker', title: 'Dog walker', hours: [[0, 0], ['08:00', '16:00'], ['08:00', '16:00'], ['08:00', '16:00'], ['08:00', '16:00'], ['08:00', '16:00'], ['09:00', '13:00']],
    intro: 'Pick a walk and a time. Tell me your dog’s name and anything I should know.',
    services: [['30-minute walk', 30, 12], ['1-hour walk', 60, 18], ['Drop-in visit', 20, 10], ['Group walk', 60, 14]],
    notes: ['Biscuit, golden retriever. Pulls on the lead', '', 'Mabel. Nervous around other dogs', '', 'Two dogs: Alfie and Rex'], noteLabel: 'Your dog’s name and anything I should know', noteRequired: true },
  other: { label: 'Something else', title: 'Business', hint: 'Tell us what you do below', hours: [[0, 0], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['09:00', '17:00'], ['10:00', '14:00']],
    intro: 'Pick a service and a time. If you need to change it, message me on WhatsApp.',
    services: [['Appointment', 60, 30], ['Short appointment', 30, 18]],
    notes: ['', 'First visit', '', 'Same as last time', ''] },
};
const ACCENTS = { sea: ['#0b4a6f', '#ffffff', 'Deep sea'], red: ['#8f1d2c', '#ffffff', 'Dark red'], yellow: ['#f5c518', '#111110', 'Yellow'], green: ['#30c15b', '#111110', 'Green'], blue: ['#0071e3', '#ffffff', 'Blue'], pink: ['#d8144a', '#ffffff', 'Pink'], violet: ['#7a4de0', '#ffffff', 'Violet'], black: ['#111110', '#ffffff', 'Black'] };
const AVC = ['#5e5ce6', '#ff9f0a', '#30b0c7', '#ff375f', '#34c759', '#af52de', '#0a84ff', '#ac8e68'];
const initials = nm => (String(nm).trim().split(/s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('') || '?').toUpperCase();
const avatar = (nm, big) => { let h = 0; for (const ch of String(nm)) h = (h * 31 + ch.charCodeAt(0)) | 0; return `<i class="av${big ? ' lg' : ''}" style="--av:${AVC[Math.abs(h) % AVC.length]}" aria-hidden="true">${esc(initials(nm))}</i>`; };
const GREET = d => { const h = d.getHours(); return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'; };
const applyAccent = (el, biz) => { const [c, on] = ACCENTS[biz.accent] || ACCENTS.sea; el.style.setProperty('--accent', c); el.style.setProperty('--on-accent', on); };
const tradeTitle = D => D.trade === 'other' ? (D.biz.tradeLabel || 'Business') : (TRADES[D.trade]?.title || '');

function slugBase(name) { const s = slugify(name).slice(0, 34).replace(/-+$/, ''); return s.length >= 3 ? s : s + '-bookings'; }
function buildState(trade, name, phone, town, tradeLabel) {
  const T = TRADES[trade];
  const services = T.services.map(([n, m, p]) => ({ id: uid(), name: n, mins: m, price: p, desc: '', hidden: false }));
  const hours = {};
  T.hours.forEach((h, i) => hours[i] = h[0] ? { on: true, start: h[0], end: h[1] } : { on: false, start: '09:00', end: '17:00' });
  const st = {
    v: 1, created: Date.now(), trade,
    biz: { name, slug: slugBase(name), phone, town, intro: T.intro, accent: 'sea', noteLabel: T.noteLabel || '', noteRequired: !!T.noteRequired, confirmMessage: '', depositInfo: '', depositHold: 2, ...(trade === 'other' ? { tradeLabel } : {}) },
    services, hours, timeOff: [], blocks: [],
    rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 },
    reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, this is a reminder of your {service} with {business} {day} at {time}.' },
    bookings: [],
  };
  S = st;
  return st;
}

function seedBookings(T) {
  const out = [];
  const names = [['Jamie Lowe', '07700 900101'], ['Aaliyah Morgan', '07700 900102'], ['Tom Harris', '07700 900103'], ['Priya Shah', '07700 900104'], ['Dan Walsh', '07700 900105'], ['Chloe Barnes', '07700 900106'], ['Ollie Preston', '07700 900107']];
  const now = new Date(), nowM = now.getHours() * 60 + now.getMinutes();
  const open = off => S.hours[addDays(now, off).getDay()].on;
  const next = Math.ceil((nowM + 20) / 30) * 30, th = S.hours[now.getDay()];
  const todayOk = th.on && next >= toMin(th.start) && next + 180 + 45 <= toMin(th.end);
  const days = []; for (let i = todayOk ? 0 : 1; days.length < 3 && i < 14; i++) if (open(i)) days.push(i);
  let prev = -1; while (prev > -8 && !open(prev)) prev--;
  const plan = days[0] === 0 ? [[0, next, 0], [0, next + 90, 1], [0, next + 180, 2]] : [[days[0], 10 * 60, 0], [days[0], 11 * 60 + 30, 1], [days[0], 14 * 60, 2]];
  plan.push([days[1], 10 * 60, 1], [days[1], 11 * 60 + 30, 2], [days[1], 14 * 60, 0], [days[2], 9 * 60 + 30 + 30, 3], [days[2], 13 * 60, 1], [prev, 10 * 60, 0]);
  plan.forEach(([dayOff, min, si], i) => {
    if (dayOff === undefined || min > 23 * 60 + 30) return;
    const svc = S.services[si % S.services.length], [n, p] = names[i % names.length];
    out.push({ svcId: svc.id, svcName: svc.name, mins: svc.mins, price: svc.price, date: ymd(addDays(now, dayOff)), time: fromMin(min), name: n, phone: p, note: T.notes[i % T.notes.length], status: dayOff < 0 ? 'done' : 'booked', source: i % 3 === 0 ? 'manual' : 'link' });
  });
  return out;
}
async function createBusiness(trade, name, phone, town, sample, tradeLabel) {
  const st = buildState(trade, name, phone, town, tradeLabel), base = st.biz.slug;
  let r;
  for (let n = 1; n <= 9; n++) { st.biz.slug = n === 1 ? base : `${base}-${n}`; r = await api('PUT', '/api/profile', { doc: docOf() }); if (r.status !== 409) break; }
  if (!r.ok) { S = null; const code = r.data && r.data.error; toast(code === 'invalid_phone' ? 'Check your WhatsApp number.' : code === 'invalid_trade_label' ? 'Tell us what kind of business you run.' : failMsg(r)); return false; }
  S.created = r.data.doc.created; savedSlug = S.biz.slug;
  if (sample) { const rs = await api('POST', '/api/bookings/sample', { bookings: seedBookings(TRADES[trade]) }); if (rs.ok) S.bookings = rs.data.bookings; }
  return true;
}

/* ---------- availability logic ---------- */
function slotsFor(dstr, mins, D = S) {
  const d = parseYmd(dstr), h = D.hours[d.getDay()];
  if (!h || !h.on || D.timeOff.some(t => t.date === dstr)) return [];
  const start = toMin(h.start), end = toMin(h.end), step = +D.rules.slot, buf = +D.rules.buffer;
  const busy = D.bookings.filter(b => b.date === dstr && b.status !== 'cancelled').map(b => [toMin(b.time), toMin(b.time) + b.mins + buf]);
  (D.blocks || []).forEach(k => { if (k.date === dstr || (k.weekly && dstr > k.date && parseYmd(k.date).getDay() === d.getDay())) busy.push([toMin(k.start), toMin(k.end)]); });
  const earliest = Date.now() + D.rules.lead * 3600e3, out = [];
  for (let t = start; t + mins <= end; t += step) {
    const at = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, t).getTime();
    if (at < earliest) continue;
    if (busy.some(([a, b]) => t < b && t + mins + buf > a)) continue;
    out.push(fromMin(t));
  }
  return out;
}
const bookingLink = () => location.origin + '/app/#/book/' + S.biz.slug;

/* ---------- messages ---------- */
function fillMsg(tpl, b) {
  return tpl.replace(/\{name\}/g, b.name.split(' ')[0]).replace(/\{service\}/g, b.svcName.toLowerCase()).replace(/\{business\}/g, S.biz.name).replace(/\{day\}/g, dayWord(b.date) === 'today' || dayWord(b.date) === 'tomorrow' ? dayWord(b.date) : 'on ' + dayWord(b.date)).replace(/\{time\}/g, b.time).replace(/\{price\}/g, money(b.price));
}
const reminderText = b => fillMsg(S.reminders.template, b) + (S.reminders.askConfirm ? ' Reply YES to confirm.' : '');
const confirmText = b => `Hi ${b.name.split(' ')[0]}, you're booked in for ${b.svcName.toLowerCase()} with ${S.biz.name} ${dayWord(b.date) === 'today' || dayWord(b.date) === 'tomorrow' ? dayWord(b.date) : 'on ' + dayWord(b.date)} at ${b.time}. See you then.`;
function pendingMessages() {
  const now = Date.now(), win = (S.reminders.before === '2' ? 3 : 26) * 3600e3, out = [];
  S.bookings.filter(b => b.status === 'booked' && b.source !== 'sample' && endOf(b) > now).sort((a, b) => startOf(a) - startOf(b)).forEach(b => {
    if (S.reminders.confirm && b.source === 'link' && !b.confirmed) out.push({ b, kind: 'Confirmation', text: confirmText(b), key: 'confirmed' });
    if (!b.reminded && startOf(b) - now <= win) out.push({ b, kind: 'Reminder', text: reminderText(b), key: 'reminded' });
  });
  return out;
}

const sampleBanner = () => S.bookings.some(b => b.source === 'sample') ? `<div class="notice"><span><b>These are sample bookings.</b> They are made up, to show how Bookable works, and they never block real clients.</span><button class="btn ghost sm" data-act="rmsample">Remove sample bookings</button></div>` : '';
const tagText = b => (b.status === 'done' ? 'Done' : b.deposit && !b.depositPaid && b.status === 'booked' ? 'Deposit due' : money(b.price)) + (b.source === 'sample' ? ' · Sample' : '');

/* ---------- ui plumbing ---------- */
const root = $('#root');
let calState = { tab: 'bookings', weekStart: mondayOf(new Date()), day: ymd(new Date()) };
let cf = null;

function toast(msg) {
  $$('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
}
function openModal(inner) {
  closeModal();
  const v = document.createElement('div'); v.className = 'veil'; v.id = 'veil';
  v.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${inner}</div>`;
  v.addEventListener('mousedown', e => { if (e.target === v) closeModal(); });
  document.body.appendChild(v);
  const f = $('input,select,textarea', v); if (f) f.focus();
  return v;
}
function closeModal() { $('#veil')?.remove(); }
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* Look and layout. The default is dark red on cream. /app/?theme=crimson&layout=tabs&qa=1 tries another look (yellow = the old one);
   it is remembered for this tab only, so nobody else is affected. */
const THEMES = { cream: 'Dark red on cream', crimson: 'Dark red, dark', graphite: 'Graphite', yellow: 'Yellow (old look)' }, LAYOUTS = { top: 'Top menu (phones: bottom tabs)', side: 'Side menu', tabs: 'Bottom tabs always' };
function applyDesign() {
  let d = {}; try { d = JSON.parse(sessionStorage.getItem('pencil.design') || '{}'); } catch (e) { /* none saved */ }
  const q = new URLSearchParams(location.search);
  if (q.get('theme') in THEMES) d.theme = q.get('theme');
  if (q.get('layout') in LAYOUTS) d.layout = q.get('layout');
  if (q.get('qa') === '1') d.qa = 1;
  try { sessionStorage.setItem('pencil.design', JSON.stringify(d)); } catch (e) { /* private window */ }
  const h = document.documentElement;
  const t = d.theme in THEMES ? d.theme : 'cream';
  if (t !== 'yellow') h.dataset.theme = t; else delete h.dataset.theme;
  h.dataset.layout = d.layout in LAYOUTS ? d.layout : 'top';
  const old = $('.qa'); if (old) old.remove();
  if (d.qa) {
    const p = document.createElement('div'); p.className = 'qa';
    const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${(cur || Object.keys(o)[0]) === k ? ' selected' : ''}>${v}</option>`).join('');
    p.innerHTML = `<b>Design test</b><select aria-label="Colour">${opts(THEMES, d.theme)}</select><select aria-label="Layout">${opts(LAYOUTS, d.layout)}</select>`;
    const [ts, ls] = p.querySelectorAll('select');
    const go = () => { d.theme = ts.value; d.layout = ls.value; try { sessionStorage.setItem('pencil.design', JSON.stringify(d)); } catch (e) { /* ignore */ } applyDesign(); };
    ts.onchange = ls.onchange = go; document.body.appendChild(p);
  }
}

function planLine(trialDays) {
  const b = BILL;
  if (!b) return trialDays ? `Free trial: ${trialDays} day${trialDays === 1 ? '' : 's'} left` : 'Bookable, £14.99 a month';
  if (b.status === 'free') return 'Free plan';
  if (b.status === 'paid') return 'Paid until ' + fmtShort(parseYmd(b.paidUntil));
  if (b.status === 'trial') return `Free trial: ${b.daysLeft} day${b.daysLeft === 1 ? '' : 's'} left`;
  if (b.status === 'overdue') return 'Payment due';
  return 'Plan ended';
}
const NAV = [['today', 'Today'], ['calendar', 'Calendar'], ['page', 'Booking page'], ['reminders', 'Reminders'], ['plan', 'Plan']];
const MNAV = [['today', 'Today'], ['calendar', 'Calendar'], ['page', 'Page'], ['reminders', 'Reminders'], ['plan', 'Plan']];
const NAV_ICON = {
  today: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  calendar: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
  page: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  reminders: '<path d="M6 16v-5a6 6 0 1 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  plan: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10.5h18"/>',
};
function shell(active, inner) {
  const trialDays = Math.max(0, 7 - Math.max(0, Math.floor((Date.now() - S.created) / 864e5)));
  root.innerHTML = `<div class="app">
    <header class="topbar"><a class="brand" href="#/today"><i class="mark"></i>Bookable</a>
      <nav class="nav" aria-label="Main">${NAV.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="acct"><span>${planLine(trialDays)}</span><b>${esc(S.biz.name)}</b><button class="linkbtn" data-act="signout">Sign out</button></div></header>
    <aside class="side">
      <a class="brand" href="#/today"><i class="mark"></i>Bookable</a>
      <nav class="nav" aria-label="Main">${NAV.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}">${l}</a>`).join('')}</nav>
      <div class="side-foot"><b>${esc(S.biz.name)}</b>${planLine(trialDays)}<br><br><button class="linkbtn" data-act="signout">Sign out</button></div>
    </aside>
    <div>
      <div class="mtop"><a class="brand" href="#/today"><i class="mark"></i>Bookable</a><span class="small muted">${esc(S.biz.name)}</span></div>
      <main class="page">${inner}</main>
    </div>
    <nav class="mnav" aria-label="Main">${MNAV.map(([k, l]) => `<a href="#/${k}" class="${k === active ? 'on' : ''}"><svg class="ni" viewBox="0 0 24 24" aria-hidden="true">${NAV_ICON[k]}</svg><span>${l}</span></a>`).join('')}</nav>
  </div>`;
}

/* ---------- setup ---------- */
function renderSetup() {
  document.title = 'Set up your booking page · Bookable';
  root.innerHTML = `<div class="client" style="padding-top:56px">
    <a class="brand" href="/" style="margin-bottom:44px;display:inline-flex"><i class="mark"></i>Bookable</a>
    <h1>Fewer messages.<br>Fewer missed appointments.</h1>
    <p class="muted" style="margin:16px 0 34px;font-size:16px">Set up your booking page in a minute. Clients pick a time from one link, and you stop going back and forth in DMs.</p>
    <form id="setup">
      <div class="field"><span>What do you do?</span>
        <div class="radios">${Object.entries(TRADES).map(([k, t], i) => `<label><input type="radio" name="trade" value="${k}"${i === 0 ? ' required' : ''}><span><b style="font-weight:500">${t.label}</b><br><small class="muted">${t.hint || t.services.slice(0, 3).map(s => s[0]).join(', ')}</small></span></label>`).join('')}</div></div>
      <label class="field" id="otherwrap" hidden><span>What kind of business is it?</span><input type="text" name="tradeLabel" maxlength="40" placeholder="e.g. Personal trainer"><small>This shows on your booking page, like “Personal trainer · Lichfield”.</small></label>
      <label class="field"><span>Your name or business name</span><input type="text" name="name" required autocomplete="organization" placeholder="e.g. Sam Okafor"></label>
      <label class="field"><span>Your WhatsApp number</span><input type="tel" name="phone" required autocomplete="tel" placeholder="e.g. 07123 456789"><small>Clients message you here, and reminders go out from your WhatsApp.</small></label>
      <label class="field"><span>Town</span><input type="text" name="town" required placeholder="e.g. Lichfield"></label>
      <label class="check" style="margin:4px 0 20px"><input type="checkbox" name="sample"><span><b>Show me with sample bookings</b><span>Adds a few made-up appointments so you can see how it works. You can delete them.</span></span></label>
      <button class="btn accent" style="width:100%;margin-top:6px">Create my booking page</button>
      <p class="small muted" style="margin-top:14px">Free for 7 days, then £14.99 a month. Cancel any time.</p>
    </form></div>`;
}

/* ---------- today ---------- */
function vToday() {
  const now = new Date(), today = ymd(now);
  const live = S.bookings.filter(b => b.status === 'booked' && endOf(b) > now.getTime()).sort((a, b) => startOf(a) - startOf(b));
  const nxt = live[0];
  const todays = S.bookings.filter(b => b.date === today && b.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  const wk0 = ymd(mondayOf(now)), wk1 = ymd(addDays(mondayOf(now), 6));
  const week = S.bookings.filter(b => b.status !== 'cancelled' && b.date >= wk0 && b.date <= wk1);
  const due = pendingMessages().length;
  const until = nxt ? (() => { const m = Math.round((startOf(nxt) - now.getTime()) / 60000); return m <= 0 ? 'Now' : m < 60 ? `In ${m} minute${m === 1 ? '' : 's'}` : m < 1440 && nxt.date === today ? `In ${Math.round(m / 60)} hour${Math.round(m / 60) === 1 ? '' : 's'}` : dayWord(nxt.date).replace(/^./, c => c.toUpperCase()); })() : '';
  shell('today', `
    <div class="pagehead"><div><p class="eyebrow">${fmtLong(now)}</p><h1>Today</h1><p class="greet">${GREET(now)}, ${esc(S.biz.name.split(' ')[0])}. ${todays.filter(b => b.status !== 'done').length ? `You have ${todays.filter(b => b.status !== 'done').length} left today.` : todays.length ? 'All done for today.' : 'A quiet day so far.'}</p></div><button class="btn accent" data-act="add">Add booking</button></div>
    ${sampleBanner()}
    <div class="cols"><div>
      ${nxt ? `<section class="next" aria-label="Next appointment">
        <div><h2 style="margin-bottom:8px">Next appointment</h2><div class="big">${nxt.time}</div><div class="when"><i class="dot"></i>${until}</div></div>
        <div class="nwho">${avatar(nxt.name, true)}<div><div class="who">${esc(nxt.name)}</div><div class="what">${esc(nxt.svcName)} · ${dur(nxt.mins)} · ${money(nxt.price)}</div>${nxt.note ? `<div class="note">${esc(nxt.note)}</div>` : ''}</div></div>
        <div class="actions"><a class="btn" href="${waLink(nxt.phone, 'Hi ' + nxt.name.split(' ')[0] + ', ')}" target="_blank" rel="noopener">Message on WhatsApp</a><button class="btn ghost" data-act="done" data-id="${nxt.id}">Mark as done</button><button class="btn ghost" data-act="open" data-id="${nxt.id}">Details</button></div>
      </section>` : `<section class="next" style="grid-template-columns:1fr"><div><h2 style="margin-bottom:8px">Next appointment</h2><div class="who">Nothing booked yet</div><div class="what">Share your booking link and clients can pick a time.</div></div></section>`}
      <section class="block"><h2>Today's schedule</h2>
        ${todays.length ? `<div class="rows">${todays.map(b => `<button class="row ${b.status}" data-act="open" data-id="${b.id}"><span class="t">${b.time}</span><span class="who2">${avatar(b.name)}<span><span class="n">${esc(b.name)}</span><br><span class="s">${esc(b.svcName)} · ${dur(b.mins)}</span></span></span><span class="tag ${b.status === 'done' ? 'ok' : ''}">${tagText(b)}</span></button>`).join('')}</div>` : `<p class="muted">Nothing on today.</p>`}
      </section>
    </div>
    <aside>
      <section class="block"><h2>Your booking link</h2>
        <div class="linkbox"><input type="text" readonly value="${esc(bookingLink())}" aria-label="Your booking link"><button class="btn" data-act="copylink">Copy</button></div>
        <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap"><a class="btn ghost sm" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('Book with ' + S.biz.name + ': ' + bookingLink())}">Share on WhatsApp</a><a class="btn ghost sm" href="#/book/${S.biz.slug}" target="_blank" rel="noopener">View your page</a></div>
        <p class="small muted" style="margin-top:12px">Put this in your Instagram bio and send it when someone asks for a time.</p>
      </section>
      <section class="block"><h2>This week</h2><div class="stats">
        <div class="stat"><span>Appointments</span><b>${week.length}</b></div>
        <div class="stat"><span>Booked in</span><b>${money(week.reduce((a, b) => a + (+b.price), 0))}</b></div>
        <div class="stat wide"><span>Messages to send</span><b>${due ? `<a href="#/reminders">${due}</a>` : '0'}</b></div>
      </div></section>
    </aside></div>`);
}

/* ---------- calendar ---------- */
const HH = 56;
function vCalendar() {
  const { tab } = calState;
  shell('calendar', `
    <div class="pagehead"><div><p class="eyebrow">Your week</p><h1>Calendar</h1></div><div class="acts" style="margin:0"><button class="btn ghost" data-act="sync">Sync to my phone</button><button class="btn accent" data-act="add">Add booking</button></div></div>
    ${sampleBanner()}
    <nav class="tabs"><button data-act="tab" data-tab="bookings" class="${tab === 'bookings' ? 'on' : ''}">Bookings</button><button data-act="tab" data-tab="availability" class="${tab === 'availability' ? 'on' : ''}">Set your availability</button></nav>
    ${tab === 'bookings' ? calBookings() : calAvailability()}`);
}
/* the private calendar link: Apple Calendar, Google Calendar and others subscribe to it and show every booking */
async function openSync(reset) {
  const r = await api('POST', '/api/calendar/token', reset ? { reset: true } : {});
  if (!r.ok) return toast(failMsg(r));
  const https = `${location.origin}/api/cal/${r.data.token}.ics`, webcal = https.replace(/^https?:/, 'webcal:');
  openModal(`<h2 style="font-size:24px;line-height:1.2;letter-spacing:-.02em;text-transform:none;font-weight:700;color:var(--ink);margin-bottom:8px">Bookings in your phone's calendar</h2>
    <p class="muted" style="margin-bottom:16px">Every booking appears in your own calendar with a reminder an hour before, and it updates by itself.</p>
    <div class="stack"><a class="btn accent" href="${esc(webcal)}">Add to Apple Calendar (iPhone, iPad, Mac)</a><a class="btn" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}">Add to Google Calendar</a></div>
    <label class="field" style="margin-top:18px"><span>Or paste this link into any calendar app</span><span class="linkbox"><input type="text" readonly id="synclink" value="${esc(https)}" aria-label="Your private calendar link"><button type="button" class="btn" data-act="synccopy">Copy</button></span></label>
    <p class="small muted" style="margin-top:14px">Apple Calendar picks up new bookings within about an hour. Google decides how often it checks and can take several hours, so Bookable stays the quickest place to see a new booking. Add the link on a computer once and it also shows on your Android phone.</p>
    <p class="small muted" style="margin-top:10px">Anyone with this link can see your bookings, so keep it private. If it gets out, <button type="button" class="linkbtn" data-act="syncreset">make a new link</button>; the old one stops working.</p>
    <div class="acts" style="margin-top:18px"><button type="button" class="btn ghost" data-act="close">Done</button></div>`);
}
function calBookings() {
  const ws = calState.weekStart, days = [...Array(7)].map((_, i) => addDays(ws, i)), today = ymd(new Date());
  let lo = 8 * 60, hi = 19 * 60;
  days.forEach(d => { const h = S.hours[d.getDay()]; if (h.on) { lo = Math.min(lo, Math.floor(toMin(h.start) / 60) * 60); hi = Math.max(hi, Math.ceil(toMin(h.end) / 60) * 60); } });
  S.bookings.forEach(b => { if (b.status === 'cancelled') return; const i = days.findIndex(d => ymd(d) === b.date); if (i < 0) return; lo = Math.min(lo, Math.floor(toMin(b.time) / 60) * 60); hi = Math.max(hi, Math.ceil((toMin(b.time) + b.mins) / 60) * 60); });
  const H = (hi - lo) / 60 * HH, y = m => (m - lo) / 60 * HH;
  const hourLines = []; for (let m = lo; m < hi; m += 60) hourLines.push(m);
  const cols = days.map(d => {
    const ds = ymd(d), h = S.hours[d.getDay()], off = S.timeOff.find(t => t.date === ds);
    let shade = '';
    if (!h.on || off) shade = `<div class="shade" style="top:0;height:${H}px">${off ? esc(off.label || 'Day off') : 'Closed'}</div>`;
    else shade = `<div class="shade" style="top:0;height:${y(toMin(h.start))}px"></div><div class="shade" style="top:${y(toMin(h.end))}px;height:${H - y(toMin(h.end))}px"></div>`;
    shade += (S.blocks || []).filter(k => k.date === ds || (k.weekly && ds > k.date && parseYmd(k.date).getDay() === d.getDay())).map(k => `<div class="shade" style="top:${y(toMin(k.start))}px;height:${y(toMin(k.end)) - y(toMin(k.start))}px">${esc(k.label || 'Busy')}</div>`).join('');
    const bks = S.bookings.filter(b => b.date === ds && b.status !== 'cancelled').map(b => `<button class="bk ${b.status}" data-act="open" data-id="${b.id}" style="top:${y(toMin(b.time)) + 1}px;height:${Math.max(26, b.mins / 60 * HH - 2)}px"><b>${b.time} ${esc(b.name.split(' ')[0])}</b>${b.mins >= 40 ? esc(b.svcName) : ''}</button>`).join('');
    const nowM = new Date().getHours() * 60 + new Date().getMinutes();
    const nl = ds === today && nowM > lo && nowM < hi ? `<div class="nowline" style="top:${y(nowM)}px"></div>` : '';
    return `<div class="dcol" data-act="slot" data-date="${ds}" data-lo="${lo}" style="height:${H}px">${hourLines.map(m => `<div class="hl" style="top:${y(m)}px"></div>`).join('')}${shade}${nl}${bks}</div>`;
  }).join('');
  const sel = calState.day, sd = parseYmd(sel), sh = S.hours[sd.getDay()], soff = S.timeOff.find(t => t.date === sel);
  const list = S.bookings.filter(b => b.date === sel && b.status !== 'cancelled').sort((a, b) => a.time.localeCompare(b.time));
  return `
  <div class="cal-bar"><h3>${days[0].getDate()} ${days[0].toLocaleDateString('en-GB', { month: 'short' })} to ${days[6].getDate()} ${days[6].toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</h3>
    <button class="btn ghost sm" data-act="week" data-d="-7">Previous week</button><button class="btn ghost sm" data-act="week" data-d="0">This week</button><button class="btn ghost sm" data-act="week" data-d="7">Next week</button></div>
  <div class="wk">
    <div class="wk-head"><div></div>${days.map(d => `<div class="${ymd(d) === today ? 'today' : ''}">${d.toLocaleDateString('en-GB', { weekday: 'short' })}<b>${d.getDate()}</b></div>`).join('')}</div>
    <div class="wk-body"><div class="hcol" style="height:${H}px">${hourLines.map(m => `<span style="top:${y(m)}px">${fromMin(m)}</span>`).join('')}</div>${cols}</div>
  </div>
  <div class="daylist">
    <div class="daystrip">${days.map(d => `<button data-act="day" data-date="${ymd(d)}" class="${ymd(d) === sel ? 'on' : ''}">${d.toLocaleDateString('en-GB', { weekday: 'short' })}<b>${d.getDate()}</b></button>`).join('')}</div>
    <p class="small muted" style="margin:10px 0 6px">${fmtLong(sd)} · ${soff ? esc(soff.label || 'Day off') : sh.on ? `Open ${sh.start} to ${sh.end}` : 'Closed'}</p>
    ${list.length ? `<div class="rows">${list.map(b => `<button class="row ${b.status}" data-act="open" data-id="${b.id}"><span class="t">${b.time}</span><span class="who2">${avatar(b.name)}<span><span class="n">${esc(b.name)}</span><br><span class="s">${esc(b.svcName)} · ${dur(b.mins)}</span></span></span><span class="tag">${tagText(b)}</span></button>`).join('')}</div>` : `<p class="muted" style="margin-top:14px">Nothing booked.</p>`}
  </div>
  <p class="small muted" style="margin-top:14px">Grey areas are when you're closed. Click an empty space to add a booking.</p>`;
}
function calAvailability() {
  const order = [1, 2, 3, 4, 5, 6, 0], R = S.rules;
  const sel = (path, val, opts) => `<select data-model="${path}" data-num="1">${opts.map(([v, l]) => `<option value="${v}"${+v === +val ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  return `
  <div class="cols"><div>
    <section class="block"><h2>Weekly hours</h2><div style="border-top:1px solid var(--line)">
      ${order.map(i => { const h = S.hours[i]; return `<div class="hours-row"><label class="check"><input type="checkbox" data-model="hours.${i}.on" ${h.on ? 'checked' : ''}><b>${DAYS[i]}</b></label>
        ${h.on ? `<div class="times"><select data-model="hours.${i}.start" aria-label="${DAYS[i]} opens">${timeOpts(h.start)}</select><span class="muted">to</span><select data-model="hours.${i}.end" aria-label="${DAYS[i]} closes">${timeOpts(h.end)}</select></div>` : `<span class="closed">Closed</span>`}</div>`; }).join('')}
    </div></section>
    <section class="block"><h2>Days off</h2>
      ${S.timeOff.length ? `<div style="border-top:1px solid var(--line);margin-bottom:16px">${S.timeOff.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => `<div class="offrow"><span><b style="font-weight:500">${fmtLong(parseYmd(t.date))}</b>${t.label ? ` <span class="muted">· ${esc(t.label)}</span>` : ''}</span><button class="linkbtn" data-act="rmoff" data-id="${t.id}">Remove</button></div>`).join('')}</div>` : `<p class="muted" style="margin-bottom:16px">No days off added. Clients can book any day you're open.</p>`}
      <form id="offform" class="two" style="align-items:end"><label class="field" style="margin:0"><span>Date</span><input type="date" name="date" required min="${ymd(new Date())}"></label><label class="field" style="margin:0"><span>Reason (optional)</span><input type="text" name="label" placeholder="e.g. Holiday"></label><div><button class="btn ghost">Add day off</button></div></form>
    </section>
    <section class="block"><h2>Blocked times</h2>
      <p class="muted" style="margin-bottom:12px">Not available for part of a day? Block it so clients can't book it: a lunch break, a personal appointment, the school run. Add the same thing weekly if it repeats.</p>
      ${(S.blocks || []).length ? `<div style="border-top:1px solid var(--line);margin-bottom:16px">${S.blocks.slice().sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)).map(t => `<div class="offrow"><span><b style="font-weight:500">${t.weekly ? 'Every ' + DAYS[parseYmd(t.date).getDay()] : fmtLong(parseYmd(t.date))}, ${t.start} to ${t.end}</b>${t.label ? ` <span class="muted">· ${esc(t.label)}</span>` : ''}</span><button class="linkbtn" data-act="rmblock" data-id="${t.id}">Remove</button></div>`).join('')}</div>` : ''}
      <form id="blockform" class="two" style="align-items:end"><label class="field" style="margin:0"><span>Date</span><input type="date" name="date" required min="${ymd(new Date())}"></label><label class="field" style="margin:0"><span>Label (optional)</span><input type="text" name="label" maxlength="60" placeholder="e.g. Lunch"></label>
        <label class="field" style="margin:0"><span>From</span><select name="start">${timeOpts('12:00')}</select></label><label class="field" style="margin:0"><span>To</span><select name="end">${timeOpts('13:00')}</select></label>
        <label class="check" style="grid-column:1/-1"><input type="checkbox" name="weekly"><span><b>Repeat every week on this day</b></span></label><div><button class="btn ghost">Block this time</button></div></form>
    </section>
  </div>
  <aside><section class="block"><h2>Booking rules</h2>
    <label class="field"><span>Shortest notice</span>${sel('rules.lead', R.lead, [[0, 'No notice'], [1, '1 hour'], [2, '2 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']])}<small>Stops last-minute bookings you can't make.</small></label>
    <label class="field"><span>Clients can book up to</span>${sel('rules.ahead', R.ahead, [[7, '1 week ahead'], [14, '2 weeks ahead'], [28, '4 weeks ahead'], [56, '8 weeks ahead']])}</label>
    <label class="field"><span>Gap between appointments</span>${sel('rules.buffer', R.buffer, [[0, 'None'], [5, '5 minutes'], [10, '10 minutes'], [15, '15 minutes']])}</label>
    <label class="field"><span>Start times every</span>${sel('rules.slot', R.slot, [[15, '15 minutes'], [30, '30 minutes'], [60, '1 hour']])}</label>
  </section></aside></div>`;
}

/* ---------- two-factor sign-in ---------- */
function twofaModal() {
  if (TWOFA) return openModal('<h3>Two-factor sign-in is on</h3><p class="sub">To turn it off, enter your password and a current code (or a recovery code).</p><label class="field"><span>Password</span><input type="password" id="tfpw" autocomplete="current-password"></label><label class="field"><span>Code</span><input type="text" id="tfoff" inputmode="numeric" autocomplete="one-time-code" maxlength="12"></label><p class="err" id="tferr" hidden></p><div class="acts"><button class="btn danger" data-act="twofa-off">Turn off</button><button class="btn ghost" data-act="close">Keep it on</button></div>');
  openModal('<h3>Turn on two-factor sign-in</h3><p class="sub">After your password, Bookable will ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password). It stops anyone getting into your bookings with just your password.</p><div class="acts"><button class="btn" data-act="twofa-go">Start setup</button><button class="btn ghost" data-act="close">Not now</button></div>');
}
async function twofaStart() {
  const r = await api('POST', '/api/2fa/setup', {}); if (!r.ok) return toast(failMsg(r));
  const key = r.data.secret.replace(/(.{4})/g, '$1 ').trim();
  openModal('<h3>Add Bookable to your authenticator</h3><p class="sub">1. Open your authenticator app and choose add account, then enter a setup key.<br>2. Type this key in (or on a phone tap the button).</p><pre class="codes" style="letter-spacing:.06em">' + esc(key) + '</pre><div class="acts"><a class="btn ghost" href="' + esc(r.data.uri) + '">Open in authenticator app</a></div><label class="field" style="margin-top:14px"><span>3. Enter the 6-digit code it shows</span><input type="text" id="tfcode" inputmode="numeric" autocomplete="one-time-code" maxlength="6"></label><p class="err" id="tferr" hidden></p><div class="acts"><button class="btn" data-act="twofa-enable">Turn on</button><button class="btn ghost" data-act="close">Cancel</button></div>');
}

/* ---------- booking modals ---------- */
function openDetail(id) {
  const b = S.bookings.find(x => x.id === id); if (!b) return;
  openModal(`<h3>${esc(b.name)}</h3><p class="sub">${fmtLong(parseYmd(b.date))} at ${b.time}</p>
    <div class="facts" style="margin-top:0"><div><span>Service</span><b style="font-weight:500">${esc(b.svcName)}</b></div><div><span>Length</span><b style="font-weight:500">${dur(b.mins)}</b></div><div><span>Price</span><b style="font-weight:500">${money(b.price)}</b></div><div><span>Mobile</span><a href="tel:${esc(b.phone)}">${esc(b.phone)}</a></div>${b.deposit ? `<div><span>Deposit</span><b style="font-weight:500">${money(b.deposit)} · ${b.depositPaid ? 'received' : 'waiting' + (b.depositDue ? ', held until ' + new Date(b.depositDue).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) : '')}</b></div>` : ''}${b.note ? `<div><span>Note</span><b style="font-weight:500;text-align:right">${esc(b.note)}</b></div>` : ''}</div>
    <div class="acts"><a class="btn" href="${waLink(b.phone, 'Hi ' + b.name.split(' ')[0] + ', ')}" target="_blank" rel="noopener">Message on WhatsApp</a>
    ${b.status === 'booked' && b.deposit ? `<button class="btn" data-act="dep" data-id="${b.id}" data-v="${b.depositPaid ? 0 : 1}">${b.depositPaid ? 'Deposit not received' : 'Mark deposit received'}</button>` : ''}${b.status === 'booked' ? `<button class="btn ghost" data-act="done" data-id="${b.id}">Mark as done</button><button class="btn danger" data-act="cancel1" data-id="${b.id}">Cancel booking</button>` : `<span class="tag" style="align-self:center">${b.status === 'done' ? 'Marked as done' : 'Cancelled'}</span>`}
    <button class="btn danger" data-act="del1" data-id="${b.id}">Delete booking</button><button class="btn ghost" data-act="close">Close</button></div>`);
}
const LENGTHS = [5, 10, 15, 20, 25, 30, 40, 45, 50, 60, 75, 90, 105, 120, 150, 180, 240, 300, 360, 480];
const lengthOptions = sel => (LENGTHS.includes(+sel) ? LENGTHS : [...LENGTHS, +sel].sort((a, b) => a - b)).map(m => `<option value="${m}"${+sel === m ? ' selected' : ''}>${dur(m)}</option>`).join('');
function openAdd(date, time) {
  const d = date || ymd(new Date()), first = S.services[0], clients = new Map();
  S.bookings.filter(b => b.source !== 'sample').forEach(b => clients.set(b.name.toLowerCase(), { name: b.name, phone: b.phone }));
  openModal(`<div class="mico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div><h3>Add booking</h3><p class="sub">For someone who booked by message or in person.</p>
    <div class="addprev" id="addprev"></div>
    <form id="addform">
      <p class="grp-h">Who</p>
      <label class="field"><span>Client name</span><input type="text" name="name" required autocomplete="off" list="clients" maxlength="80"></label>
      <datalist id="clients">${[...clients.values()].map(c => `<option value="${esc(c.name)}">${esc(c.phone)}</option>`).join('')}</datalist>
      <label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="off" placeholder="e.g. 07123 456789"></label>
      <p class="grp-h">What</p>
      <div class="tiles" id="svctiles">${S.services.map((s, i) => `<button type="button" class="tile${i === 0 ? ' on' : ''}" data-act="asvc" data-id="${s.id}"><b>${esc(s.name)}</b><span>${dur(s.mins)} · ${money(s.price)}</span></button>`).join('')}<button type="button" class="tile" data-act="asvc" data-id="custom"><b>Something else</b><span>Custom</span></button></div>
      <label class="field" hidden><span>Service</span><select name="svc">${S.services.map(s => `<option value="${s.id}">${esc(s.name)}${s.hidden ? ' (hidden)' : ''}</option>`).join('')}<option value="custom">Something else…</option></select></label>
      <label class="field" id="customname" hidden><span>What is it?</span><input type="text" name="svcName" maxlength="60" placeholder="e.g. Home visit"></label>
      <div class="pair"><label class="field"><span>Length</span><select name="mins">${lengthOptions(first ? first.mins : 30)}</select></label><label class="field"><span>Price (£)</span><input type="number" name="price" min="0" step="0.5" inputmode="decimal" value="${first ? first.price : ''}"></label></div>
      <p class="grp-h">When</p>
      <div class="qchips" id="qdays">${[...Array(7)].map((_, i) => { const x = addDays(new Date(), i), v = ymd(x); return `<button type="button" class="qc${v === d ? ' on' : ''}" data-act="aday" data-v="${v}"><small>${i === 0 ? 'Today' : i === 1 ? 'Tmrw' : x.toLocaleDateString('en-GB', { weekday: 'short' })}</small><b>${x.getDate()}</b></button>`; }).join('')}</div>
      <div class="qchips tm" id="qtimes">${['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'].map(t => `<button type="button" class="qc${t === (time || '10:00') ? ' on' : ''}" data-act="atime" data-v="${t}"><b>${t}</b></button>`).join('')}</div>
      <div class="pair"><label class="field"><span>Date</span><input type="date" name="date" value="${d}" required></label><label class="field"><span>Time</span><input type="time" name="time" value="${time || '10:00'}" step="300" required></label></div>
      <div class="pair"><label class="field"><span>Repeat</span><select name="every"><option value="0">Does not repeat</option><option value="7">Every week</option><option value="14">Every 2 weeks</option><option value="28">Every 4 weeks</option></select></label>
        <label class="field" id="repeatcount" hidden><span>Appointments in total</span><select name="count">${[2, 3, 4, 5, 6, 8, 10, 12].map(n => `<option value="${n}"${n === 4 ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <p class="grp-h">Extras</p>
      <label class="field"><span>Note (optional)</span><input type="text" name="note" autocomplete="off" maxlength="200"></label>
      <label class="check"><input type="checkbox" name="done"><span><b>Already done</b><span>Log an appointment that has already happened.</span></span></label>
      <label class="check" style="margin-top:14px"><input type="checkbox" name="wa" checked><span><b>Message them on WhatsApp</b><span>Opens WhatsApp with a confirmation ready to send, if you added a number.</span></span></label>
      <p class="err" id="adderr" hidden></p>
      <div class="acts" style="margin-top:6px"><button class="btn accent">Save booking</button><button type="button" class="btn ghost" data-act="close">Cancel</button></div>
    </form>`);
  addPreview();
}
/* the add-booking form reacts as you fill it in */
function addPreview() {
  const f = $('#addform'), p = $('#addprev'); if (!f || !p) return;
  const e = f.elements, nm = e.name.value.trim(), svc = e.svc.value === 'custom' ? (e.svcName.value.trim() || 'Appointment') : (S.services.find(x => x.id === e.svc.value)?.name || 'Appointment');
  const dt = e.date.value ? parseYmd(e.date.value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : 'Pick a date';
  p.innerHTML = `${avatar(nm || '?', true)}<div><b>${esc(nm || 'New client')}</b><span>${esc(svc)} · ${esc(dt)}, ${esc(e.time.value || '')}</span></div><em>${e.price.value !== '' ? money(+e.price.value) : ''}</em>`;
  $$('#qdays .qc').forEach(b => b.classList.toggle('on', b.dataset.v === e.date.value));
  $$('#qtimes .qc').forEach(b => b.classList.toggle('on', b.dataset.v === e.time.value));
  $$('#svctiles .tile').forEach(b => b.classList.toggle('on', b.dataset.id === e.svc.value));
}
function addFormChange(t) {
  const f = t.form; setTimeout(addPreview, 0);
  if (t.name === 'svc') {
    const custom = t.value === 'custom', s = S.services.find(x => x.id === t.value);
    $('#customname').hidden = !custom; f.elements.svcName.required = custom;
    f.elements.mins.innerHTML = lengthOptions(s ? s.mins : 60); f.elements.price.value = s ? s.price : '';
  } else if (t.name === 'every') {
    $('#repeatcount').hidden = t.value === '0'; f.elements.done.disabled = t.value !== '0'; if (t.value !== '0') f.elements.done.checked = false;
  }
}
function addFormFill(t) {
  const hit = [...S.bookings].reverse().find(b => b.source !== 'sample' && b.name.toLowerCase() === t.value.trim().toLowerCase());
  if (hit && !t.form.elements.phone.value) t.form.elements.phone.value = hit.phone;
}

/* ---------- booking page editor ---------- */
function vPage() {
  shell('page', `
    <div class="pagehead"><div><p class="eyebrow">What clients see</p><h1>Booking page</h1></div><a class="btn ghost" href="#/book/${S.biz.slug}" target="_blank" rel="noopener">Open your page</a></div>
    <div class="editor"><div>
      <section class="block"><h2>Your booking link</h2>
        <div class="linkbox"><input type="text" readonly value="${esc(bookingLink())}" aria-label="Your booking link"><button class="btn" data-act="copylink">Copy</button></div>
        <label class="field" style="margin-top:14px"><span>Link name</span><input type="text" data-model="biz.slug" data-slug="1" value="${esc(S.biz.slug)}" autocomplete="off"><small>Letters, numbers and dashes only.</small></label>
      </section>
      <section class="block"><h2>About you</h2>
        <div class="two"><label class="field"><span>Business type</span><select data-model="trade">${Object.entries(TRADES).map(([k, t]) => `<option value="${k}"${S.trade === k ? ' selected' : ''}>${t.label}</option>`).join('')}</select></label>
        <label class="field" id="tl" ${S.trade === 'other' ? '' : 'hidden'}><span>What kind of business?</span><input type="text" data-model="biz.tradeLabel" maxlength="40" value="${esc(S.biz.tradeLabel || '')}" placeholder="e.g. Personal trainer"></label></div>
        <label class="field"><span>Name</span><input type="text" data-model="biz.name" value="${esc(S.biz.name)}"></label>
        <div class="two"><label class="field"><span>Town</span><input type="text" data-model="biz.town" value="${esc(S.biz.town)}"></label><label class="field"><span>WhatsApp number</span><input type="tel" data-model="biz.phone" value="${esc(S.biz.phone)}"></label></div>
        <label class="field"><span>Short intro</span><textarea data-model="biz.intro" maxlength="240">${esc(S.biz.intro)}</textarea><small>One or two sentences. Say how to reach you if plans change.</small></label>
      </section>
      <section class="block"><h2>Look</h2>
        <div class="field"><span>Accent colour</span><div class="swatches" role="group" aria-label="Accent colour">${Object.entries(ACCENTS).map(([k, [c, , label]]) => `<button type="button" class="sw${(S.biz.accent || 'sea') === k ? ' on' : ''}" data-act="accent" data-v="${k}" style="--c:${c}" aria-label="${label}" aria-pressed="${(S.biz.accent || 'red') === k}"></button>`).join('')}</div><small>Used for the Book button and the confirmation tick on your page.</small></div>
      </section>
      <section class="block"><h2>Be found</h2>
        <label class="check"><input type="checkbox" data-model="biz.listed" ${S.biz.listed ? 'checked' : ''}><span><b>List me in Bookable search</b><span>Clients can look up ${esc(S.biz.name)} on the Bookable site and book from there. Only your business name, town, type and booking page are shown. Off by default.</span></span></label>
      </section>
      <section class="block"><h2>Deposits</h2>
        <label class="field"><span>How clients pay a deposit</span><textarea data-model="biz.depositInfo" maxlength="400" placeholder="e.g. Bank transfer to 12-34-56 / 12345678, name J Smith. Or pay at monzo.me/yourname">${esc(S.biz.depositInfo || '')}</textarea><small>Paste your own payment link or bank details. Bookable never touches the money. Set a deposit on a service to turn it on; leave this blank to turn deposits off.</small></label>
        <label class="field"><span>Hold the slot for (hours)</span><input type="number" min="1" max="48" data-model="biz.depositHold" data-num="1" value="${esc(S.biz.depositHold || 2)}"><small>If you have not marked the deposit as received by then, the slot is released automatically.</small></label>
      </section>
      <section class="block"><h2>Booking form</h2>
        <label class="field"><span>Question for clients</span><input type="text" data-model="biz.noteLabel" maxlength="60" value="${esc(S.biz.noteLabel || '')}" placeholder="e.g. Your dog’s name and anything I should know"><small>Leave blank to ask “Anything … should know? (optional)”.</small></label>
        <label class="check"><input type="checkbox" data-model="biz.noteRequired" ${S.biz.noteRequired ? 'checked' : ''}><span><b>Make it required</b><span>Clients must answer before they can book.</span></span></label>
      </section>
      <section class="block"><h2>After they book</h2>
        <label class="field"><span>Message on the confirmation screen</span><textarea data-model="biz.confirmMessage" maxlength="240">${esc(S.biz.confirmMessage || '')}</textarea><small>For example “Please arrive 5 minutes early.” Leave blank for none.</small></label>
      </section>
      <section class="block"><h2>Services</h2>
        <div id="svclist" style="border-top:1px solid var(--line)">${svcRows()}</div>
        <button class="btn ghost" style="margin-top:16px" data-act="addsvc">Add a service</button>
      </section>
      <p class="small muted">Opening times are in <a href="#/calendar" data-act="toavail">Calendar</a>. Changes save as you type.</p>
    </div>
    <aside><h2>How it looks on a phone</h2><div class="phone"><div class="bar">Your booking page</div><div class="screen" id="preview"></div></div></aside></div>`);
  renderPreview();
}
function svcRows() {
  return S.services.map(s => `<div class="svc-row" data-sid="${s.id}">
    <label class="field name"><span>Service</span><input type="text" data-svc="name" maxlength="60" value="${esc(s.name)}"></label>
    <label class="field"><span>Length</span><select data-svc="mins">${lengthOptions(s.mins)}</select></label>
    <label class="field"><span>Price (£)</span><input type="number" min="0" step="0.5" inputmode="decimal" data-svc="price" value="${esc(s.price)}"></label>
    <label class="field"><span>Deposit (£)</span><input type="number" min="0" max="${esc(s.price)}" step="0.5" inputmode="decimal" data-svc="deposit" value="${esc(s.deposit || 0)}"></label>
    <button class="linkbtn" style="padding-bottom:14px" data-act="rmsvc" data-id="${s.id}">Remove</button>
    <label class="field desc"><span>Description (optional)</span><input type="text" data-svc="desc" maxlength="120" value="${esc(s.desc || '')}" placeholder="e.g. Includes a hot towel finish"></label>
    <label class="check show"><input type="checkbox" data-svc="shown" ${s.hidden ? '' : 'checked'}><span><b>Show on booking page</b></span></label></div>`).join('');
}
function renderPreview() { const p = $('#preview'); if (p) { const c = document.createElement('div'); c.className = 'client pv'; p.innerHTML = ''; p.appendChild(c); clientRender(c, { preview: true }); } }

/* ---------- reminders ---------- */
function vReminders() {
  const R = S.reminders, sample = { name: 'Jamie Lowe', svcName: S.services[0]?.name || 'Haircut', date: ymd(addDays(new Date(), 1)), time: '10:00', price: S.services[0]?.price || 18 };
  const pend = pendingMessages();
  shell('reminders', `
    <div class="pagehead"><div><p class="eyebrow">WhatsApp</p><h1>Reminders</h1></div></div>
    <div class="cols"><div>
      <section class="block"><h2>Ready to send</h2>
        ${pend.length ? `<div class="rows">${pend.map((p, i) => `<div class="row" style="grid-template-columns:1fr auto"><span><span class="n">${esc(p.b.name)}</span> <span class="tag">· ${p.kind}</span><br><span class="s">${esc(p.b.svcName)}, ${dayWord(p.b.date)} at ${p.b.time}</span></span><a class="btn sm" target="_blank" rel="noopener" href="${waLink(p.b.phone, p.text)}" data-act="sent" data-id="${p.b.id}" data-key="${p.key}">Send on WhatsApp</a></div>`).join('')}</div>
        <p class="small muted" style="margin-top:12px">Tap Send and WhatsApp opens with the message written. You just press send.</p>` : `<p class="muted">Nothing to send right now. When a booking is coming up, it appears here.</p>`}
      </section>
      <section class="block"><h2>When someone books</h2>
        <label class="check"><input type="checkbox" data-model="reminders.confirm" ${R.confirm ? 'checked' : ''}><span><b>Send a confirmation</b><span>A short message with the day and time, as soon as they book.</span></span></label>
      </section>
      <section class="block"><h2>Before the appointment</h2>
        <div class="radios" role="radiogroup" aria-label="When to remind">
          ${[['24', '1 day before', 'Gives clients time to move it.'], ['2', '2 hours before', 'Best for same-day bookings.'], ['both', 'Both', 'A day before and again 2 hours before.']].map(([v, l, d]) => `<label><input type="radio" name="before" value="${v}" data-model="reminders.before" ${R.before === v ? 'checked' : ''}><span><b style="font-weight:500">${l}</b><br><small class="muted">${d}</small></span></label>`).join('')}
        </div>
        <label class="check" style="margin-top:18px"><input type="checkbox" data-model="reminders.askConfirm" ${R.askConfirm ? 'checked' : ''}><span><b>Ask them to reply YES</b><span>So you know who's coming and can offer a gap to someone else.</span></span></label>
      </section>
      <section class="block"><h2>Your message</h2>
        <label class="field"><span class="small muted" style="font-weight:400">Write it how you'd say it. Tap a name to drop it in.</span><textarea id="tpl" data-model="reminders.template" rows="4">${esc(R.template)}</textarea></label>
        <div class="chips">${['{name}', '{service}', '{day}', '{time}', '{price}', '{business}'].map(t => `<button type="button" data-act="token" data-t="${t}">${t}</button>`).join('')}</div>
      </section>
    </div>
    <aside><h2>What clients get</h2><div class="chatbg"><div class="bubble" id="bubble">${esc(reminderText(sample))}<small>09:00</small></div></div>
      <p class="small muted" style="margin-top:12px">Sent from your own WhatsApp number, so replies come straight to you.</p></aside></div>`);
}

/* ---------- plan ---------- */
function vPlan() {
  const b = BILL || { status: 'trial', plan: 'standard', price: 14.99, daysLeft: Math.min(7, Math.max(0, Math.ceil((addDays(new Date(S.created), 7) - Date.now()) / 864e5))), trialEnd: null, paidUntil: null, overdueDays: 0 };
  const price = '£' + (Math.round(b.price * 100) / 100).toString();
  const lines = {
    free: 'Your plan is free. Nothing to pay.',
    paid: `Paid up to ${b.paidUntil ? fmtShort(parseYmd(b.paidUntil)) : ''}. Then ${price} a month, no contract, cancel any time.`,
    trial: `Free for ${b.daysLeft} more day${b.daysLeft === 1 ? '' : 's'}. Then ${price} a month, no contract, cancel any time.`,
    overdue: `Your payment of ${price} is ${b.overdueDays} day${b.overdueDays === 1 ? '' : 's'} overdue. Please pay when you can, or message us if you would like to stop.`,
    cancelled: 'Your plan has ended. Message us if you would like to start again.',
  };
  const showPrice = b.status !== 'free' && b.status !== 'cancelled';
  const dueText = b.status === 'overdue' ? price : '£0.00';
  shell('plan', `
    <div class="pagehead"><div><p class="eyebrow">Billing</p><h1>Plan</h1></div></div>
    <div style="max-width:560px">
      <section class="block"><div class="price">${b.status === 'free' ? 'Free' : price}<span>${showPrice ? ' a month' : ''}</span></div>
        <p style="margin-top:14px">${lines[b.status] || lines.trial}</p></section>
      <section class="block"><h2>What's included</h2><ul class="plain"><li>Unlimited bookings and clients</li><li>Your own booking link</li><li>Calendar and availability</li><li>WhatsApp confirmations and reminders</li></ul></section>
      <section class="block"><h2>Billing</h2><div class="stats">
        <div class="stat"><span>Due now</span><b>${dueText}</b></div>
        ${b.status === 'trial' && b.trialEnd ? `<div class="stat"><span>First payment, ${fmtShort(parseYmd(b.trialEnd))}</span><b>${price}</b></div>` : ''}
        ${b.status === 'paid' && b.paidUntil ? `<div class="stat"><span>Next payment, ${fmtShort(parseYmd(b.paidUntil))}</span><b>${price}</b></div>` : ''}</div>
        ${showPrice ? `<div style="margin-top:18px"><b>How to pay</b><p class="muted" style="margin-top:6px;white-space:pre-wrap">${PAYINFO ? esc(PAYINFO) : 'Pay by bank transfer. We will message you with the details before your trial ends.'}</p>${PAYINFO ? `<p class="muted" style="margin-top:6px">Use ${esc(S.biz.name)} as the reference. We record your payment by hand, so it can take a day to show here.</p>` : ''}</div>` : ''}</section>
      <section class="block"><h2>Help and feedback</h2><p class="muted" style="margin-bottom:14px">Something not working, or an idea? Tell us and we will reply to your email.</p><button class="btn ghost" data-act="feedback">Report a problem or send feedback</button></section>
      <section class="block"><h2>Booking alerts on Telegram</h2><p class="muted" style="margin-bottom:14px">${TGON ? 'Connected. You get a message on Telegram whenever a client books through your link. Only the client name, service and time are sent.' : 'Get a Telegram message the moment a client books through your link. Free, and you can switch it off any time.'}</p><div style="display:flex;gap:10px;flex-wrap:wrap">${TGON ? '<button class="btn ghost" data-act="tg-off">Turn off alerts</button>' : '<button class="btn" data-act="tg-on">Connect Telegram</button>'}</div></section>
      <section class="block"><h2>Account</h2><p class="muted" style="margin-bottom:14px">${esc(ME || '')}</p><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn ghost" data-act="signout">Sign out</button><button class="btn ghost" data-act="signoutall">Sign out of every device</button><button class="btn ghost" data-act="twofa">${TWOFA ? 'Two-factor is on: manage' : 'Turn on two-factor sign-in'}</button><button class="btn danger" data-act="deleteacct">Delete my account</button></div></section>
    </div>`);
}

/* ---------- client booking flow ---------- */
const SCHEMA_TYPE = { barber: 'BarberShop', nails: 'NailSalon', dogs: 'ProfessionalService' };
function setHead(title, desc, ld) {
  document.title = title;
  let m = $('meta[name=description]'); if (!m) { m = document.createElement('meta'); m.name = 'description'; document.head.appendChild(m); }
  m.content = desc;
  let s = $('#ld'); if (s) s.remove();
  if (ld) { s = document.createElement('script'); s.type = 'application/ld+json'; s.id = 'ld'; s.textContent = JSON.stringify(ld); document.head.appendChild(s); }
}
let clientToken = 0;
async function renderClient(slug) {
  const token = ++clientToken;
  root.innerHTML = '<div class="client"><p class="muted" style="padding-top:40vh;text-align:center">Loading…</p></div>';
  const r = await api('GET', '/api/public/' + encodeURIComponent(slug));
  if (token !== clientToken) return;
  if (!r.ok) {
    P = null;
    const gone = r.status === 404;
    setHead('Booking page not found · Bookable', 'This booking page is not available. Check the link, or message the person who sent it.');
    root.innerHTML = `<div class="client"><a class="brand" href="/" style="margin-bottom:36px;display:inline-flex"><i class="mark"></i>Bookable</a><h1 style="font-size:28px">${gone ? 'This booking page isn\'t available' : 'We couldn\'t load this page'}</h1><p class="muted" style="margin-top:12px">${gone ? 'Check the link, or message the person who sent it.' : 'Check your connection and try again.'}</p></div>`;
    return;
  }
  P = { ...r.data.doc, bookings: r.data.busy.map(b => ({ date: b.date, time: b.time, mins: b.mins, status: 'booked' })) };
  const B = P.biz, trade = tradeTitle(P) || 'Service';
  setHead(`Book ${B.name}, ${trade} in ${B.town}`, `Book an appointment with ${B.name}, ${trade.toLowerCase()} in ${B.town}. ${P.services.map(s => `${s.name} ${money(s.price)}`).join(', ')}.`, {
    '@context': 'https://schema.org', '@type': SCHEMA_TYPE[P.trade] || 'LocalBusiness', name: B.name, description: B.intro || undefined, telephone: '+' + normPhone(B.phone),
    address: { '@type': 'PostalAddress', addressLocality: B.town, addressCountry: 'GB' }, areaServed: B.town, url: location.origin + '/app/#/book/' + B.slug,
    makesOffer: P.services.map(s => ({ '@type': 'Offer', priceCurrency: 'GBP', price: String(s.price), itemOffered: { '@type': 'Service', name: s.name } })),
  });
  cf = { step: 1, svc: null, date: null, time: null, name: '', phone: '', note: '', window: 14 };
  const cm = await api('GET', '/api/client/me'); if (cm.ok && cm.data && cm.data.email) { cf.name = cm.data.name || ''; cf.phone = cm.data.phone || ''; cf.acct = cm.data.name || cm.data.email; }
  const c = document.createElement('div'); c.className = 'client'; root.innerHTML = ''; root.appendChild(c);
  clientRender(c, {});
}
async function refreshPublic() {
  const r = await api('GET', '/api/public/' + encodeURIComponent(P.biz.slug));
  if (r.ok) P.bookings = r.data.busy.map(b => ({ date: b.date, time: b.time, mins: b.mins, status: 'booked' }));
}
function clientRender(c, { preview }) {
  const D = preview ? S : P, B = D.biz, st = preview ? { step: 1, svc: null } : cf;
  const td = D.hours && D.hours[new Date().getDay()], openNote = td && td.on ? `Open today until ${td.end}` : 'Closed today';
  const head = `<div class="c-hero"><div class="c-top">${avatar(B.name, true)}<div class="c-head"><div class="who">${esc(B.name)}</div><div class="where">${esc(tradeTitle(D))} · ${esc(B.town)}</div></div></div>${B.intro ? `<p class="c-intro">${esc(B.intro)}</p>` : ''}<div class="c-chips"><span class="chip"><i class="dot${td && td.on ? '' : ' off'}"></i>${openNote}</span><span class="chip">Confirmed on WhatsApp</span><span class="chip">Free to book</span></div></div>`;
  const svc = st.svc && D.services.find(s => s.id === st.svc);
  const sum = svc ? `<div class="summary"><span><b style="font-weight:600">${esc(svc.name)}</b> · ${dur(svc.mins)}</span><b style="font-weight:600">${money(svc.price)}</b></div>${svc.deposit > 0 ? `<p class="muted" style="margin:8px 0 0">A ${money(svc.deposit)} deposit secures this booking.</p>` : ''}` : '';
  let body = '';
  if (st.step === 1) {
    body = `<div class="steps">Step 1 of 3</div><h2 class="c-h2">Choose a service</h2>${D.services.some(s => !s.hidden) ? D.services.filter(s => !s.hidden).map(s => `<button class="svc" data-c="svc" data-id="${s.id}"><span><b>${esc(s.name)}</b><small>${dur(s.mins)}${s.desc ? ' · ' + esc(s.desc) : ''}</small></span><span class="p">${money(s.price)}<i class="chev" aria-hidden="true"></i></span></button>`).join('') : '<p class="muted">No services yet.</p>'}`;
  } else if (st.step === 2) {
    const dates = []; for (let i = 0; i <= Math.min(D.rules.ahead, st.window); i++) dates.push(ymd(addDays(new Date(), i)));
    const withSlots = dates.map(d => [d, slotsFor(d, svc.mins, D)]);
    if (!st.date) { const f = withSlots.find(([, s]) => s.length); st.date = f ? f[0] : null; }
    const cur = withSlots.find(([d]) => d === st.date);
    body = `<button class="back" data-c="back">Back</button><div class="steps">Step 2 of 3</div><h2 class="c-h2">Pick a day and time</h2>${sum}
      <div class="days" role="group" aria-label="Day">${withSlots.map(([d, s]) => { const dd = parseYmd(d); return `<button data-c="date" data-date="${d}" class="${d === st.date ? 'on' : ''}" ${s.length ? '' : 'disabled'} aria-label="${fmtLong(dd)}">${dd.toLocaleDateString('en-GB', { weekday: 'short' })}<b>${dd.getDate()}</b>${dd.toLocaleDateString('en-GB', { month: 'short' })}</button>`; }).join('')}</div>
      ${st.window < Math.min(D.rules.ahead, 56) ? `<button class="back" data-c="more" style="margin-top:-8px">Show more days</button>` : ''}
      ${cur && cur[1].length ? `<div class="slots" role="group" aria-label="Time">${cur[1].map(t => `<button data-c="time" data-time="${t}" class="${t === st.time ? 'on' : ''}">${t}</button>`).join('')}</div><button class="btn accent" style="width:100%;min-height:52px" data-c="next2" ${st.time ? '' : 'disabled'}>Continue</button>` : `<p class="muted">No times free${st.date ? '' : ' in the next ' + st.window + ' days. Try showing more days, or message ' + esc(B.name.split(' ')[0])}.</p>`}`;
  } else if (st.step === 3) {
    body = `<button class="back" data-c="back">Back</button><div class="steps">Step 3 of 3</div><h2 class="c-h2">Your details</h2>${sum}
      <div class="summary" style="margin-top:-8px"><span>${fmtLong(parseYmd(st.date))}</span><b style="font-weight:600">${st.time}</b></div>
      <form data-c="form" novalidate>
        <label class="field"><span>Your name</span><input type="text" name="name" autocomplete="name" value="${esc(st.name)}" required></label>
        <label class="field"><span>Mobile number</span><input type="tel" name="phone" autocomplete="tel" inputmode="tel" value="${esc(st.phone)}" placeholder="e.g. 07123 456789" required><small>${esc(B.name.split(' ')[0])} will message you on WhatsApp to confirm.</small></label>
        <label class="field"><span>${esc(B.noteLabel ? B.noteLabel + (B.noteRequired ? '' : ' (optional)') : `Anything ${B.name.split(' ')[0]} should know?${B.noteRequired ? '' : ' (optional)'}`)}</span><input type="text" name="note" maxlength="200" value="${esc(st.note)}"${B.noteRequired ? ' required' : ''}></label>
        <p class="err" id="cerr" hidden></p>
        <p class="muted" style="font-size:13px;margin:0 0 12px">${esc(B.name)} will see your name, number and note so they can manage your booking. Booking system by Bookable: <a href="/privacy/" target="_blank" rel="noopener">privacy policy</a>.</p>
        <button class="btn accent" style="width:100%;min-height:52px">Book appointment</button>
      </form>`;
  } else {
    const b = st.booking;
    body = `<div class="done-mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="square"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div>
      <h2 class="c-h2" style="font-size:28px">${b.deposit ? 'Pay your deposit to confirm' : 'You\'re booked in'}</h2>${b.deposit ? `<p class="muted">Your time is held for ${P.biz.depositHold || 2} hour${(P.biz.depositHold || 2) === 1 ? '' : 's'}. Pay the ${money(b.deposit)} deposit below and tell ${esc(B.name.split(' ')[0])} on WhatsApp. If it has not arrived by ${new Date(b.depositDue).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })}, the time is released.</p><p class="cmsg" style="white-space:pre-wrap">${esc(b.depositInfo)}</p>` : `<p class="muted">${esc(B.name.split(' ')[0])} will message you on WhatsApp to say hello. You can reply there if anything changes.</p>`}${B.confirmMessage ? `<p class="cmsg">${esc(B.confirmMessage)}</p>` : ''}
      <div class="facts"><div><span>Service</span><b style="font-weight:500">${esc(b.svcName)}</b></div><div><span>When</span><b style="font-weight:500">${fmtLong(parseYmd(b.date))}, ${b.time}</b></div><div><span>Length</span><b style="font-weight:500">${dur(b.mins)}</b></div><div><span>Price</span><b style="font-weight:500">${money(b.price)}</b></div></div>
      <div class="stack"><button class="btn" style="min-height:52px" data-c="ics">Add to calendar</button><a class="btn ghost" style="min-height:52px" target="_blank" rel="noopener" href="${waLink(B.phone, `Hi, it's ${b.name.split(' ')[0]}. I've booked ${b.svcName.toLowerCase()} for ${dayWord(b.date) === 'today' || dayWord(b.date) === 'tomorrow' ? dayWord(b.date) : 'on ' + dayWord(b.date)} at ${b.time}.`)}">Message ${esc(B.name.split(' ')[0])} on WhatsApp</a></div>`;
  }
  c.innerHTML = head + body + (preview ? '' : `${cf.acct ? `<p class="powered" style="margin-top:24px">Booking as ${esc(cf.acct)} · <a href="/client/">My bookings</a></p>` : ''}<div class="powered"><a href="/">Bookings by Bookable</a><span> · Take bookings yourself? <a href="/?ref=${encodeURIComponent(B.slug)}">Try Bookable free for 7 days</a></span></div>`);
  applyAccent(c, B);
  if (preview) return;
  c.onclick = e => {
    const t = e.target.closest('[data-c]'); if (!t) return;
    const k = t.dataset.c;
    if (k === 'svc') { cf.svc = t.dataset.id; cf.step = 2; cf.date = null; cf.time = null; }
    else if (k === 'back') { cf.step = cf.step === 3 ? 2 : 1; cf.time = cf.step === 1 ? null : cf.time; }
    else if (k === 'date') { cf.date = t.dataset.date; cf.time = null; }
    else if (k === 'time') { cf.time = t.dataset.time; }
    else if (k === 'more') { cf.window = Math.min(56, cf.window + 14); }
    else if (k === 'next2') { if (cf.time) cf.step = 3; }
    else if (k === 'ics') { return downloadIcs(cf.booking); }
    else return;
    clientRender(c, {}); window.scrollTo(0, 0);
  };
  c.onsubmit = async e => {
    e.preventDefault();
    const f = e.target.elements, name = f.name.value.trim(), phone = f.phone.value.trim(), err = $('#cerr', c), btn = e.target.querySelector('button.btn');
    cf.name = name; cf.phone = phone; cf.note = f.note.value.trim();
    if (!name) { err.textContent = 'Add your name.'; err.hidden = false; return; }
    if (normPhone(phone).replace(/\D/g, '').length < 10) { err.textContent = 'Add a mobile number so we can reach you.'; err.hidden = false; return; }
    if (P.biz.noteRequired && !cf.note) { err.textContent = 'Please answer the question above.'; err.hidden = false; return; }
    btn.disabled = true;
    const r = await api('POST', `/api/public/${P.biz.slug}/book`, { svcId: cf.svc, date: cf.date, time: cf.time, name, phone, note: cf.note });
    if (r.ok) {
      cf.booking = r.data.booking; P.bookings.push({ date: cf.booking.date, time: cf.booking.time, mins: cf.booking.mins, status: 'booked' });
      cf.step = 4; clientRender(c, {}); window.scrollTo(0, 0); return;
    }
    if (r.status === 409 && r.data && r.data.error === 'too_many_bookings') { btn.disabled = false; err.textContent = 'You already have 3 upcoming appointments here. Cancel one or wait until after it.'; return; }
    if (r.status === 409) {
      await refreshPublic(); cf.step = 2; cf.time = null; clientRender(c, {});
      const e2 = document.createElement('p'); e2.className = 'err'; e2.textContent = 'Sorry, that time has just been taken. Pick another.'; $('.c-h2', c).after(e2); return;
    }
    btn.disabled = false; err.textContent = r.data && r.data.error === 'note_required' ? 'Please answer the question above.' : r.status === 422 ? 'Check your name and mobile number.' : failMsg(r); err.hidden = false;
  };
}
function downloadIcs(b) {
  const d = parseYmd(b.date), s = toMin(b.time), e = s + b.mins, z = m => `${ymd(d).replace(/-/g, '')}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
  const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookable//EN', 'BEGIN:VEVENT', `UID:${b.id}@pencil`, `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d+/g, '')}`, `DTSTART:${z(s)}`, `DTEND:${z(e)}`, `SUMMARY:${b.svcName} with ${P.biz.name}`, `DESCRIPTION:WhatsApp ${P.biz.phone}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/calendar' })); a.download = 'appointment.ics'; a.click();
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t) return;
  const a = t.dataset.act, id = t.dataset.id;
  if (a === 'close') closeModal();
  else if (a === 'copylink') { const v = bookingLink(); (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => toast('Link copied'), () => { $('.linkbox input')?.select(); toast('Press Ctrl+C to copy'); }); }
  else if (a === 'add') openAdd();
  else if (a === 'sync') openSync();
  else if (a === 'syncreset') { if (t.dataset.sure) openSync(true); else { t.dataset.sure = 1; t.textContent = 'Tap again to replace the link'; } }
  else if (a === 'synccopy') { const v = $('#synclink').value; (navigator.clipboard?.writeText(v) || Promise.reject()).then(() => toast('Link copied'), () => { $('#synclink').select(); toast('Press Ctrl+C to copy'); }); }
  else if (a === 'asvc') { const sl = $('#addform').elements.svc; sl.value = id; addFormChange(sl); addPreview(); if (id === 'custom') $('#addform').elements.svcName.focus(); }
  else if (a === 'aday') { $('#addform').elements.date.value = t.dataset.v; addPreview(); }
  else if (a === 'atime') { $('#addform').elements.time.value = t.dataset.v; addPreview(); }
  else if (a === 'open') openDetail(id);
  else if (a === 'dep') { patchBooking(id, { depositPaid: t.dataset.v === '1' }).then(ok => { if (ok) { closeModal(); route(); toast(t.dataset.v === '1' ? 'Deposit marked as received' : 'Deposit marked as not received'); } }); }
  else if (a === 'done') { patchBooking(id, { status: 'done' }).then(ok => { if (ok) { closeModal(); route(); toast('Marked as done'); } }); }
  else if (a === 'cancel1') { t.textContent = 'Tap again to cancel'; t.dataset.act = 'cancel2'; }
  else if (a === 'cancel2') { patchBooking(id, { status: 'cancelled' }).then(ok => { if (ok) { closeModal(); route(); toast('Booking cancelled'); } }); }
  else if (a === 'rmsample') { api('DELETE', '/api/bookings/sample').then(r => { if (r.ok) { S.bookings = S.bookings.filter(b => b.source !== 'sample'); route(); toast('Sample bookings removed'); } else toast(failMsg(r)); }); }
  else if (a === 'del1') { t.textContent = 'Tap again to delete for good'; t.dataset.act = 'del2'; }
  else if (a === 'del2') { api('DELETE', '/api/bookings/' + id).then(r => { if (r.ok) { S.bookings = S.bookings.filter(b => b.id !== id); closeModal(); route(); toast('Booking deleted'); } else toast(failMsg(r)); }); }
  else if (a === 'tab') { calState.tab = t.dataset.tab; vCalendar(); }
  else if (a === 'toavail') { calState.tab = 'availability'; }
  else if (a === 'week') { const d = +t.dataset.d; calState.weekStart = d ? addDays(calState.weekStart, d) : mondayOf(new Date()); if (!d) calState.day = ymd(new Date()); else calState.day = ymd(calState.weekStart); vCalendar(); }
  else if (a === 'day') { calState.day = t.dataset.date; vCalendar(); }
  else if (a === 'slot') { if (e.target.closest('.bk')) return; const r = t.getBoundingClientRect(), m = +t.dataset.lo + Math.floor(((e.clientY - r.top) / HH * 60) / 15) * 15; openAdd(t.dataset.date, fromMin(Math.max(0, Math.min(m, 23 * 60 + 45)))); }
  else if (a === 'accent') { S.biz.accent = t.dataset.v; save(); $$('.sw').forEach(b => { const on = b.dataset.v === S.biz.accent; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); }); renderPreview(); }
  else if (a === 'rmblock') { S.blocks = (S.blocks || []).filter(x => x.id !== id); save(); vCalendar(); }
  else if (a === 'rmoff') { S.timeOff = S.timeOff.filter(x => x.id !== id); save(); vCalendar(); }
  else if (a === 'addsvc') { S.services.push({ id: uid(), name: 'New service', mins: 30, price: 15, deposit: 0, desc: '', hidden: false }); save(); $('#svclist').innerHTML = svcRows(); renderPreview(); }
  else if (a === 'rmsvc') { S.services = S.services.filter(x => x.id !== id); save(); $('#svclist').innerHTML = svcRows(); renderPreview(); }
  else if (a === 'token') { const ta = $('#tpl'); const p = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, p) + t.dataset.t + ta.value.slice(ta.selectionEnd ?? p); S.reminders.template = ta.value; save(); refreshBubble(); ta.focus(); }
  else if (a === 'sent') { patchBooking(id, { [t.dataset.key]: true }).then(() => setTimeout(route, 400)); }
  else if (a === 'pay') toast('Payments aren’t switched on yet.');
  else if (a === 'signout') signOut();
  else if (a === 'twofa') { twofaModal(); }
  else if (a === 'twofa-go') { twofaStart(); }
  else if (a === 'twofa-enable') { const code = ($('#tfcode') || {}).value || ''; api('POST', '/api/2fa/enable', { code }).then(r => { if (!r.ok) { $('#tferr').textContent = r.data && r.data.error === 'invalid_code' ? 'That code is not right. Check your phone and try the newest code.' : failMsg(r); $('#tferr').hidden = false; return; } TWOFA = true; openModal('<h3>Two-factor is on</h3><p class="sub">Save these recovery codes somewhere safe. Each one works once if you lose your phone. They are only shown now.</p><pre class="codes">' + r.data.backup.join('\n') + '</pre><div class="acts"><button class="btn ghost" data-act="tfcopy">Copy codes</button><button class="btn" data-act="close">I have saved them</button></div>'); vPlan(); }); }
  else if (a === 'tfcopy') { const txt = ($('.codes') || {}).textContent || ''; navigator.clipboard && navigator.clipboard.writeText(txt).then(() => toast('Copied')); }
  else if (a === 'feedback') { openModal('<h3>Report a problem or send feedback</h3><p class="sub">What were you trying to do, and what happened? We reply to ' + esc(ME || 'your email') + '.</p><label class="field"><span>Your message</span><textarea id="fbtext" rows="5" maxlength="1000"></textarea></label><p class="err" id="fberr" hidden></p><div class="acts"><button class="btn" data-act="feedback-send">Send</button><button class="btn ghost" data-act="close">Cancel</button></div>'); }
  else if (a === 'feedback-send') { const t = (($('#fbtext') || {}).value || '').trim(); if (t.length < 5) { $('#fberr').textContent = 'Please write a little more.'; $('#fberr').hidden = false; return; } api('POST', '/api/contact', { message: t, email: ME || '' }).then(r => { if (!r.ok) { $('#fberr').textContent = r.status === 429 ? 'Too many messages. Try again later.' : 'Could not send. Email info@mybookable.co.uk instead.'; $('#fberr').hidden = false; return; } closeModal(); toast('Thank you, we got your message'); }); }
  else if (a === 'tg-on') { api('POST', '/api/telegram/link', {}).then(r => { if (!r.ok) return toast('Telegram is not available right now'); openModal('<h3>Connect Telegram</h3><p class="sub">Press the button, then press Start in Telegram. Come back here and reload this page to see it connected.</p><div class="acts"><a class="btn" href="' + r.data.url + '" target="_blank" rel="noopener">Open Telegram</a><button class="btn ghost" data-act="close">Close</button></div>'); }); }
  else if (a === 'tg-off') { api('POST', '/api/telegram/unlink', {}).then(() => { TGON = false; vPlan(); toast('Telegram alerts turned off'); }); }
  else if (a === 'twofa-off') { const pw = ($('#tfpw') || {}).value || '', code = ($('#tfoff') || {}).value || ''; api('POST', '/api/2fa/disable', { password: pw, code }).then(r => { if (!r.ok) { $('#tferr').textContent = r.status === 429 ? 'Too many tries. Wait a few minutes.' : 'Your password or code is not right.'; $('#tferr').hidden = false; return; } TWOFA = false; closeModal(); vPlan(); toast('Two-factor turned off'); }); }
  else if (a === 'signoutall') { if (t.dataset.sure) { api('POST', '/api/logout-all').then(() => { ME = null; S = null; location.hash = '#/login'; route(); }); } else { t.dataset.sure = '1'; t.textContent = 'Tap again to sign out everywhere'; } }
  else if (a === 'deleteacct') { if (t.dataset.sure) { api('DELETE', '/api/account').then(r => { if (r.ok) { ME = null; S = null; location.hash = '#/signup'; route(); } else toast(failMsg(r)); }); } else { t.dataset.sure = 1; t.textContent = 'Tap again to delete everything'; } }
});
function refreshBubble() { const b = $('#bubble'); if (!b) return; const sv = S.services[0] || { name: 'Haircut', price: 18 }; b.innerHTML = esc(reminderText({ name: 'Jamie Lowe', svcName: sv.name, date: ymd(addDays(new Date(), 1)), time: '10:00', price: sv.price })) + '<small>09:00</small>'; }
function setPath(o, path, v) { const p = path.split('.'); const last = p.pop(); let x = o; p.forEach(k => x = x[k]); x[last] = v; }
document.addEventListener('input', e => {
  const t = e.target;
  if (t.form && t.form.id === 'addform') { if (t.name === 'name') addFormFill(t); addPreview(); }
  if (t.dataset.svc) { const row = t.closest('[data-sid]'), s = S.services.find(x => x.id === row.dataset.sid); if (s && t.type !== 'checkbox' && t.tagName !== 'SELECT') { s[t.dataset.svc] = (t.dataset.svc === 'name' || t.dataset.svc === 'desc') ? t.value : +t.value; save(); renderPreview(); } return; }
  if (!t.dataset.model || t.type === 'checkbox' || t.type === 'radio' || t.tagName === 'SELECT') return;
  let v = t.value; if (t.dataset.slug) { v = slugify(v); }
  setPath(S, t.dataset.model, t.dataset.num ? +v : v); save();
  if (t.dataset.model.startsWith('biz.')) renderPreview();
  if (t.dataset.model === 'reminders.template') refreshBubble();
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.form && t.form.id === 'addform') { addFormChange(t); return; }
  if (t.dataset.model === 'trade') { S.trade = t.value; const w = $('#tl'); w.hidden = t.value !== 'other'; if (t.value === 'other') { S.biz.tradeLabel = S.biz.tradeLabel || ''; if (S.biz.tradeLabel) save(); $('input', w).focus(); } else { delete S.biz.tradeLabel; save(); } renderPreview(); return; }
  if (t.name === 'trade') { const w = $('#otherwrap'), i = w && $('input', w); if (w) { w.hidden = t.value !== 'other'; i.required = t.value === 'other'; if (!w.hidden) i.focus(); } return; }
  if (t.dataset.svc) { const row = t.closest('[data-sid]'), s = S.services.find(x => x.id === row.dataset.sid); if (s) { if (t.dataset.svc === 'shown') s.hidden = !t.checked; else if (t.tagName === 'SELECT') s[t.dataset.svc] = +t.value; else return; save(); renderPreview(); } return; }
  if (!t.dataset.model) return;
  if (t.dataset.slug) { t.value = S.biz.slug || (S.biz.slug = 'my-bookings'); save(); vPage(); return; }
  const v = t.type === 'checkbox' ? t.checked : (t.dataset.num ? +t.value : t.value);
  setPath(S, t.dataset.model, v); save();
  if (t.dataset.model.startsWith('biz.')) renderPreview();
  if (t.dataset.model.startsWith('hours.')) { if (t.dataset.model.endsWith('.on') || t.dataset.model.endsWith('.start') || t.dataset.model.endsWith('.end')) { const h = S.hours[t.dataset.model.split('.')[1]]; if (toMin(h.end) <= toMin(h.start)) { h.end = fromMin(Math.min(toMin(h.start) + 60, 23 * 60)); save(); } vCalendar(); } }
  if (t.dataset.model.startsWith('reminders.')) { refreshBubble(); if (!t.matches('#tpl')) vReminders(); }
});
document.addEventListener('submit', e => {
  const f = e.target;
  if (f.id === 'loginform') {
    e.preventDefault(); (async () => {
      const creating = location.hash === '#/signup', email = f.elements.email.value.trim().toLowerCase(), pw = f.elements.password.value, err = $('#lerr'), btn = f.querySelector('button.btn');
      const fail = m => { err.textContent = m; err.hidden = false; btn.disabled = false; };
      if (!/^\S+@\S+\.\S+$/.test(email)) return fail('Enter a valid email address.');
      if (creating && pw.length < 8) return fail('Use at least 8 characters for your password.');
      btn.disabled = true;
      const r = await api('POST', creating ? '/api/signup' : '/api/login', creating ? { email, password: pw } : { email, password: pw, code: (f.elements.code.value || '').trim() });
      if (!r.ok) {
        const code = r.data && r.data.error;
        if (code === 'code_required' || code === 'invalid_code') { $('#codefield').hidden = false; f.elements.code.focus(); return fail(code === 'code_required' ? 'Enter the code from your authenticator app.' : 'That code is not right. Try the newest code, or a recovery code.'); }
        return fail(code === 'email_taken' ? 'That email already has an account. Sign in instead.' : code === 'invalid_login' ? 'That email and password don’t match.' : code === 'invalid_email' ? 'Enter a valid email address.' : code === 'weak_password' ? 'That password is too easy to guess. Pick something less common.' : code === 'invalid_password' ? 'Use at least 8 characters for your password.' : failMsg(r));
      }
      if (r.data && r.data.admin) { location.href = '/admin/'; return; }
      await loadMe(); afterAuth(creating);
    })();
  } else if (f.id === 'setup') {
    e.preventDefault(); const d = new FormData(f), btn = f.querySelector('button.btn'); btn.disabled = true;
    createBusiness(d.get('trade'), d.get('name').trim(), d.get('phone').trim(), d.get('town').trim(), !!d.get('sample'), (d.get('tradeLabel') || '').trim()).then(ok => { if (ok) { location.hash = '#/today'; route(); } else btn.disabled = false; });
  } else if (f.id === 'blockform') {
    e.preventDefault(); const d = new FormData(f);
    if (!d.get('date')) return;
    if (toMin(d.get('end')) <= toMin(d.get('start'))) { toast('The end time must be after the start time.'); return; }
    S.blocks = S.blocks || []; S.blocks.push({ id: uid(), date: d.get('date'), start: d.get('start'), end: d.get('end'), label: (d.get('label') || '').trim(), weekly: !!d.get('weekly') }); save(); vCalendar(); toast('Time blocked');
  } else if (f.id === 'offform') {
    e.preventDefault(); const d = new FormData(f);
    if (d.get('date')) { S.timeOff.push({ id: uid(), date: d.get('date'), label: d.get('label').trim() }); save(); vCalendar(); }
  } else if (f.id === 'addform') {
    e.preventDefault(); const d = new FormData(f), err = $('#adderr'), btn = f.querySelector('button.btn.accent');
    const custom = d.get('svc') === 'custom', every = +d.get('every');
    const body = { svcId: d.get('svc'), date: d.get('date'), time: d.get('time'), name: d.get('name').trim(), phone: d.get('phone').trim(), note: d.get('note').trim(), mins: +d.get('mins'), price: parseFloat(d.get('price') || '0') || 0 };
    if (custom) body.svcName = d.get('svcName').trim();
    if (every) body.repeat = { every, count: +d.get('count') };
    if (d.get('done') && !every) body.status = 'done';
    const win = d.get('wa') && body.phone ? window.open('', '_blank') : null; /* opened here, inside the click, so the browser allows it */
    btn.disabled = true;
    api('POST', '/api/bookings', body).then(r => {
      if (r.ok) {
        const { bookings, skipped } = r.data; S.bookings.push(...bookings);
        if (win) win.location.href = waLink(body.phone, confirmText(bookings[0]));
        closeModal(); route();
        toast(bookings.length === 1 ? 'Booking added' : `${bookings.length} bookings added` + (skipped.length ? `. ${skipped.length} clashed with another booking and ${skipped.length === 1 ? 'was' : 'were'} skipped.` : ''));
        return;
      }
      if (win) win.close();
      btn.disabled = false; err.textContent = r.status === 409 ? 'That time overlaps another booking.' : r.status === 422 ? 'Check the details and try again.' : failMsg(r); err.hidden = false;
    });
  }
});

/* ---------- helpers ---------- */
const nap = ms => new Promise(r => setTimeout(r, ms));

/* ---------- sign-in intro: "Bookable" then "booking" slide in from the right, hold, then slide back out ---------- */
const prefersReduced = () => { try { if (localStorage.getItem('pencil.motion') === '1') return false; } catch (e) { /* ignore */ } return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };
function playIntro(force, { quick = false } = {}) {
  return new Promise(async resolve => {
    const cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
    if (!ctx || (!force && prefersReduced())) return resolve();
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight, PW = Math.round(W * dpr), PH = Math.round(H * dpr);
    cv.id = 'intro'; cv.width = PW; cv.height = PH; cv.setAttribute('aria-hidden', 'true'); document.body.appendChild(cv);
    const skipBtn = document.createElement('button'); skipBtn.className = 'skip-intro linkbtn'; skipBtn.textContent = 'Skip'; document.body.appendChild(skipBtn);
    try { await Promise.race([document.fonts.load('700 120px Inter'), nap(900)]); } catch (e) { /* use the fallback font */ }

    const themed = !!document.documentElement.dataset.theme, cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    const INK = themed ? cssv('--ink') : '#111110', YEL = themed ? cssv('--accent') : '#f5c518', BG = themed ? cssv('--bg') : '#f6f5f2', SUB = themed ? cssv('--muted') : '#8a877e';
    const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x)), easeOut = x => 1 - Math.pow(1 - x, 4), easeIn = x => x * x * x;

    /* each word is drawn once on its own canvas, then slid across */
    const fs = Math.min(W * .19, 210) * dpr, mk = () => { const c = document.createElement('canvas'); c.width = PW; c.height = PH; return c; };
    const srcA = mk(), srcB = mk(), G = [srcA, srcB].map(c => c.getContext('2d'));
    for (const g of G) { g.font = `700 ${fs}px Inter, system-ui, sans-serif`; g.textBaseline = 'alphabetic'; if ('letterSpacing' in g) g.letterSpacing = (-.05 * fs) + 'px'; }
    const w1 = G[0].measureText('Bookable').width, w2 = G[1].measureText('booking').width, base = PH * .47, base2 = base + fs * 1.02;
    G[0].fillStyle = INK; G[0].fillText('Bookable', (PW - w1) / 2, base);
    G[0].save(); G[0].translate(PW / 2, base - fs * .98); G[0].rotate(Math.PI / 4); G[0].fillStyle = YEL; const d = fs * .075; G[0].fillRect(-d, -d, d * 2, d * 2); G[0].restore();
    G[1].fillStyle = SUB; G[1].fillText('booking', (PW - w2) / 2, base2);

    const k = quick ? .55 : 1, T_A = 650 * k, GAP = 120 * k, T_B = 600 * k, HOLD = quick ? 160 : 700, X_B = 450 * k, X_GAP = 100 * k, X_A = 450 * k;
    const OUT0 = T_A + GAP + T_B + HOLD, END = OUT0 + X_B + X_GAP + X_A;
    let t0 = 0, raf = 0, finished = false;
    function frame(now) {
      if (!t0) t0 = now;
      const t = now - t0;
      ctx.globalAlpha = 1; ctx.fillStyle = BG; ctx.fillRect(0, 0, PW, PH);
      const inA = easeOut(clamp(t / T_A)), inB = easeOut(clamp((t - T_A - GAP) / T_B));
      const outB = easeIn(clamp((t - OUT0) / X_B)), outA = easeIn(clamp((t - OUT0 - X_B - X_GAP) / X_A));
      /* "Bookable" comes in first, "booking" follows; on the way out "booking" leaves first, back the way they came */
      ctx.globalAlpha = clamp(t / T_A * 3); ctx.drawImage(srcA, (1 - inA) * PW * .85 + outA * PW * .95, 0);
      if (t > T_A + GAP) { ctx.globalAlpha = clamp((t - T_A - GAP) / T_B * 3); ctx.drawImage(srcB, (1 - inB) * PW * .85 + outB * PW * .95, 0); }
      ctx.globalAlpha = 1;
      if (t >= END) return finish();
      raf = requestAnimationFrame(frame);
    }
    function finish() {
      if (finished) return; finished = true; cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey); skipBtn.remove(); cv.remove(); resolve();
    }
    const onKey = e => { if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') finish(); };
    addEventListener('keydown', onKey); skipBtn.addEventListener('click', finish); cv.addEventListener('click', finish);
    raf = requestAnimationFrame(frame);
  });
}

function renderLogin() {
  const creating = location.hash === '#/signup';
  document.title = (creating ? 'Create your account' : 'Sign in') + ' · Bookable';
  root.innerHTML = `<div class="stage" id="stage"><div class="glows" aria-hidden="true"><i class="glow a"></i><i class="glow b"></i></div>
    <form class="login" id="loginform" novalidate>
      <a class="brand" href="/"><i class="mark"></i>Bookable</a>
      <h1>${creating ? 'Create your account' : 'Welcome back'}</h1>
      <p class="lede">${creating ? 'Free for 7 days, then £14.99 a month.' : 'Your bookings are waiting.'}</p>
      <label class="field"><span>Email</span><input type="email" name="email" autocomplete="email" placeholder="you@example.com" required></label>
      <label class="field"><span>Password</span><input type="password" name="password" autocomplete="${creating ? 'new-password' : 'current-password'}" placeholder="${creating ? 'At least 8 characters' : 'Your password'}" required minlength="8"></label>
      <label class="field" id="codefield" hidden><span>Authenticator code</span><input type="text" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="12" placeholder="6-digit code or recovery code"><small>Open your authenticator app and enter the 6-digit code for Bookable.</small></label>
      <p class="err" id="lerr" hidden></p>
      <button class="btn accent" style="width:100%;min-height:52px">${creating ? 'Create account' : 'Sign in'}</button>
      <p class="switch">${creating ? 'Already have an account? <a href="#/login">Sign in</a>' : 'New to Bookable? <a href="#/signup">Create an account</a>'}</p>
      ${creating ? '<p class="legal">By continuing you agree to the <a href="/terms/" target="_blank" rel="noopener">Terms</a> and <a href="/privacy/" target="_blank" rel="noopener">Privacy Policy</a> and confirm you are 13 or over. We store your email and the details you add. No card needed.</p>' : ''}
    </form></div>`;
}

/* After sign-in or sign-up the intro plays, then the public home page takes over ("Never miss a call", how it works, the small print)
   and the owner opens their dashboard from there. A browser with no canvas skips the intro and goes straight to the dashboard. */
async function afterAuth(isNew) {
  await playIntro(true, { quick: !isNew });
  const c = document.createElement('canvas');
  if (c.getContext && c.getContext('2d')) { location.href = '/?in=' + (isNew ? 'new' : 'back'); return; }
  location.hash = '#/today'; route();
}
async function signOut() {
  await flush();
  await api('POST', '/api/logout');
  ME = null; S = null; location.hash = '#/login'; route();
}

/* ---------- router ---------- */
/* trial over and unpaid: nothing else in the app opens until the owner has paid and the payment has been recorded */
function renderPaywall() {
  document.title = 'Payment needed · Bookable';
  const cancelled = BILL.status === 'cancelled';
  root.innerHTML = `<div class="stage"><div class="glows" aria-hidden="true"><i class="glow a"></i><i class="glow b"></i></div><div class="login"><a class="brand" href="/"><i class="mark"></i>Bookable</a>
    <h1 style="font-size:28px">${cancelled ? 'Your plan has ended' : 'Your free trial has ended'}</h1>
    <p class="muted">To keep using Bookable, pay ${money(BILL.price)} a month. Your bookings and clients are safe and will be here as soon as you have paid.</p>
    <div class="summary" style="margin:18px 0"><span><b style="font-weight:600">Bookable</b> · monthly</span><b style="font-weight:600">${money(BILL.price)}</b></div>
    <b>How to pay</b><p class="muted" style="margin:6px 0 16px;white-space:pre-wrap">${PAYINFO ? esc(PAYINFO) : 'Pay by bank transfer. Message us on websitebuilds01@gmail.com and we will send the details.'}</p>
    <p class="muted">Once your payment is recorded, tap the button below. This usually takes a few minutes.</p>
    <div class="stack"><button class="btn" data-pw="check">I have paid, check again</button><button class="btn ghost" data-pw="out">Sign out</button></div><p class="err" id="pwmsg" hidden></p></div></div>`;
  root.onclick = async e => {
    const t = e.target.closest('[data-pw]'); if (!t) return;
    if (t.dataset.pw === 'out') return signOut();
    t.disabled = true; await loadMe(); t.disabled = false;
    if (BILL && BILL.enforce && (BILL.status === 'overdue' || BILL.status === 'cancelled')) { const m = $('#pwmsg'); m.textContent = 'Not recorded yet. Try again in a few minutes.'; m.hidden = false; } else { root.onclick = null; route(); }
  };
}
function route() {
  closeModal();
  const [a, b] = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  if (a === 'book') return renderClient(b);
  if (!ME) { if (a !== 'login' && a !== 'signup') { location.hash = '#/login'; return; } return renderLogin(); }
  if (a === 'login' || a === 'signup') { location.hash = '#/today'; return; }
  if (!S) return renderSetup();
  if (BILL && BILL.enforce && (BILL.status === 'overdue' || BILL.status === 'cancelled')) return renderPaywall();
  const views = { today: [vToday, 'Today'], calendar: [vCalendar, 'Calendar'], page: [vPage, 'Booking page'], reminders: [vReminders, 'Reminders'], plan: [vPlan, 'Plan'] };
  const [view, name] = views[a] || views.today;
  setHead(`${name} · Bookable`, 'Bookable: your bookings, calendar and WhatsApp reminders.');
  view();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('pagehide', () => { if (saveTimer) flush(); });
/* While the app is open, quietly pick up bookings that clients have made, and say so */
async function refreshBookings() {
  if (!ME || !S || document.hidden) return;
  const r = await api('GET', '/api/me'); if (!r.ok || !r.data.email || !S) return;
  const sig = list => list.map(b => [b.id, b.status, b.reminded, b.confirmed].join()).join('|');
  if (sig(r.data.bookings) === sig(S.bookings)) return;
  const have = new Set(S.bookings.map(b => b.id)), fresh = r.data.bookings.filter(b => !have.has(b.id) && b.source === 'link');
  S.bookings = r.data.bookings;
  if (fresh.length === 1) toast(`New booking: ${fresh[0].name}, ${fresh[0].svcName}, ${dayWord(fresh[0].date)} at ${fresh[0].time}`);
  else if (fresh.length > 1) toast(`${fresh.length} new bookings`);
  const view = location.hash.replace(/^#\/?/, '').split('/')[0] || 'today';
  if (!$('#veil') && !document.activeElement?.matches?.('input,textarea,select') && ['today', 'calendar', 'reminders'].includes(view)) { const y = scrollY; route(); scrollTo(0, y); }
}
setInterval(refreshBookings, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshBookings(); });
applyDesign();
loadMe().then(route);
