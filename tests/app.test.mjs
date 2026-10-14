/* End-to-end test of the real app against the local Worker (npx wrangler dev --local --port 8787).
   Each "device" is a separate simulated browser with its own cookies. Run: node tests/app.test.mjs (npm run build first) */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), DIST = path.join(ROOT, 'dist'), BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0, passes = 0;
const ok = (c, m) => { if (c) { passes++; console.log('ok  ', m); } else { fails++; console.log('FAIL', m); } };
const wait = ms => new Promise(r => setTimeout(r, ms));
const sql = ['rl', 'bookings', 'profiles', 'sessions', 'users'].map(t => `DELETE FROM ${t};`).join(' ');
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "' + sql + '"', { stdio: 'ignore', cwd: ROOT });

let html = fs.readFileSync(path.join(DIST, 'app/index.html'), 'utf8').replace(/<link[^>]+>/g, '');
html = html.replace(/<script src="([^"]+)" defer><\/script>/, (m, src) => '<script>' + fs.readFileSync(DIST + src, 'utf8').split('</script>').join('<\\/script>') + '</script>');

/* one simulated browser: its own cookie jar, and fetch pointed at the Worker */
function device(hash = '') {
  let cookie = ''; const errors = [];
  const vc = new VirtualConsole(); vc.on('jsdomError', e => { if (!/scrollTo|getContext|HTMLCanvasElement/.test(e.message)) errors.push(e.message); });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', url: BASE + '/app/' + hash, pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.fetch = async (u, o = {}) => {
        const r = await fetch(new URL(u, BASE), { ...o, headers: { ...(o.headers || {}), ...(cookie ? { cookie } : {}) }, keepalive: undefined });
        for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; cookie = /=$/.test(kv) ? '' : kv; }
        return r;
      };
      w.scrollTo = () => {};
    },
  });
  return { w: dom.window, d: dom.window.document, errors, click: el => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })), submit: f => f.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })) };
}
const email = `owner${Date.now()}@example.com`, PW = 'a long enough password';

