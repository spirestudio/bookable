/* Runs on every public page: shows a signed-in owner the way back to their dashboard, and welcomes them
   when they arrive from the sign-in animation. No libraries, no inline script. */
(function () {
  var arrived = new URLSearchParams(location.search).get('in');
  fetch('/api/me', { headers: { accept: 'application/json' }, credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      if (!d || !d.email) {
        fetch('/api/client/me', { headers: { accept: 'application/json' }, credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (c) { var cl = document.getElementById('clientlogin'); if (c && c.email && cl) { cl.textContent = 'My bookings'; var m = document.getElementById('gc-main'), a = document.getElementById('gc-alt'); if (m) { m.textContent = 'Open my bookings'; m.href = '/client/'; } if (a) a.hidden = true; } }).catch(function () {});
        return;
      }
      var o = document.getElementById('ownerlogin');
      if (o) { o.textContent = 'Open dashboard'; o.href = '/app/#/today'; }
      var gm = document.getElementById('gb-main'), ga = document.getElementById('gb-alt'); if (gm) { gm.textContent = 'Open my dashboard'; gm.href = '/app/#/today'; } if (ga) ga.hidden = true;
      if (d.admin) { var nav = document.getElementById('ownerlogin'); if (nav && nav.parentNode) { var ad = document.createElement('a'); ad.className = 'login owner'; ad.href = '/admin/'; ad.textContent = 'Admin'; nav.parentNode.appendChild(ad); } }
      if (!arrived) return;
      var main = document.getElementById('main'); if (!main) return;
      var bar = document.createElement('div'); bar.className = 'signed'; bar.setAttribute('role', 'status');
      var inner = document.createElement('div'); inner.className = 'wrap';
      var p = document.createElement('p');
      p.textContent = arrived === 'new'
        ? 'You are in. Have a look at how Bookable works and the small print below, then open your dashboard to set up your booking page.'
        : 'Welcome back. Your bookings are one tap away.';
      var a = document.createElement('a'); a.className = 'btn accent sm'; a.href = '/app/#/today'; a.textContent = 'Open my dashboard';
      inner.appendChild(p); inner.appendChild(a); bar.appendChild(inner); main.insertBefore(bar, main.firstChild);
      if (history.replaceState) history.replaceState(null, '', location.pathname);
    })
    .catch(function () { /* not signed in, or offline: the page works the same */ });
})();
