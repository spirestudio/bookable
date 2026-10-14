/* Admin panel API (access code, plans, payments, chasing, removing bookings) against a locally running Worker.
   Needs ADMIN_CODE in .dev.vars. Start: npx wrangler dev --local --port 8787   Run: node tests/admin.test.mjs */
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };
const devVars = fs.existsSync('.dev.vars') ? fs.readFileSync('.dev.vars', 'utf8') : '';
const CODE = (devVars.match(/^ADMIN_CODE=(.+)$/m) || [])[1]?.trim();
if (!CODE) { console.log('Add a line  ADMIN_CODE=some-local-test-code  to .dev.vars first.'); process.exit(1); }

const sql = q => JSON.parse(execSync(`npx --yes wrangler@4 d1 execute pencil-db --local --json --command "${q.replace(/"/g, '\\"')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }))[0].results;
sql("DELETE FROM rl; DELETE FROM bookings; DELETE FROM profiles; DELETE FROM sessions; DELETE FROM users; DELETE FROM billing; DELETE FROM payments; DELETE FROM settings;");

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { 'content-type': 'application/json' }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data };
  }
}
const day = on => ({ on, start: '09:00', end: '17:30' });
const doc = (slug, name) => ({
  trade: 'barber', biz: { name, slug, phone: '07123 456789', town: 'Lichfield', intro: 'Book here.' },
  services: [{ id: 'cut', name: 'Haircut', mins: 30, price: 18 }],
  hours: { 0: day(false), 1: day(false), 2: day(true), 3: day(true), 4: day(true), 5: day(true), 6: day(false) },
  timeOff: [], rules: { lead: 2, ahead: 28, buffer: 0, slot: 30 },
  reminders: { confirm: true, before: '24', askConfirm: true, template: 'Hi {name}, reminder for your {service} {day} at {time}.' },
});
const today = () => { const p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date()); const g = t => p.find(x => x.type === t).value; return `${g('year')}-${g('month')}-${g('day')}`; };
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6);
  const admin = new Client(), anon = new Client(), newbie = new Client(), oldie = new Client(), freebie = new Client();
  let r;

  /* ---- who can get in ---- */
  ok((await anon.req('GET', '/api/admin/data')).status === 401, 'admin data needs a sign-in');
  ok((await anon.req('POST', '/api/admin/login', { code: 'wrong-code' })).status === 401, 'a wrong access code is refused');
  ok((await anon.req('POST', '/api/admin/login', { code: '' })).status === 401, 'an empty access code is refused');
  ok((await anon.req('POST', '/api/admin/login', { code: CODE.slice(0, -1) })).status === 401, 'a nearly-right code is refused');
  ok((await admin.req('POST', '/api/admin/login', { code: CODE })).status === 200, 'the right access code signs in');

  /* ---- three businesses ---- */
  const slugs = { n: 'new-' + tag, o: 'old-' + tag, f: 'free-' + tag };
  for (const [c, k, nm] of [[newbie, 'n', 'New Cuts'], [oldie, 'o', 'Old Cuts'], [freebie, 'f', 'Free Cuts']]) {
    ok((await c.req('POST', '/api/signup', { email: `${k}-${tag}@example.com`, password: 'a long enough password' })).status === 201, `${nm} signs up`);
    ok((await c.req('PUT', '/api/profile', { doc: doc(slugs[k], nm) })).status === 200, `${nm} saves a page`);
  }
  r = await newbie.req('GET', '/api/admin/data'); ok(r.status === 401, 'a business owner cannot open the admin panel with their own sign-in');
  ok((await newbie.req('PUT', '/api/admin/settings', { payInfo: 'x', chaseTrial: 'x', chaseOverdue: 'x' })).status === 401, 'a business owner cannot change admin settings');

  const find = async n => { const d = (await admin.req('GET', '/api/admin/data')).data; return { d, u: d.users.find(x => x.business === n) }; };
  let { d, u: uNew } = await find('New Cuts');
  ok(uNew && uNew.billing.status === 'trial' && uNew.billing.daysLeft >= 6 && uNew.billing.price === 14.99, 'a new business starts on a 7-day trial at £14.99');
  ok(d.billing.trial === 3 && d.billing.paying === 0, 'the dashboard counts three trials and no payers');

  /* ---- overdue after the trial ---- */
  sql(`UPDATE users SET created = ${Date.now() - 60 * 864e5} WHERE email = 'o-${tag}@example.com'`);
  const { u: uOld } = await find('Old Cuts');
  ok(uOld.billing.status === 'overdue' && uOld.billing.overdueDays >= 51 && uOld.billing.overdueDays <= 54, `a business 60 days old with no payment is overdue (${uOld.billing.overdueDays} days)`);
  d = (await admin.req('GET', '/api/admin/data')).data;
  ok(d.billing.overdue === 1 && d.billing.owed === 14.99, 'the dashboard shows one overdue and £14.99 owed');
  ok(uOld.phone === '07123 456789', 'the admin has the business WhatsApp number to chase on');

  /* ---- recording payments ---- */
  const bad = async b => (await admin.req('POST', `/api/admin/users/${uOld.id}/payments`, b)).status;
  ok(await bad({ amount: 0, method: 'bank' }) === 422, 'a £0 payment is refused');
  ok(await bad({ amount: 7, method: 'bitcoin' }) === 422, 'an unknown payment method is refused');
  ok(await bad({ amount: 7, method: 'bank', paidOn: addDays(today(), 3) }) === 422, 'a payment dated in the future is refused');
  ok(await bad({ amount: 7, method: 'bank', months: 99 }) === 422, 'more than 24 months is refused');
  ok(await bad({ amount: 'seven', method: 'bank' }) === 422, 'a non-number amount is refused');
  ok((await admin.req('POST', '/api/admin/users/11111111-1111-1111-1111-111111111111/payments', { amount: 7, method: 'bank' })).status === 404, 'a payment for a business that does not exist is a 404');

  r = await admin.req('POST', `/api/admin/users/${uOld.id}/payments`, { amount: 7, method: 'bank', note: 'ref OLD' });
  ok(r.status === 201 && r.data.billing.status === 'paid', 'recording a payment turns an overdue business to paid');
  const expectUntil = (() => { const d2 = new Date(today() + 'T00:00:00Z'); d2.setUTCMonth(d2.getUTCMonth() + 1); return d2.toISOString().slice(0, 10); })();
  ok(Math.abs((new Date(r.data.billing.paidUntil) - new Date(expectUntil)) / 864e5) <= 3, `a late payment covers one month from today (${r.data.billing.paidUntil})`);
  ok((await find('Old Cuts')).d.billing.overdue === 0 && (await find('Old Cuts')).d.billing.collected === 7, 'overdue clears and the month total shows £7 collected');

  r = await admin.req('POST', `/api/admin/users/${uNew.id}/payments`, { amount: 7, method: 'cash' });
  ok(r.status === 201 && r.data.billing.status === 'paid' && r.data.billing.paidUntil > uNew.billing.trialEnd, 'paying during the trial adds a month after the trial, so no free days are lost');

  /* ---- plans ---- */
  r = await admin.req('PUT', `/api/admin/users/${uOld.id}/billing`, { plan: 'founding', price: 4, paidUntil: r.data.billing.paidUntil, note: 'early supporter' });
  ok(r.status === 200 && r.data.billing.price === 4 && r.data.billing.plan === 'founding' && r.data.billing.note === 'early supporter', 'a founding plan at £4 can be set with a private note');
  ok((await admin.req('PUT', `/api/admin/users/${uOld.id}/billing`, { plan: 'platinum', price: 4 })).status === 422, 'an unknown plan is refused');
  ok((await admin.req('PUT', `/api/admin/users/${uOld.id}/billing`, { plan: 'custom', price: -5 })).status === 422, 'a negative price is refused');
  ok((await admin.req('PUT', `/api/admin/users/${uOld.id}/billing`, { plan: 'custom', price: 5, paidUntil: 'next week' })).status === 422, 'a bad date is refused');

  const { u: uFree } = await find('Free Cuts');
  sql(`UPDATE users SET created = ${Date.now() - 90 * 864e5} WHERE email = 'f-${tag}@example.com'`);
  r = await admin.req('PUT', `/api/admin/users/${uFree.id}/billing`, { plan: 'free', price: 99 });
  ok(r.data.billing.status === 'free' && r.data.billing.price === 0, 'a free plan is never overdue and costs nothing, whatever price is sent');
  r = await admin.req('PUT', `/api/admin/users/${uFree.id}/billing`, { plan: 'cancelled', price: 0 });
  ok(r.data.billing.status === 'cancelled', 'a cancelled plan is not chased');
  d = (await admin.req('GET', '/api/admin/data')).data;
  ok(d.billing.overdue === 0, 'free and cancelled businesses do not count as overdue');

  /* ---- chase + history + settings ---- */
  ok((await admin.req('POST', `/api/admin/users/${uOld.id}/chased`)).status === 200, 'marking someone as chased works');
  d = (await admin.req('GET', '/api/admin/data')).data;
  ok(d.users.find(x => x.id === uOld.id).billing.chased > 0, 'the last-chased time is saved');
  r = await admin.req('GET', '/api/admin/users/' + uOld.id);
  ok(r.data.payments.length === 1 && r.data.payments[0].amount === 7 && r.data.billing.plan === 'founding', 'a business sheet shows its payment history and plan');
  const payId = r.data.payments[0].id;
  r = await admin.req('PUT', '/api/admin/settings', { payInfo: 'Bank transfer to R Test, 00-00-00 / 12345678', chaseTrial: 'Hi {name}, trial ends {date}.', chaseOverdue: 'Hi {name}, {price} is {days} overdue. {payinfo}' });
  ok(r.status === 200 && r.data.settings.payInfo.startsWith('Bank transfer'), 'payment details and chase messages save');
  ok((await admin.req('PUT', '/api/admin/settings', { payInfo: 'x'.repeat(900), chaseTrial: 'a', chaseOverdue: 'b' })).status === 422, 'oversized settings are refused');
  r = await newbie.req('GET', '/api/me');
  ok(r.data.billing.status === 'paid' && r.data.payInfo.startsWith('Bank transfer'), 'the business owner sees their real plan status and how to pay');
  ok(!('note' in r.data.billing) && !('chased' in r.data.billing), 'owners never see the private note or chase history');
  ok((await admin.req('DELETE', '/api/admin/payments/' + payId)).status === 200, 'a payment record can be deleted');
  ok((await admin.req('DELETE', '/api/admin/payments/' + payId)).status === 404, 'deleting it twice is a 404');

  /* ---- removing a booking ---- */
  const bid = '22222222-2222-4222-8222-222222222222', owner = (await admin.req('GET', '/api/admin/users/' + uNew.id)).data.id;
  sql(`INSERT INTO bookings (id, user_id, date, start, mins, svc_id, svc_name, price, name, phone, note, status, source, created) VALUES ('${bid}', '${owner}', '${addDays(today(), 3)}', 600, 30, 'cut', 'Haircut', 18, 'Spam Person', '07000000000', '', 'booked', 'link', ${Date.now()})`);
  ok((await admin.req('GET', '/api/admin/users/' + uNew.id)).data.bookings.some(b => b.id === bid), 'the booking shows on the business sheet');
  ok(!JSON.stringify((await admin.req('GET', '/api/admin/data')).data).includes('Spam Person'), 'client names are not exposed in the admin data');
  ok((await newbie.req('DELETE', '/api/admin/bookings/' + bid)).status === 401, 'a business owner cannot use the admin remove-booking route');
  ok((await admin.req('DELETE', '/api/admin/bookings/' + bid)).status === 200, 'admin removes the booking');
  ok(!(await admin.req('GET', '/api/admin/users/' + uNew.id)).data.bookings.some(b => b.id === bid), 'and it is gone');
  ok((await admin.req('DELETE', '/api/admin/bookings/' + bid)).status === 404, 'removing it again is a 404');

  /* ---- deleting an account keeps payment records ---- */
  const pay2 = (await admin.req('GET', '/api/admin/users/' + uNew.id)).data.payments.length;
  ok((await newbie.req('DELETE', '/api/account')).status === 204, 'the business deletes their own account');
  ok(sql(`SELECT COUNT(*) c FROM billing WHERE user_id = '${uNew.id}'`)[0].c === 0, 'their billing row is removed');
  ok(sql(`SELECT COUNT(*) c FROM payments WHERE user_id = '${uNew.id}'`)[0].c === pay2 && pay2 >= 1, 'their payment record is kept for accounts');

  /* ---- setting a new password for someone ---- */
  r = await oldie.req('GET', '/api/me'); ok(r.data.email === `o-${tag}@example.com`, 'Old Cuts is signed in before the reset');
  ok((await anon.req('POST', `/api/admin/users/${uOld.id}/password`, { password: 'a brand new password' })).status === 401, 'only the admin can set someone’s password');
  ok((await admin.req('POST', `/api/admin/users/${uOld.id}/password`, { password: 'short' })).status === 422, 'a password under 8 characters is refused');
  ok((await admin.req('POST', '/api/admin/users/11111111-1111-1111-1111-111111111111/password', { password: 'a brand new password' })).status === 404, 'a business that does not exist is a 404');
  ok((await admin.req('POST', `/api/admin/users/${uOld.id}/password`, { password: 'a brand new password' })).status === 200, 'the admin sets a new password');
  ok((await oldie.req('GET', '/api/me')).data.email === null, 'the old sign-in on their devices stops working');
  ok((await new Client().req('POST', '/api/login', { email: `o-${tag}@example.com`, password: 'a long enough password' })).status === 401, 'the old password no longer works');
  ok((await new Client().req('POST', '/api/login', { email: `o-${tag}@example.com`, password: 'a brand new password' })).status === 200, 'the new password works');

  /* ---- sign out + brute-force protection (last: it locks this machine out for 15 min) ---- */
  ok((await admin.req('POST', '/api/admin/logout')).status === 200 && (await admin.req('GET', '/api/admin/data')).status === 401, 'signing out ends the admin session');
  let locked = 0; for (let i = 0; i < 8; i++) if ((await new Client().req('POST', '/api/admin/login', { code: 'guess-' + i })).status === 429) locked++;
  ok(locked >= 1, 'repeated wrong codes get locked out');
  ok((await new Client().req('POST', '/api/admin/login', { code: CODE })).status === 429, 'even the right code is refused while locked out');
  sql("DELETE FROM rl");

  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} admin checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
