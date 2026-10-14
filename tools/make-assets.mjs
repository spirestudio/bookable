/* Regenerates icons and social share images into src/static (the product screenshots in src/static/img are kept as they are). Needs Microsoft Edge. Run: node tools/make-assets.mjs */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC = path.join(ROOT, 'src/static'), TMP = 'C:/Users/reube/pcl'; // short path: Edge fails on very long ones
fs.mkdirSync(path.join(STATIC, 'img'), { recursive: true }); fs.mkdirSync(path.join(STATIC, 'og'), { recursive: true }); fs.mkdirSync(TMP, { recursive: true });
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
let n = 0;
function shot(url, out, w, h, scale = 1) {
  const prof = path.join(TMP, 'prof' + n++);
  execFileSync(EDGE, ['--headless=new', `--user-data-dir=${prof}`, '--no-first-run', '--hide-scrollbars', `--force-device-scale-factor=${scale}`, `--window-size=${w},${h}`, '--virtual-time-budget=9000', `--screenshot=${out}`, url], { timeout: 120000, stdio: 'ignore' });
  if (!fs.existsSync(out)) throw new Error('no screenshot for ' + url);
}

/* ---- icons ---- */
const mark = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${rx}" fill="#0b4a6f"/><rect x="18" y="11" width="9" height="42" rx="4.5" fill="#fff"/><circle cx="37" cy="38" r="11.5" fill="none" stroke="#fff" stroke-width="9"/></svg>`;
fs.writeFileSync(path.join(STATIC, 'favicon.svg'), mark(14));
const png = (svg, size) => sharp(Buffer.from(svg), { density: 384 }).resize(size, size).png().toBuffer();
fs.writeFileSync(path.join(STATIC, 'apple-touch-icon.png'), await png(mark(0), 180));
fs.writeFileSync(path.join(STATIC, 'icon-192.png'), await png(mark(0), 192));
fs.writeFileSync(path.join(STATIC, 'icon-512.png'), await png(mark(0), 512));
const p32 = await png(mark(6), 32), ico = Buffer.alloc(22);
ico.writeUInt16LE(0, 0); ico.writeUInt16LE(1, 2); ico.writeUInt16LE(1, 4);
ico.writeUInt8(32, 6); ico.writeUInt8(32, 7); ico.writeUInt8(0, 8); ico.writeUInt8(0, 9); ico.writeUInt16LE(1, 10); ico.writeUInt16LE(32, 12); ico.writeUInt32LE(p32.length, 14); ico.writeUInt32LE(22, 18);
fs.writeFileSync(path.join(STATIC, 'favicon.ico'), Buffer.concat([ico, p32]));
console.log('icons done');

/* ---- social share images (1200x630) ---- */
const font = fs.readFileSync(path.join(ROOT, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2')).toString('base64');
const OGS = { home: 'Fewer messages.\nFewer missed appointments.', barbers: 'Booking app\nfor barbers', 'nail-technicians': 'Booking app for\nnail technicians', 'dog-walkers': 'Booking app\nfor dog walkers', pricing: '£14.99 a month.\nFree for 7 days.' };
for (const [name, title] of Object.entries(OGS)) {
  const html = `<!doctype html><meta charset="utf-8"><style>@font-face{font-family:Inter;font-weight:100 900;src:url(data:font/woff2;base64,${font}) format("woff2")}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#f3f8fb;font-family:Inter,sans-serif;color:#0c1f2c;position:relative;overflow:hidden}
.b{position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700;letter-spacing:-.025em}.m{width:36px;height:36px;background:url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2064%2064%22%3E%3Crect%20width%3D%2264%22%20height%3D%2264%22%20rx%3D%2215%22%20fill%3D%22%230b4a6f%22%2F%3E%3Crect%20x%3D%2218%22%20y%3D%2211%22%20width%3D%229%22%20height%3D%2242%22%20rx%3D%224.5%22%20fill%3D%22%23fff%22%2F%3E%3Ccircle%20cx%3D%2237%22%20cy%3D%2238%22%20r%3D%2211.5%22%20fill%3D%22none%22%20stroke%3D%22%23fff%22%20stroke-width%3D%229%22%2F%3E%3C%2Fsvg%3E') center/contain no-repeat}
h1{position:absolute;left:72px;top:190px;font-size:98px;line-height:1;font-weight:700;letter-spacing:-.05em;max-width:1056px}
p{position:absolute;left:72px;bottom:70px;font-size:28px;color:#5d7585;letter-spacing:-.01em}.bar{position:absolute;left:0;right:0;bottom:0;height:22px;background:#0b4a6f}</style>
<div class="b"><i class="m"></i>Bookable</div><h1>${title.replace(/£/g, '&pound;').replace(/\n/g, '<br>')}</h1><p>Bookings, a calendar and WhatsApp reminders for one-person businesses.</p><div class="bar"></div>`;
  const f = path.join(TMP, `og_${name}.html`), out = path.join(TMP, `og_${name}.png`); fs.writeFileSync(f, html);
  shot(pathToFileURL(f).href, out, 1300, 800);
  await sharp(out).extract({ left: 0, top: 0, width: 1200, height: 630 }).png({ compressionLevel: 9 }).toFile(path.join(STATIC, 'og', name + '.png'));
}
console.log('og done');
