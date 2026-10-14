/* Search for businesses that chose to be listed on Bookable. No libraries; results are built with textContent. */
(function () {
  var form = document.getElementById('findform'), input = document.getElementById('q'), out = document.getElementById('results'), msg = document.getElementById('findmsg');
  if (!form || !input || !out) return;
  var timer = 0, seq = 0;

  function show(results, q) {
    out.textContent = '';
    if (!results.length) {
      msg.textContent = q ? 'No one called “' + q + '” is listed yet. Ask them for their Bookable booking link, or try another spelling.' : 'No businesses are listed yet. If your barber, nail technician or dog walker sent you a Bookable link, open that link to book. Businesses show up here once they switch on “List me in Bookable search”.';
      return;
    }
    msg.textContent = q ? results.length + (results.length === 1 ? ' business found' : ' businesses found') : 'Recently listed';
    results.forEach(function (r) {
      var a = document.createElement('a');
      a.href = '/app/#/book/' + encodeURIComponent(r.slug);
      var name = document.createElement('strong'); name.textContent = r.name;
      var meta = document.createElement('span'); meta.textContent = r.trade + ' · ' + r.town;
      var go = document.createElement('i'); go.setAttribute('aria-hidden', 'true'); go.textContent = 'Book →';
      a.appendChild(name); a.appendChild(meta); a.appendChild(go);
      out.appendChild(a);
    });
  }

  function run() {
    var q = input.value.trim(), mine = ++seq;
    msg.textContent = 'Searching…';
    fetch('/api/search?q=' + encodeURIComponent(q), { headers: { accept: 'application/json' } })
      .then(function (r) { if (r.status === 429) throw new Error('slow'); return r.json(); })
      .then(function (d) { if (mine === seq) show(d.results || [], q); })
      .catch(function (e) { if (mine === seq) { out.textContent = ''; msg.textContent = e.message === 'slow' ? 'Too many searches. Wait a minute and try again.' : 'Search is not working right now. Please try again.'; } });
  }

  var preset = new URLSearchParams(location.search).get('q'); if (preset) input.value = preset.slice(0, 50);
  input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 250); });
  form.addEventListener('submit', function (e) { e.preventDefault(); clearTimeout(timer); run(); });
  run();
})();
