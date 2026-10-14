/* Customer area: create an account, sign in, see and cancel your appointments. No libraries; everything is built with textContent. */
(function () {
  var root = document.getElementById('root'), me = null;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') e.textContent = attrs[k]; else if (k === 'on') Object.keys(attrs.on).forEach(function (ev) { e.addEventListener(ev, attrs.on[ev]); }); else e.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function api(method, path, body) {
    return fetch(path, { method: method, headers: { 'content-type': 'application/json', accept: 'application/json' }, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) })
      .then(function (r) { return r.text().then(function (t) { var d = null; try { d = t ? JSON.parse(t) : null; } catch (e) { /* not json */ } return { ok: r.ok, status: r.status, data: d }; }); })
      .catch(function () { return { ok: false, status: 0, data: null }; });
  }
  function toast(msg) { var t = h('div', { class: 'toast', role: 'status', text: msg }); document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  function fail(r) {
    var c = r.data && r.data.error;
    return r.status === 0 ? 'No connection. Check your internet and try again.' : c === 'email_taken' ? 'That email already has an account. Sign in instead.' : c === 'invalid_login' ? 'That email and password don’t match.' : c === 'invalid_email' ? 'Enter a valid email address.' : c === 'weak_password' ? 'That password is too easy to guess. Pick something less common.' : c === 'invalid_password' ? 'Use at least 8 characters for your password.' : c === 'slow_down' || r.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : 'Something went wrong. Please try again.';
  }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function pretty(ymd) { var p = ymd.split('-'), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()]; }
  function money(n) { return '£' + (Math.round(n * 100) % 100 === 0 ? Math.round(n) : (+n).toFixed(2)); }
  function wa(phone, text) { var d = String(phone || '').replace(/[^\d+]/g, ''); if (d[0] === '+') d = d.slice(1); else if (d.indexOf('00') === 0) d = d.slice(2); else if (d[0] === '0') d = '44' + d.slice(1); return 'https://wa.me/' + d + '?text=' + encodeURIComponent(text); }

  function shell(children) {
    root.textContent = '';
    root.appendChild(h('header', { class: 'top' }, [
      h('a', { class: 'brand', href: '/' }, [h('img', { src: '/favicon.svg', alt: '', width: '26', height: '26' }), 'Bookable']),
      h('a', { class: 'plain', href: '/find/' }, ['Find a business'])
    ]));
    root.appendChild(h('main', { id: 'main' }, children));
  }

  function renderAuth(mode) {
    document.title = (mode === 'signup' ? 'Create a customer account' : 'Customer sign in') + ' · Bookable';
    var err = h('p', { class: 'err', hidden: '', role: 'alert' });
    var name = h('input', { type: 'text', autocomplete: 'name', maxlength: '80', required: '' });
    var email = h('input', { type: 'email', autocomplete: 'email', maxlength: '254', required: '' });
    var pw = h('input', { type: 'password', autocomplete: mode === 'signup' ? 'new-password' : 'current-password', minlength: '8', maxlength: '200', required: '' });
    var go = h('button', { class: 'btn wide', type: 'submit', text: mode === 'signup' ? 'Create my account' : 'Sign in' });
    var form = h('form', { novalidate: '' }, [
      mode === 'signup' ? h('label', { class: 'f' }, [h('span', { text: 'Your name' }), name]) : null,
      h('label', { class: 'f' }, [h('span', { text: 'Email' }), email]),
      h('label', { class: 'f' }, [h('span', { text: 'Password' }), pw, mode === 'signup' ? h('small', { text: 'At least 8 characters.' }) : null]),
      go, err
    ]);
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      if (mode === 'signup' && !name.value.trim()) { err.textContent = 'Enter your name.'; err.hidden = false; return; }
      go.disabled = true;
      api('POST', mode === 'signup' ? '/api/client/signup' : '/api/client/login', mode === 'signup' ? { name: name.value.trim(), email: email.value.trim(), password: pw.value } : { email: email.value.trim(), password: pw.value }).then(function (r) {
        go.disabled = false;
        if (!r.ok) { err.textContent = fail(r); err.hidden = false; return; }
        load();
      });
    });
    function tab(m, label) { return h('button', { type: 'button', role: 'tab', 'aria-selected': String(mode === m), text: label, on: { click: function () { history.replaceState(null, '', m === 'signup' ? '#signup' : location.pathname); renderAuth(m); } } }); }
    shell([
      h('h1', { text: 'Your appointments, in one place.' }),
      h('p', { class: 'lede', text: 'A free customer account keeps your bookings together, lets you cancel in a tap, and fills in your details when you book.' }),
      h('div', { class: 'card' }, [h('div', { class: 'tabs', role: 'tablist' }, [tab('signin', 'Sign in'), tab('signup', 'Create account')]), form,
        h('p', { class: 'fine' }, [mode === 'signup' ? 'By creating an account you agree to the ' : 'New here? Create an account above. By signing in you agree to the ', h('a', { href: '/terms/', text: 'terms' }), ' and ', h('a', { href: '/privacy/', text: 'privacy policy' }), '. You must be 13 or over.']),
        h('p', { class: 'fine' }, ['Run a business? ', h('a', { href: '/app/#/login', text: 'Owner login' })])])
    ]);
    (mode === 'signup' ? name : email).focus();
  }

  function bookingRow(b, today) {
    var upcoming = b.status === 'booked' && b.date >= today, tags = [];
    if (b.status === 'cancelled') tags.push(h('span', { class: 'tag bad', text: 'Cancelled' }));
    else if (b.status === 'done' || (b.status === 'booked' && b.date < today)) tags.push(h('span', { class: 'tag ok', text: 'Done' }));
    else if (b.deposit && !b.depositPaid) tags.push(h('span', { class: 'tag warn', text: 'Deposit due' }));
    else tags.push(h('span', { class: 'tag', text: 'Booked' }));
    var acts = [];
    if (b.bizPhone) acts.push(h('a', { class: 'btn ghost sm', target: '_blank', rel: 'noopener', href: wa(b.bizPhone, 'Hi, it’s ' + (me.name || '').split(' ')[0] + '. About my ' + b.svcName.toLowerCase() + ' on ' + pretty(b.date) + ' at ' + b.time + '.'), text: 'Message ' + b.business }));
    if (b.slug) acts.push(h('a', { class: 'btn ghost sm', href: '/app/#/book/' + encodeURIComponent(b.slug), text: 'Book again' }));
    if (upcoming) {
      var c = h('button', { class: 'btn ghost sm', type: 'button', text: 'Cancel booking' });
      c.addEventListener('click', function () {
        if (!c.dataset.sure) { c.dataset.sure = '1'; c.textContent = 'Tap again to cancel'; return; }
        c.disabled = true;
        api('POST', '/api/client/bookings/' + b.id + '/cancel').then(function (r) { if (r.ok) { toast('Booking cancelled'); load(); } else { c.disabled = false; toast('Could not cancel. Message the business instead.'); } });
      });
      acts.push(c);
    }
    return h('div', { class: 'row' }, [
      h('div', {}, [h('b', { text: b.business }), h('div', { class: 'when', text: b.svcName + ' · ' + pretty(b.date) + ' at ' + b.time })]),
      h('div', { class: 'price' }, [money(b.price), h('div', {}, tags)]),
      acts.length ? h('div', { class: 'acts' }, acts) : null
    ]);
  }

  function renderHome() {
    document.title = 'My bookings · Bookable';
    var today = me.today, up = me.bookings.filter(function (b) { return b.status === 'booked' && b.date >= today; }).reverse(), past = me.bookings.filter(function (b) { return !(b.status === 'booked' && b.date >= today); });
    var kids = [h('h1', { text: 'Hi ' + (me.name || '').split(' ')[0] + '.' }), h('p', { class: 'lede', text: 'Your appointments with businesses on Bookable.' }), h('h2', { text: 'Upcoming' })];
    if (up.length) up.forEach(function (b) { kids.push(bookingRow(b, today)); });
    else kids.push(h('div', { class: 'empty' }, [h('p', { text: 'Nothing booked yet.' }), h('a', { class: 'btn', href: '/find/', text: 'Find a business' })]));
    if (past.length) { kids.push(h('h2', { text: 'Earlier' })); past.slice(0, 20).forEach(function (b) { kids.push(bookingRow(b, today)); }); }
    var del = h('button', { class: 'btn ghost sm', type: 'button', text: 'Delete my account' });
    del.addEventListener('click', function () {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete for good'; return; }
      api('DELETE', '/api/client/account').then(function () { me = null; toast('Account deleted'); renderAuth('signin'); });
    });
    kids.push(h('div', { class: 'foot' }, [
      h('button', { class: 'btn ghost sm', type: 'button', text: 'Sign out', on: { click: function () { api('POST', '/api/logout').then(function () { me = null; renderAuth('signin'); }); } } }),
      h('button', { class: 'btn ghost sm', type: 'button', text: 'Sign out of every device', on: { click: function () { api('POST', '/api/client/logout-all').then(function () { me = null; renderAuth('signin'); }); } } }),
      del
    ]));
    kids.push(h('p', { class: 'fine', text: 'Businesses keep a record of your bookings for their own diary. Deleting your account unlinks them from you.' }));
    shell(kids);
  }

  function load() {
    api('GET', '/api/client/me').then(function (r) {
      if (r.ok && r.data && r.data.email) { me = r.data; renderHome(); }
      else renderAuth(location.hash === '#signup' ? 'signup' : 'signin');
    });
  }
  load();
})();