(async () => {
  /* ===== the owner creates an account ===== */
  const O = device(); await wait(600);
  ok(O.w.location.hash === '#/login' && O.d.querySelector('#loginform'), 'visitors with no account land on sign in');
  O.w.location.hash = '#/signup'; await wait(150);
  ok(/Create your account/.test(O.d.querySelector('h1').textContent), 'sign-up screen says Create your account');
  let f = O.d.getElementById('loginform');
  f.elements.email.value = 'not-an-email'; f.elements.password.value = PW; O.submit(f); await wait(100);
  ok(!O.d.getElementById('lerr').hidden, 'bad email is explained: ' + O.d.getElementById('lerr').textContent);
  f.elements.email.value = email; f.elements.password.value = 'short'; O.submit(f); await wait(100);
  ok(/8 characters/.test(O.d.getElementById('lerr').textContent), 'short password is explained');
  f.elements.password.value = PW; O.submit(f); await wait(1500);
  ok(O.d.getElementById('setup'), 'a new account goes on to set up the business');
  ok(O.w.eval('ME') === email || O.d.body.innerHTML.length > 0, 'signed in');

  /* ===== set up the business (with sample bookings) ===== */
  f = O.d.getElementById('setup');
  ok(f.querySelector('input[name=trade]:checked') === null && f.querySelector('input[name=trade]').required, 'no business type is pre-selected, so nobody ends up a barber by accident');
  f.querySelector('input[value=barber]').checked = true; f.querySelector('input[name=name]').value = 'Sam Okafor'; f.querySelector('input[name=phone]').value = '07123 456789'; f.querySelector('input[name=town]').value = 'Lichfield'; f.querySelector('input[name=sample]').checked = true;
  O.submit(f); await wait(1200);
  ok(O.d.querySelector('h1').textContent === 'Today', 'dashboard shows after set up');
  ok(O.w.eval('S') && O.w.eval('S').bookings.length >= 5, 'sample bookings were created on the server: ' + (O.w.eval('S') && O.w.eval('S').bookings.length));
  ok(/\/app\/#\/book\/sam-okafor$/.test(O.w.eval('bookingLink()')), 'the booking link is a real address: ' + O.w.eval('bookingLink()'));
  for (const v of ['calendar', 'page', 'reminders', 'plan', 'today']) { O.w.location.hash = '#/' + v; await wait(120); ok(O.d.querySelector('h1'), `screen ${v} renders: ${O.d.querySelector('h1').textContent}`); }

  /* ===== settings changes are saved to the server ===== */
  O.w.location.hash = '#/page'; await wait(120);
  const nameInput = O.d.querySelector('[data-model="biz.intro"]'); nameInput.value = 'Walk-ins welcome after 4pm.'; nameInput.dispatchEvent(new O.w.Event('input', { bubbles: true }));
  await wait(1200);
  let pub = await (await fetch(BASE + '/api/public/sam-okafor')).json();
  ok(pub.doc.biz.intro === 'Walk-ins welcome after 4pm.', 'an edit on the booking page editor reached the public page');

  /* ===== change the business type later ===== */
  const sel = O.d.querySelector('[data-model=trade]'); ok(sel && sel.value === 'barber' && O.d.getElementById('tl').hidden, 'the booking page editor shows the business type');
  sel.value = 'other'; sel.dispatchEvent(new O.w.Event('change', { bubbles: true })); await wait(100);
  ok(!O.d.getElementById('tl').hidden, 'choosing Something else shows the business type box');
  const lab = O.d.querySelector('[data-model="biz.tradeLabel"]'); lab.value = 'Personal trainer'; lab.dispatchEvent(new O.w.Event('input', { bubbles: true })); await wait(1200);
  pub = await (await fetch(BASE + '/api/public/sam-okafor')).json(); ok(pub.doc.trade === 'other' && pub.doc.biz.tradeLabel === 'Personal trainer', 'the new business type reached the public page');
  sel.value = 'barber'; sel.dispatchEvent(new O.w.Event('change', { bubbles: true })); await wait(1200);
  pub = await (await fetch(BASE + '/api/public/sam-okafor')).json(); ok(pub.doc.trade === 'barber' && !('tradeLabel' in pub.doc.biz), 'and it can be changed back');

  /* ===== a client on a different device books, with no account and nothing shared with the owner ===== */
  const C = device('#/book/sam-okafor'); await wait(900);
  ok(C.d.querySelectorAll('.svc').length === 4 && /Sam Okafor/.test(C.d.body.textContent), 'a client sees the services on their own device');
  ok(!C.w.eval('S') && !C.w.eval('ME'), 'the client device has no account and no owner data');
  C.click(C.d.querySelector('.svc')); await wait(100);
  const day = C.d.querySelector('.days button:not([disabled])'), dayOn = C.d.querySelector('.days button.on');
  const chosenDate = dayOn.dataset.date, slot = C.d.querySelector('.slots button'); ok(day && slot, 'there are open days and times');
  const chosenTime = slot.dataset.time; C.click(slot); await wait(50); C.click(C.d.querySelector('[data-c=next2]')); await wait(50);
  const cf = C.d.querySelector('form[data-c=form]'); ok(cf, 'details step');
  cf.elements.name.value = ''; cf.elements.phone.value = '07700 900555'; C.submit(cf); await wait(100); ok(!C.d.getElementById('cerr').hidden, 'missing name is explained');
  cf.elements.name.value = 'Test Client'; cf.elements.phone.value = '07700 900555'; cf.elements.note.value = 'Short back and sides'; C.submit(cf); await wait(900);
  ok(/You're booked in/.test(C.d.body.textContent), 'the client sees a confirmation');
  ok(C.w.eval('P').bookings.some(b => b.date === chosenDate && b.time === chosenTime), 'the page now treats that time as taken');
  ok(!C.w.slotsFor(chosenDate, 30, C.w.eval('P')).includes(chosenTime), 'the time is no longer offered to this client');

  /* the owner still has the app open from before: it should notice the booking without a reload */
  await O.w.refreshBookings();
  ok(O.w.eval('S').bookings.some(b => b.name === 'Test Client'), "the owner's open app picks up a new client booking by itself");
  ok(/New booking: Test Client/.test(O.d.querySelector('.toast')?.textContent || ''), 'and says so');

  /* ===== a second client tries for the same time: refused, and told nicely ===== */
  const C2 = device('#/book/sam-okafor'); await wait(900);
  C2.click(C2.d.querySelector('.svc')); await wait(100);
  C2.click(C2.d.querySelector(`.days button[data-date="${chosenDate}"]`)); await wait(50);
  ok(!C2.d.body.innerHTML.includes(`data-time="${chosenTime}"`), 'a second client is not offered the booked time');

  /* ===== the owner sees it, on any device ===== */
  const O2 = device(); await wait(500);
  O2.w.location.hash = '#/login'; await wait(100);
  f = O2.d.getElementById('loginform'); f.elements.email.value = email; f.elements.password.value = 'the wrong password'; O2.submit(f); await wait(1500);
  ok(!O2.d.getElementById('lerr').hidden && /don.t match/.test(O2.d.getElementById('lerr').textContent), 'wrong password is refused with a clear message');
  f.elements.password.value = PW; O2.submit(f); await wait(1800);
  ok(O2.d.querySelector('h1')?.textContent === 'Today', 'signing in on a second device works');
  const seen = O2.w.eval('S').bookings.find(b => b.name === 'Test Client');
  ok(seen && seen.date === chosenDate && seen.time === chosenTime && seen.phone === '07700 900555' && seen.note === 'Short back and sides' && seen.source === 'link', 'the owner sees the client booking, with the details, on the second device');
  ok(O2.w.eval('S').biz.intro === 'Walk-ins welcome after 4pm.', 'the owner\'s saved edits are there too');

  const ev = (dev, type) => new dev.w.Event(type, { bubbles: true });
  const plus = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

  /* ===== renaming a service sticks (clicking away from the box used to turn the name into NaN) ===== */
  O2.w.location.hash = '#/page'; await wait(250);
  const nm = O2.d.querySelectorAll('.svc-row')[0].querySelector('[data-svc=name]'); nm.value = 'Cut and finish'; nm.dispatchEvent(ev(O2, 'input')); nm.dispatchEvent(ev(O2, 'change')); await wait(1200);
  ok(O2.w.eval('S').services[0].name === 'Cut and finish' && (await (await fetch(BASE + '/api/public/sam-okafor')).json()).doc.services[0].name === 'Cut and finish', 'renaming a service sticks, even after clicking away');

  /* ===== customise the booking page ===== */
  O2.click(O2.d.querySelector('[data-act=accent][data-v=blue]'));
  const q = O2.d.querySelector('[data-model="biz.noteLabel"]'); q.value = 'Your dog’s name'; q.dispatchEvent(ev(O2, 'input'));
  const req = O2.d.querySelector('[data-model="biz.noteRequired"]'); req.checked = true; req.dispatchEvent(ev(O2, 'change'));
  const msg = O2.d.querySelector('[data-model="biz.confirmMessage"]'); msg.value = 'Please arrive 5 minutes early.'; msg.dispatchEvent(ev(O2, 'input'));
  const desc = O2.d.querySelectorAll('.svc-row')[1].querySelector('[data-svc=desc]'); desc.value = 'Includes a hot towel finish'; desc.dispatchEvent(ev(O2, 'input'));
  const hide = O2.d.querySelectorAll('.svc-row')[3].querySelector('[data-svc=shown]'); hide.checked = false; hide.dispatchEvent(ev(O2, 'change'));
  ok(O2.d.querySelector('#preview .client').style.getPropertyValue('--accent') === '#0071e3' && O2.d.querySelectorAll('#preview .svc').length === 3, 'the preview shows the new colour and the hidden service is gone, at once');
  await wait(1300);
  const K = device('#/book/sam-okafor'); await wait(900);
  ok(K.d.querySelectorAll('.svc').length === 3 && /hot towel finish/.test(K.d.body.textContent), 'clients see descriptions and never see a hidden service');
  ok(K.d.querySelector('.client').style.getPropertyValue('--accent') === '#0071e3', 'the client page uses the chosen accent colour');
  K.click(K.d.querySelector('.svc')); await wait(80);
  K.click(K.d.querySelector('.slots button')); await wait(50); K.click(K.d.querySelector('[data-c=next2]')); await wait(50);
  ok(/Your dog’s name/.test(K.d.querySelector('form[data-c=form]').textContent) && !/optional/.test(K.d.querySelector('form[data-c=form]').textContent.split('Your dog’s name')[1].slice(0, 12)), 'the booking form asks the owner\'s own question, marked as required');
  const kf = K.d.querySelector('form[data-c=form]'); kf.elements.name.value = 'Alex Dog'; kf.elements.phone.value = '07700 900444'; K.submit(kf); await wait(150);
  ok(/answer the question/.test(K.d.getElementById('cerr').textContent), 'a required question blocks the booking until it is answered');
  kf.elements.note.value = 'Biscuit'; K.submit(kf); await wait(1000);
  ok(/You're booked in/.test(K.d.body.textContent) && /arrive 5 minutes early/.test(K.d.body.textContent), 'after booking the client sees the owner\'s own message');
  await O2.w.refreshBookings(); ok(O2.w.eval('S').bookings.some(b => b.name === 'Alex Dog' && b.note === 'Biscuit' && b.phone === '07700 900444'), 'the booking made through the customised page reaches the owner, with the answer to their question');

  /* ===== more ways to add a booking ===== */
  O2.w.location.hash = '#/today'; await wait(250); O2.click(O2.d.querySelector('[data-act=add]')); await wait(100);
  let g = O2.d.getElementById('addform');
  g.elements.name.value = 'Test Client'; g.elements.name.dispatchEvent(ev(O2, 'input'));
  ok(g.elements.phone.value === '07700 900555', 'typing a returning client\'s name fills in their number');
  g.elements.svc.value = 'custom'; g.elements.svc.dispatchEvent(ev(O2, 'change'));
  ok(!O2.d.getElementById('customname').hidden, 'choosing Something else asks what it is');
  g.elements.svcName.value = 'Home visit'; g.elements.mins.value = '90'; g.elements.price.value = '55';
  g.elements.every.value = '7'; g.elements.every.dispatchEvent(ev(O2, 'change'));
  ok(!O2.d.getElementById('repeatcount').hidden && g.elements.done.disabled, 'choosing a repeat asks how many (and turns off Already done)');
  g.elements.count.value = '3'; g.elements.date.value = plus(chosenDate, 21); g.elements.time.value = '12:00';
  let opened = null; O2.w.open = () => (opened = { location: {}, close() {} });
  O2.submit(g); await wait(1200);
  const rep3 = O2.w.eval('S').bookings.filter(b => b.svcName === 'Home visit');
  ok(rep3.length === 3 && rep3.every(b => b.mins === 90 && b.price === 55 && b.name === 'Test Client') && rep3.map(b => b.date).join() === [0, 7, 14].map(n => plus(plus(chosenDate, 21), n)).join(), 'a repeating one-off service created 3 weekly bookings with its own length and price');
  ok(opened && /wa\.me\/447700900555/.test(opened.location.href || ''), 'WhatsApp opened with a confirmation for the client');
  O2.click(O2.d.querySelector('[data-act=add]')); await wait(100); g = O2.d.getElementById('addform');
  g.elements.name.value = 'Past Person'; g.elements.date.value = plus(chosenDate, -10); g.elements.done.checked = true; g.elements.wa.checked = false; O2.submit(g); await wait(1000);
  ok(O2.w.eval('S').bookings.find(b => b.name === 'Past Person')?.status === 'done', 'an appointment that already happened can be logged as done');

  /* ===== the owner adds a walk-in, changes a booking, signs out ===== */
  O2.click(O2.d.querySelector('[data-act=add]')); await wait(100);
  const af = O2.d.getElementById('addform'); af.elements.date.value = chosenDate; af.elements.time.value = chosenTime; af.elements.name.value = 'Walk-in'; O2.submit(af); await wait(700);
  ok(/overlaps/.test(O2.d.getElementById('adderr').textContent), 'adding a walk-in over a booked time is refused');
  af.elements.time.value = chosenTime.replace(/^(\d\d)/, h => String((+h + 4) % 24).padStart(2, '0')); O2.submit(af); await wait(900);
  ok(O2.w.eval('S').bookings.some(b => b.name === 'Walk-in'), 'a walk-in at a free time is saved');
  const target = O2.w.eval('S').bookings.find(b => b.name === 'Test Client');
  const okDone = await O2.w.patchBooking(target.id, { status: 'done' }); ok(okDone, 'a booking can be marked done');
  const again = device(); await wait(300); again.w.location.hash = '#/login'; await wait(100);
  f = again.d.getElementById('loginform'); f.elements.email.value = email; f.elements.password.value = PW; again.submit(f); await wait(1800);
  ok(again.w.eval('S').bookings.find(b => b.name === 'Test Client').status === 'done', 'the change survived a fresh sign-in');
  O2.w.location.hash = '#/today'; await wait(250);
  ok(/sample bookings/.test(O2.d.querySelector('.notice')?.textContent || ''), 'sample bookings are clearly labelled with a banner');
  O2.click(O2.d.querySelector('[data-act=rmsample]')); await wait(900);
  ok(O2.w.eval('S').bookings.every(b => b.source !== 'sample') && O2.w.eval('S').bookings.some(b => b.name === 'Test Client') && !O2.d.querySelector('.notice'), 'one click removes every sample booking, keeps real ones, and the banner goes');
  const walk = O2.w.eval('S').bookings.find(b => b.name === 'Walk-in'); O2.w.openDetail(walk.id); await wait(80);
  O2.click(O2.d.querySelector('[data-act=del1]')); await wait(50); O2.click(O2.d.querySelector('[data-act=del2]')); await wait(900);
  ok(!O2.w.eval('S').bookings.some(b => b.id === walk.id) && !(await (await fetch(BASE + '/api/public/sam-okafor')).json()).busy.some(b => b.date === walk.date && b.time === walk.time), 'a booking can be deleted, and its time is free again');
  O2.click(O2.d.querySelector('.side [data-act=signout]')); await wait(900);
  ok(O2.d.getElementById('loginform') && !O2.w.eval('ME') && !O2.w.eval('S'), 'signing out returns to sign in and clears the data from the browser');
  O2.w.location.hash = '#/today'; await wait(200); ok(O2.w.location.hash === '#/login', 'screens are locked again without an account');

  /* ===== a second business cannot use a taken link name; deleting the account removes everything ===== */
  const N = device(); await wait(400); N.w.location.hash = '#/signup'; await wait(100);
  f = N.d.getElementById('loginform'); f.elements.email.value = 'nails' + email; f.elements.password.value = PW; N.submit(f); await wait(1500);
  f = N.d.getElementById('setup'); f.querySelector('input[value=nails]').checked = true; f.querySelector('input[name=name]').value = 'Sam Okafor'; f.querySelector('input[name=phone]').value = '07123 456000'; f.querySelector('input[name=town]').value = 'Walsall'; N.submit(f); await wait(1200);
  ok(N.w.eval('S') && N.w.eval('S').biz.slug === 'sam-okafor-2', 'a second business with the same name gets its own link name: ' + (N.w.eval('S') && N.w.eval('S').biz.slug));
  N.w.location.hash = '#/plan'; await wait(150);
  N.click(N.d.querySelector('[data-act=deleteacct]')); await wait(50); N.click(N.d.querySelector('[data-act=deleteacct]')); await wait(900);
  ok(!N.w.eval('ME') && (await fetch(BASE + '/api/public/sam-okafor-2')).status === 404, 'deleting an account removes the business page');

  /* ===== "Something else": a business type that is not one of the three ===== */
  const X = device(); await wait(400); X.w.location.hash = '#/signup'; await wait(100);
  f = X.d.getElementById('loginform'); f.elements.email.value = 'pt' + email; f.elements.password.value = PW; X.submit(f); await wait(1500);
  f = X.d.getElementById('setup');
  ok(f.querySelector('#otherwrap').hidden, 'the business type box is hidden for the built-in trades');
  const radio = f.querySelector('input[value=other]'); radio.checked = true; radio.dispatchEvent(new X.w.Event('change', { bubbles: true }));
  ok(!f.querySelector('#otherwrap').hidden && f.querySelector('input[name=tradeLabel]').required, 'choosing Something else shows a required box for the business type');
  f.querySelector('input[name=tradeLabel]').value = 'Personal trainer'; f.querySelector('input[name=name]').value = 'Jo Fit'; f.querySelector('input[name=phone]').value = '07123 456111'; f.querySelector('input[name=town]').value = 'Cannock'; X.submit(f); await wait(1200);
  ok(X.d.querySelector('h1').textContent === 'Today' && X.w.eval('S').biz.tradeLabel === 'Personal trainer' && X.w.eval('S').services.length === 2, 'the business is created with its own type and starter services');
  const Y = device('#/book/jo-fit'); await wait(900);
  ok(/Personal trainer · Cannock/.test(Y.d.body.textContent) && /Jo Fit/.test(Y.d.body.textContent), 'the client booking page shows "Personal trainer · Cannock"');
  ok(/Personal trainer/.test(Y.d.title) && JSON.parse(Y.d.getElementById('ld').textContent)['@type'] === 'LocalBusiness', 'its page title and structured data use the custom type');
  X.w.location.hash = '#/plan'; await wait(150); X.click(X.d.querySelector('[data-act=deleteacct]')); await wait(50); X.click(X.d.querySelector('[data-act=deleteacct]')); await wait(900);

  const errs = [O, C, C2, O2, N, again, X, Y].flatMap(x => x.errors);
  ok(errs.length === 0, 'no JavaScript errors on any device' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
  console.log(fails ? `\n${fails} FAILED, ${passes} passed` : `\nall ${passes} app checks passed`);
  process.exit(fails ? 1 : 0);
})();
