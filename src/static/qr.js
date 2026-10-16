/* Small QR code generator (byte mode, error correction M, versions 1 to 6). Based on the published QR Code standard algorithm.
   BookableQR.make(text) -> { size, dark(x, y) }.   BookableQR.svg(text, px) -> an SVG string with the quiet zone included. */
(function () {
  var ECC = [0, 10, 16, 26, 18, 24, 16], BLOCKS = [0, 1, 1, 1, 2, 2, 4];
  function rawModules(v) { var r = (16 * v + 128) * v + 64; if (v >= 2) { var n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; } return r; }
  function align(v) { if (v === 1) return []; var n = Math.floor(v / 7) + 2, step = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, res = [6]; for (var p = v * 4 + 10; res.length < n; p -= step) res.splice(1, 0, p); return res; }
  function mul(x, y) { var z = 0; for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z; }
  function divisor(d) { var r = []; for (var i = 0; i < d - 1; i++) r.push(0); r.push(1); var root = 1; for (i = 0; i < d; i++) { for (var j = 0; j < r.length; j++) { r[j] = mul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; } root = mul(root, 2); } return r; }
  function remainder(data, div) { var r = div.map(function () { return 0; }); data.forEach(function (b) { var f = b ^ r.shift(); r.push(0); div.forEach(function (c, i) { r[i] ^= mul(c, f); }); }); return r; }
  function bit(x, i) { return ((x >>> i) & 1) !== 0; }

  function make(text) {
    var bytes = unescape(encodeURIComponent(text)).split('').map(function (c) { return c.charCodeAt(0); });
    var ver, cap;
    for (ver = 1; ver <= 6; ver++) { cap = Math.floor(rawModules(ver) / 8) - ECC[ver] * BLOCKS[ver]; if (bytes.length + 2 <= cap) break; }
    if (ver > 6) throw new Error('text too long for the QR code');
    var bits = []; function put(v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); }
    put(4, 4); put(bytes.length, 8); bytes.forEach(function (b) { put(b, 8); });
    var capBits = cap * 8; put(0, Math.min(4, capBits - bits.length)); while (bits.length % 8) bits.push(0);
    for (var pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = []; for (var i = 0; i < bits.length; i += 8) { var b = 0; for (var k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; data.push(b); }

    var nb = BLOCKS[ver], el = ECC[ver], raw = Math.floor(rawModules(ver) / 8), shortN = nb - raw % nb, shortLen = Math.floor(raw / nb), blocks = [], div = divisor(el), pos = 0;
    for (i = 0; i < nb; i++) { var dat = data.slice(pos, pos + shortLen - el + (i < shortN ? 0 : 1)); pos += dat.length; var ecc = remainder(dat, div); if (i < shortN) dat.push(0); blocks.push(dat.concat(ecc)); }
    var all = []; for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (bl, j) { if (i !== shortLen - el || j >= shortN) all.push(bl[i]); });

    var size = ver * 4 + 17, mod = [], fn = []; for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setF(x, y, d) { mod[y][x] = d; fn[y][x] = true; }
    for (i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0); }
    function finder(x, y) { for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) { var d = Math.max(Math.abs(dx), Math.abs(dy)), xx = x + dx, yy = y + dy; if (xx >= 0 && xx < size && yy >= 0 && yy < size) setF(xx, yy, d !== 2 && d !== 4); } }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var ap = align(ver); ap.forEach(function (a, ai) { ap.forEach(function (b, bi) { if ((ai === 0 && bi === 0) || (ai === 0 && bi === ap.length - 1) || (ai === ap.length - 1 && bi === 0)) return; for (var dy = -2; dy <= 2; dy++) for (var dx = -2; dx <= 2; dx++) setF(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }); });
    function format(mask) {
      var d = (0 << 3) | mask, rem = d; for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var f = ((d << 10) | rem) ^ 0x5412, j;
      for (j = 0; j <= 5; j++) setF(8, j, bit(f, j)); setF(8, 7, bit(f, 6)); setF(8, 8, bit(f, 7)); setF(7, 8, bit(f, 8)); for (j = 9; j < 15; j++) setF(14 - j, 8, bit(f, j));
      for (j = 0; j < 8; j++) setF(size - 1 - j, 8, bit(f, j)); for (j = 8; j < 15; j++) setF(8, size - 15 + j, bit(f, j)); setF(8, size - 8, true);
    }
    format(0);
    var idx = 0; for (var right = size - 1; right >= 1; right -= 2) { if (right === 6) right = 5; for (var vert = 0; vert < size; vert++) for (var j = 0; j < 2; j++) { var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert; if (!fn[y][x] && idx < all.length * 8) { mod[y][x] = bit(all[idx >>> 3], 7 - (idx & 7)); idx++; } } }
    function inv(m, x, y) { return [(x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0, (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, x * y % 2 + x * y % 3 === 0, (x * y % 2 + x * y % 3) % 2 === 0, ((x + y) % 2 + x * y % 3) % 2 === 0][m]; }
    function mask(m) { for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) if (!fn[y][x] && inv(m, x, y)) mod[y][x] = !mod[y][x]; }
    function penalty() {
      var s = 0, x, y, run, i2;
      for (y = 0; y < size; y++) { run = 1; for (x = 1; x < size; x++) { if (mod[y][x] === mod[y][x - 1]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
      for (x = 0; x < size; x++) { run = 1; for (y = 1; y < size; y++) { if (mod[y][x] === mod[y - 1][x]) { run++; if (run === 5) s += 3; else if (run > 5) s++; } else run = 1; } }
      for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) if (mod[y][x] === mod[y][x + 1] && mod[y][x] === mod[y + 1][x] && mod[y][x] === mod[y + 1][x + 1]) s += 3;
      var dark = 0; for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
      s += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10; i2 = 0; return s;
    }
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) { mask(m); format(m); var p = penalty(); if (p < bestP) { bestP = p; best = m; } mask(m); }
    mask(best); format(best);
    return { size: size, dark: function (x, y) { return x >= 0 && y >= 0 && x < size && y < size && mod[y][x]; } };
  }
  function svg(text, px) {
    var q = make(text), n = q.size + 8, d = '';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.dark(x, y)) d += 'M' + (x + 4) + ' ' + (y + 4) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" width="' + px + '" height="' + px + '" shape-rendering="crispEdges"><rect width="' + n + '" height="' + n + '" fill="#fff"/><path d="' + d + '" fill="#0c1f2c"/></svg>';
  }
  window.BookableQR = { make: make, svg: svg };
})();
