/* Bookable owner panel. Talks to /api/admin/*; the server checks every request. */
const $ = (s, el = document) => el.querySelector(s), root = $('#root');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => '£' + (Math.round(n * 100) / 100).toString();
const COLS = ['#5e5ce6', '#ff9f0a', '#30b0c7', '#ff375f', '#34c759', '#af52de', '#0a84ff', '#ac8e68'];
const av = nm => { let h = 0; for (const c of String(nm || '?')) h = (h * 31 + c.charCodeAt(0)) | 0; const t = String(nm || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase(); return `<i class="av" style="--c:${COLS[Math.abs(h) % COLS.length]}">${esc(t)}</i>`; };
const ago = ms => { if (!ms) return 'never'; const s = (Date.now() - ms) / 1000; if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago'; if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago'; return new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };
const dShort = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const dLong = d => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const bytes = n => n == null ? 'n/a' : n < 1048576 ? (n / 1024).toFixed(0) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const TRADE = { barber: 'Barber', nails: 'Nail technician', dogs: 'Dog walker' };
const tname = t => TRADE[t] || t || '–';
const PLAN_LABEL = { standard: 'Standard', founding: 'Founding', custom: 'Custom', free: 'Free', cancelled: 'Cancelled' };
const PLAN_PRICE = { standard: 14.99, founding: 4, custom: 14.99, free: 0, cancelled: 0 };
const METHOD_LABEL = { bank: 'Bank transfer', cash: 'Cash', card: 'Card', other: 'Other' };
let D = null, tab = 'overview', filter = '';

async function api(method, url, body) {
  try {
    const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : (method === 'GET' ? {} : { 'content-type': 'application/json' }), body: body ? JSON.stringify(body) : (method === 'GET' ? undefined : '{}') });
    let data = null; try { data = await r.json(); } catch {}
    return { ok: r.ok, status: r.status, data };
  } catch { return { ok: false, status: 0, data: null }; }
}
function toast(m) { $('.toast')?.remove(); const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

function gate(msg, needTotp, prefill) {
  root.innerHTML = `<div class="gate"><form class="card" id="login"><div class="brand"><i class="mark"></i>Bookable <span class="tag">Admin</span></div>
    <h1>Owner access</h1><p>This area is private. Enter your access code.</p>${msg ? `<div class="err">${esc(msg)}</div>` : ''}
    <label>Access code<input type="password" name="code" value="${esc(prefill || '')}" autocomplete="off" autocapitalize="off" spellcheck="false" required></label>
    ${needTotp ? '<label>Authenticator code<input type="text" name="totp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></label>' : ''}
    <button class="btn" style="width:100%">Continue</button></form></div>`;
  $('#login').onsubmit = async e => {
    e.preventDefault(); const f = e.target.elements, b = e.target.querySelector('button'); b.disabled = true;
    const r = await api('POST', '/api/admin/login', { code: f.code.value, totp: f.totp ? f.totp.value : undefined });
    if (r.ok) return load();
    if (r.data && r.data.error === 'code_required') return gate("Enter the 6-digit code from your authenticator app.", true, f.code.value);
    gate(r.status === 429 ? 'Too many attempts. Wait a while and try again.' : r.status === 404 ? 'Admin is not switched on for this site.' : 'That code is not right.');
  };
}

async function load() {
  const r = await api('GET', '/api/admin/data');
  if (r.status === 401 || r.status === 404) return gate(r.status === 404 ? 'Admin is not switched on for this site.' : '');
  if (!r.ok) { root.innerHTML = '<div class="gate"><div class="card">Could not load. <button class="btn sm" onclick="location.reload()">Retry</button></div></div>'; return; }
  D = r.data; draw();
}

/* ---------- billing helpers ---------- */
function statusPill(b) {
  if (b.status === 'paid') return `<span class="pill ok">Paid to ${dShort(b.paidUntil)}</span>`;
  if (b.status === 'trial') return `<span class="pill warn">Trial, ${b.daysLeft} d left</span>`;
  if (b.status === 'overdue') return `<span class="pill bad">Overdue ${b.overdueDays} d</span>`;
  if (b.status === 'free') return '<span class="pill">Free</span>';
  return '<span class="pill">Cancelled</span>';
}
const normPhone = p => { let d = String(p || '').replace(/[^\d+]/g, ''); if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '44' + d.slice(1); return d; };
function chaseText(u) {
  const b = u.billing, S = D.settings, tpl = b.status === 'overdue' ? S.chaseOverdue : S.chaseTrial;
  const first = String(u.business || u.email.split('@')[0]).trim().split(/\s+/)[0];
  const when = b.status === 'overdue' ? '' : dLong(b.status === 'paid' ? b.paidUntil : b.trialEnd);
  return tpl.replace(/\{name\}/g, first).replace(/\{business\}/g, u.business || first).replace(/\{price\}/g, money(b.price)).replace(/\{date\}/g, when)
    .replace(/\{days\}/g, b.overdueDays + (b.overdueDays === 1 ? ' day' : ' days')).replace(/\{payinfo\}/g, S.payInfo || '').replace(/ {2,}/g, ' ').trim();
}
const waLink = (phone, text) => { const n = normPhone(phone); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null; };
const needsChase = u => ['overdue'].includes(u.billing.status) || ((u.billing.status === 'trial' || u.billing.status === 'paid') && u.billing.dueSoon);

const bars = (arr, label) => { const mx = Math.max(1, ...arr.map(x => x.c)); return `<div class="bars" role="img" aria-label="${label}">${arr.map(x => `<i class="${x.c ? '' : 'z'}" style="height:${Math.max(3, x.c / mx * 100)}%" title="${dShort(x.d)}: ${x.c}"></i>`).join('')}</div><div class="axis"><span>${dShort(arr[0].d)}</span><span>${arr.reduce((a, x) => a + x.c, 0)} in 14 days</span><span>${dShort(arr[arr.length - 1].d)}</span></div>`; };
const kpi = (l, v, s) => `<div class="kpi"><span>${l}</span><b>${v}</b>${s ? `<small>${s}</small>` : ''}</div>`;
const share = (arr, total) => arr.length ? arr.map(([k, c]) => `<div><div class="row" style="border:0;padding:4px 0"><span>${esc(k)}</span><b>${c}</b></div><div class="meter"><i style="width:${total ? c / total * 100 : 0}%"></i></div></div>`).join('') : '<p class="m">Nothing yet.</p>';

function overview() {
  const k = D.kpi, bl = D.billing, tr = Object.entries(D.trades).sort((a, b) => b[1] - a[1]).map(([t, c]) => [tname(t), c]);
  const src = D.bySource.map(s => [s.k === 'link' ? 'Booked by client link' : s.k === 'manual' ? 'Added by the owner' : s.k, s.c]);
  const st = D.byStatus.map(s => [s.k === 'booked' ? 'Booked' : s.k === 'done' ? 'Done' : 'Cancelled', s.c]);
  const stale = D.users.filter(u => u.slug && !u.bookings && Date.now() - u.created > 3 * 864e5).length;
  return `<div class="grid kpis">${kpi('Businesses', k.users, `+${k.new7} this week`)}${kpi('Paying', bl.paying, `${money(bl.mrr)} a month`)}${kpi('Overdue', bl.overdue, bl.overdue ? `${money(bl.owed)} to collect` : 'all up to date')}${kpi('Active (30 days)', k.active30, 'had a booking')}${kpi('Bookings', k.bookings, `${k.week} in the last 7 days`)}${kpi('Never booked', k.noBookings, `${stale} older than 3 days`)}</div>
  <div class="grid two"><div class="panel"><h2>Sign-ups</h2>${bars(D.signups, 'Sign-ups per day')}</div><div class="panel"><h2>Bookings made</h2>${bars(D.bookingsPerDay, 'Bookings per day')}</div></div>
  <div class="grid three"><div class="panel"><h2>Business types</h2>${share(tr, k.users)}</div><div class="panel"><h2>Where bookings come from</h2>${share(src, k.bookings)}</div><div class="panel"><h2>Booking status</h2>${share(st, k.bookings)}</div></div>
  <div class="panel"><h2>Latest bookings</h2>${recentTable(D.recent.slice(0, 8))}</div>`;
}
function recentTable(list, remove) {
  if (!list.length) return '<p class="m">No real bookings yet.</p>';
  return `<div class="scroll"><table><thead><tr><th>Business</th><th>Service</th><th>When</th><th>Price</th><th>Status</th><th class="hide-s">Source</th><th class="hide-s">Made</th>${remove ? '<th></th>' : ''}</tr></thead><tbody>${list.map(b => `<tr><td><div class="who">${av(b.business)}<b>${esc(b.business)}</b></div></td><td>${esc(b.svc)}</td><td>${dShort(b.date)} ${b.time}</td><td>${money(b.price)}</td><td><span class="pill ${b.status === 'done' ? 'ok' : b.status === 'cancelled' ? 'bad' : ''}">${b.status}</span></td><td class="hide-s m">${b.source === 'link' ? 'Client link' : 'Owner'}</td><td class="hide-s m">${ago(b.created)}</td>${remove ? `<td><button class="btn danger sm" data-rmbooking="${b.id}">Remove</button></td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}

function payments() {
  const bl = D.billing, S = D.settings;
  const list = D.users.filter(needsChase).sort((a, b) => (b.billing.overdueDays - a.billing.overdueDays) || ((a.billing.daysLeft ?? 99) - (b.billing.daysLeft ?? 99)));
  const rows = list.map(u => {
    const b = u.billing, link = waLink(u.phone, chaseText(u));
    return `<tr><td><div class="who">${av(u.business || u.email)}<div><b>${esc(u.business || 'Not set up yet')}</b><small>${esc(u.phone || u.email)}</small></div></div></td><td>${statusPill(b)}</td><td><b>${money(b.price)}</b></td><td class="hide-s m">${b.chased ? ago(b.chased) : 'not yet'}</td>
      <td><div class="acts" style="margin:0">${link ? `<button class="btn sm" data-chase="${u.id}">Chase on WhatsApp</button>` : '<button class="btn sm" disabled>No number</button>'}<button class="btn ghost sm" data-user="${u.id}">Record payment</button></div></td></tr>`;
  }).join('');
  return `<div class="grid kpis">${kpi('Paying now', bl.paying, `${money(bl.mrr)} a month`)}${kpi('Collected this month', money(bl.collected), 'payments you recorded')}${kpi('Overdue', bl.overdue, bl.overdue ? `${money(bl.owed)} to collect` : 'nobody')}${kpi('On free trial', bl.trial, `${money(bl.trialValue)} a month when they convert`)}${kpi('Free or cancelled', bl.free + bl.cancelled)}</div>
  <div class="panel"><h2>Needs chasing (${list.length})</h2>${list.length ? `<div class="scroll"><table><thead><tr><th>Business</th><th>Status</th><th>Amount</th><th class="hide-s">Last chased</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="m">Nobody is overdue and no trials or payments end in the next 3 days.</p>'}
    <p class="m" style="margin-top:12px">Chase opens WhatsApp with the message ready. You press send, nothing is sent automatically.</p></div>
  <div class="panel"><h2>How people pay you</h2>
    <label>Payment details (shown to each business on their Plan page, and put in chase messages)<textarea id="payInfo" rows="3" maxlength="800" placeholder="e.g. Bank transfer to J Smith, sort code 00-00-00, account 00000000. Use your business name as the reference.">${esc(S.payInfo)}</textarea></label>
    <label>Message when a trial or payment is about to end<textarea id="chaseTrial" rows="3" maxlength="800">${esc(S.chaseTrial)}</textarea></label>
    <label>Message when a payment is overdue<textarea id="chaseOverdue" rows="3" maxlength="800">${esc(S.chaseOverdue)}</textarea></label>
    <p class="m">You can use {name} {business} {price} {date} {days} and {payinfo}. Only put bank details you are happy for your customers to see.</p>
    <div class="acts"><button class="btn sm" id="savesettings">Save</button></div></div>
  <div class="panel"><h2>Recent payments</h2>${D.payments.length ? `<div class="scroll"><table><thead><tr><th>Paid on</th><th>Business</th><th>Amount</th><th class="hide-s">Method</th><th class="hide-s">Note</th><th></th></tr></thead><tbody>${D.payments.map(p => `<tr><td>${dShort(p.paidOn)}</td><td><b>${esc(p.business)}</b></td><td>${money(p.amount)}</td><td class="hide-s m">${esc(METHOD_LABEL[p.method] || p.method)}</td><td class="hide-s m">${esc(p.note)}</td><td><button class="btn ghost sm" data-delpay="${p.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="m">No payments recorded yet. Open a business and use Record payment when someone pays you.</p>'}
    <p class="m" style="margin-top:12px">Deleting a payment removes the record only. It does not change the date they are paid up to. Keep payment records for your tax return.</p></div>`;
}

function users() {
  const f = filter.trim().toLowerCase(), list = D.users.filter(u => !f || [u.email, u.business, u.trade, u.town, u.slug].some(x => String(x || '').toLowerCase().includes(f)));
  return `<div class="panel"><h2>Businesses (${D.users.length})</h2><input type="search" class="search" id="q" placeholder="Search name, email, town…" value="${esc(filter)}" aria-label="Search businesses">
  <div class="scroll"><table><thead><tr><th>Business</th><th class="hide-s">Type</th><th class="hide-s">Town</th><th>Bookings</th><th class="hide-s">Last booking</th><th>Plan</th><th class="hide-s">Joined</th></tr></thead><tbody>
  ${list.map(u => `<tr class="click" data-user="${u.id}" tabindex="0"><td><div class="who">${av(u.business || u.email)}<div><b>${esc(u.business || 'Not set up yet')}</b><small>${esc(u.email)}</small></div></div></td><td class="hide-s">${esc(tname(u.trade))}</td><td class="hide-s">${esc(u.town || '–')}</td><td><b>${u.bookings}</b></td><td class="hide-s m">${ago(u.last)}</td><td>${statusPill(u.billing)}</td><td class="hide-s m">${ago(u.created)}</td></tr>`).join('') || '<tr><td colspan="7" class="m">No matches.</td></tr>'}
  </tbody></table></div></div>`;
}
function bookings() { return `<div class="panel"><h2>Latest 60 real bookings</h2>${recentTable(D.recent, true)}<p class="m" style="margin-top:12px">Client names and phone numbers are not shown here on purpose. They belong to each business. Remove deletes a booking for good, so use it for spam or test bookings.</p></div>`; }
function system() {
  const s = D.system, c = s.config, chk = (ok, l, d) => `<div class="row"><div><b style="font-weight:600">${l}</b><div class="m">${d}</div></div><span class="pill ${ok ? 'ok' : 'bad'}">${ok ? 'OK' : 'Missing'}</span></div>`;
  const used = s.dbBytes ? Math.min(100, s.dbBytes / (500 * 1048576) * 100) : 0;
  return `<div class="grid two"><div class="panel"><h2>Health</h2>${chk(c.database, 'Database (D1)', 'Answering queries')}${chk(c.pepper, 'Password pepper', 'Used to protect every password')}${chk(c.adminLogin, 'Admin login', 'Access code is set')}
    <div class="row"><div><b style="font-weight:600">Failed sign-ins, 24 h</b><div class="m">Customer and admin attempts</div></div><span class="pill ${s.failedLogins24h > 20 ? 'bad' : s.failedLogins24h ? 'warn' : 'ok'}">${s.failedLogins24h}</span></div>
    <div class="row"><div><b style="font-weight:600">Signed-in customers</b><div class="m">Live sessions</div></div><b>${s.sessions}</b></div></div>
  <div class="panel"><h2>Database</h2><div class="row"><span>Size</span><b>${bytes(s.dbBytes)}</b></div><div class="meter"><i style="width:${Math.max(1, used)}%"></i></div><p class="m">Free plan limit is 500 MB.</p>
    ${Object.entries(s.counts).map(([k, v]) => `<div class="row"><span>${k}</span><b>${v}</b></div>`).join('')}
    <div class="acts"><button class="btn ghost sm" id="cleanup">Clear expired sessions and old rate limits</button></div></div></div>
  <div class="panel"><h2>Notes</h2><p class="m">Payments are recorded by hand here: no card details are ever stored. Deleting a business removes its page, bookings and sign-ins for good (payment records are kept for your accounts). Back up the database weekly with npm run backup.</p></div>`;
}

function draw() {
  root.innerHTML = `<div class="wrap"><div class="top"><div class="brand"><i class="mark"></i>Bookable <span class="tag">Admin</span></div><nav class="nav" aria-label="Sections">${[['overview', 'Overview'], ['payments', 'Payments'], ['users', 'Businesses'], ['bookings', 'Bookings'], ['system', 'System']].map(([k, l]) => `<button data-tab="${k}" class="${k === tab ? 'on' : ''}">${l}</button>`).join('')}</nav><span class="sp"></span><button class="btn ghost sm" id="refresh">Refresh</button><button class="btn ghost sm" id="out">Sign out</button></div>
  ${{ overview, payments, users, bookings, system }[tab]()}</div>`;
  const q = $('#q'); if (q) q.oninput = () => { filter = q.value; const pos = q.selectionStart; draw(); const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos); };
}

async function userModal(id) {
  const r = await api('GET', '/api/admin/users/' + id); if (!r.ok) return toast('Could not load that business');
  const u = r.data, b = u.biz, bl = u.billing, row = D.users.find(x => x.id === id) || { id, email: u.email, business: b && b.name, phone: b && b.phone };
  const v = document.createElement('div'); v.className = 'veil'; v.id = 'veil';
  const planOpts = Object.keys(PLAN_LABEL).map(k => `<option value="${k}"${k === bl.plan ? ' selected' : ''}>${PLAN_LABEL[k]}${k === 'standard' ? ' (£14.99)' : k === 'founding' ? ' (£4)' : ''}</option>`).join('');
  v.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="who" style="margin-bottom:14px">${av(b ? b.name : u.email)}<div><h3>${esc(b ? b.name : 'Not set up yet')}</h3><small class="m">${esc(u.email)}${b && b.phone ? ' · ' + esc(b.phone) : ''}</small></div></div>
    <div class="row"><span>Status</span>${statusPill(bl)}</div><div class="row"><span>Free trial ends</span><b>${dShort(bl.trialEnd)}</b></div>
    <h2 style="margin-top:18px">Plan</h2>
    <div class="fg"><label>Plan<select id="plan">${planOpts}</select></label><label>Price a month (£)<input type="number" id="price" min="0" max="1000" step="0.01" value="${bl.price}"></label></div>
    <div class="fg"><label>Paid up to<input type="date" id="paidUntil" value="${bl.paidUntil || ''}"></label><label>Note (only you see this)<input type="text" id="note" maxlength="300" value="${esc(bl.note)}"></label></div>
    <div class="acts" style="margin-top:4px"><button class="btn sm" id="saveplan">Save plan</button></div>
    <h2 style="margin-top:20px">Record a payment</h2>
    <div class="fg"><label>Amount (£)<input type="number" id="amount" min="0.01" step="0.01" value="${bl.price || ''}"></label><label>Method<select id="method">${Object.entries(METHOD_LABEL).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label></div>
    <div class="fg"><label>Date received<input type="date" id="paidOn" value="${D.today}" max="${D.today}"></label><label>Covers<select id="months"><option value="1">1 month</option><option value="2">2 months</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">12 months</option><option value="0">Just record it</option></select></label></div>
    <label>Note<input type="text" id="paynote" maxlength="200" placeholder="optional"></label>
    <div class="acts" style="margin-top:4px"><button class="btn sm" id="pay">Record payment</button>${waLink(row.phone, chaseText({ ...row, billing: bl })) ? '<button class="btn ghost sm" id="chase">Message on WhatsApp</button>' : ''}</div>
    ${u.payments.length ? `<h2 style="margin-top:20px">Payment history</h2>${u.payments.map(p => `<div class="row"><span>${dShort(p.paidOn)} · ${esc(METHOD_LABEL[p.method] || p.method)}${p.note ? ' · ' + esc(p.note) : ''}</span><b>${money(p.amount)}</b></div>`).join('')}` : ''}
    <h2 style="margin-top:20px">Account</h2>
    <label>Set a new password<input type="text" id="newpw" minlength="8" maxlength="200" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="at least 8 characters"></label>
    <div class="acts" style="margin-top:0"><button class="btn sm" id="setpw" type="button">Set password</button></div>
    <p class="m" style="margin-top:8px">This signs them out everywhere. Tell them the new password yourself.</p>
    <h2 style="margin-top:20px">Business</h2>
    <div class="row"><span>Type</span><b>${esc(tname(u.trade))}</b></div><div class="row"><span>Town</span><b>${esc(b ? b.town : '–')}</b></div><div class="row"><span>Joined</span><b>${ago(u.created)}</b></div><div class="row"><span>Signed in on</span><b>${u.sessions} device${u.sessions === 1 ? '' : 's'}</b></div>
    ${u.slug ? `<div class="row"><span>Booking page</span><a href="/app/#/book/${esc(u.slug)}" target="_blank" rel="noopener">/book/${esc(u.slug)}</a></div>` : ''}
    <h2 style="margin-top:18px">Services</h2>${u.services.map(s => `<div class="row"><span>${esc(s.name)}${s.hidden ? ' (hidden)' : ''}</span><b>${s.mins} min · ${money(s.price)}</b></div>`).join('') || '<p class="m">None.</p>'}
    <h2 style="margin-top:18px">Recent bookings</h2>${u.bookings.slice(0, 8).map(x => `<div class="row"><span>${dShort(x.date)} ${x.time} · ${esc(x.svc)}</span><span><span class="pill ${x.status === 'done' ? 'ok' : x.status === 'cancelled' ? 'bad' : ''}">${x.status}</span> <button class="btn danger sm" data-rmbooking="${x.id}" data-uid="${id}">Remove</button></span></div>`).join('') || '<p class="m">No bookings yet.</p>'}
    <div class="acts"><button class="btn ghost sm" id="so">Sign them out everywhere</button><button class="btn danger sm" id="del">Delete business</button><button class="btn ghost sm" id="x">Close</button></div></div>`;
  document.body.appendChild(v);
  const close = () => v.remove(), reopen = async () => { close(); await load(); userModal(id); };
  $('#x', v).onclick = close; v.onmousedown = e => { if (e.target === v) close(); };
  $('#plan', v).onchange = e => { const k = e.target.value; $('#price', v).value = PLAN_PRICE[k] ?? 7; };
  $('#saveplan', v).onclick = async () => {
    const r2 = await api('PUT', `/api/admin/users/${id}/billing`, { plan: $('#plan', v).value, price: +$('#price', v).value || 0, paidUntil: $('#paidUntil', v).value || null, note: $('#note', v).value });
    if (r2.ok) { toast('Plan saved'); reopen(); } else toast('Could not save the plan');
  };
  $('#pay', v).onclick = async () => {
    const amount = +$('#amount', v).value; if (!(amount > 0)) return toast('Enter the amount you received');
    const r2 = await api('POST', `/api/admin/users/${id}/payments`, { amount, method: $('#method', v).value, paidOn: $('#paidOn', v).value || undefined, months: +$('#months', v).value, note: $('#paynote', v).value });
    if (r2.ok) { toast('Payment recorded'); reopen(); } else toast('Could not record that payment');
  };
  const ch = $('#chase', v); if (ch) ch.onclick = () => chase(id, bl);
  $('#setpw', v).onclick = async e => {
    const b = e.target, pw = $('#newpw', v).value;
    if (pw.length < 8) return toast('Use at least 8 characters');
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Tap again to confirm'; return; }
    const r2 = await api('POST', `/api/admin/users/${id}/password`, { password: pw });
    toast(r2.ok ? 'Password changed. They are signed out.' : 'Could not change it');
    if (r2.ok) $('#newpw', v).value = '';
    b.textContent = 'Set password'; delete b.dataset.sure;
  };
  $('#so', v).onclick = async () => { const r2 = await api('POST', `/api/admin/users/${id}/signout`); toast(r2.ok ? 'Signed out' : 'Failed'); close(); };
  const del = $('#del', v); del.onclick = async () => {
    if (!del.dataset.sure) { del.dataset.sure = 1; del.textContent = 'Tap again to delete for good'; return; }
    const r2 = await api('DELETE', '/api/admin/users/' + id); close(); if (r2.ok) { toast('Business deleted'); load(); } else toast('Failed');
  };
}

async function chase(id, billing) {
  const u = D.users.find(x => x.id === id); if (!u) return;
  const link = waLink(u.phone, chaseText({ ...u, billing: billing || u.billing })); if (!link) return toast('No phone number for this business');
  window.open(link, '_blank', 'noopener');
  await api('POST', `/api/admin/users/${id}/chased`); load();
}

document.addEventListener('click', async e => {
  const t = e.target.closest('button,tr[data-user]'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; draw(); }
  else if (t.dataset.user) userModal(t.dataset.user);
  else if (t.dataset.chase) chase(t.dataset.chase);
  else if (t.dataset.rmbooking) {
    if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Tap again'; return; }
    const r = await api('DELETE', '/api/admin/bookings/' + t.dataset.rmbooking);
    if (!r.ok) return toast('Could not remove it');
    toast('Booking removed'); await load();
    if (t.dataset.uid) { $('#veil')?.remove(); userModal(t.dataset.uid); }
  }
  else if (t.dataset.delpay) {
    if (!t.dataset.sure) { t.dataset.sure = 1; t.textContent = 'Tap again'; return; }
    const r = await api('DELETE', '/api/admin/payments/' + t.dataset.delpay); toast(r.ok ? 'Payment deleted' : 'Could not delete it'); load();
  }
  else if (t.id === 'savesettings') {
    const r = await api('PUT', '/api/admin/settings', { payInfo: $('#payInfo').value, chaseTrial: $('#chaseTrial').value, chaseOverdue: $('#chaseOverdue').value });
    toast(r.ok ? 'Saved' : 'Could not save'); if (r.ok) load();
  }
  else if (t.id === 'refresh') { await load(); toast('Updated'); }
  else if (t.id === 'out') { await api('POST', '/api/admin/logout'); location.href = '/'; }
  else if (t.id === 'cleanup') { const r = await api('POST', '/api/admin/cleanup'); toast(r.ok ? `Cleared ${r.data.sessions} sessions, ${r.data.rateLimits} rate limits` : 'Failed'); load(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#veil')?.remove(); if (e.key === 'Enter' && e.target.matches('tr[data-user]')) userModal(e.target.dataset.user); });
load();
