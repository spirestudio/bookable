/* The QR generator must produce codes a real decoder can read. Run: node tests/qr.test.mjs */
import fs from 'node:fs';
import jsQR from 'jsqr';
const win = {}; new Function('window', fs.readFileSync('src/static/qr.js', 'utf8'))(win);
let fails = 0; const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
const texts = ['https://mybookable.co.uk/app/#/book/demo-barbers', 'https://mybookable.co.uk/app/#/book/a', 'https://mybookable.co.uk/app/#/book/sam-the-barber-lichfield', 'https://mybookable.co.uk/app/#/book/' + 'x'.repeat(40), 'hello', 'https://mybookable.co.uk/app/#/book/' + 'long-business-name-'.repeat(3)];
for (const t of texts) {
  const q = win.BookableQR.make(t), S = 8, N = q.size + 8, w = N * S, px = new Uint8ClampedArray(w * w * 4).fill(255);
  for (let y = 0; y < q.size; y++) for (let x = 0; x < q.size; x++) if (q.dark(x, y)) for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const i = (((y + 4) * S + dy) * w + (x + 4) * S + dx) * 4; px[i] = px[i + 1] = px[i + 2] = 0; }
  const r = jsQR(px, w, w);
  ok(r && r.data === t, `decodes: ${t.slice(0, 60)} (version ${(q.size - 17) / 4})`);
}
console.log(fails ? `\n${fails} QR check(s) FAILED` : '\nall QR checks passed'); process.exit(fails ? 1 : 0);
