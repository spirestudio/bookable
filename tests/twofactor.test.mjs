/* Two-factor sign-in (authenticator app codes) against a locally running Worker.
   Start: npx wrangler dev --local --port 8787   Run: node tests/twofactor.test.mjs */
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const BASE = process.env.BASE || 'http://localhost:8787';
let fails = 0;
const ok = (c, m) => { if (!c) fails++; console.log(c ? 'ok  ' : 'FAIL', m); };
execSync('npx --yes wrangler@4 d1 execute pencil-db --local --command "DELETE FROM rl"', { stdio: 'ignore' });

class Client {
  constructor() { this.cookie = ''; }
  async req(method, path, body) {
    const h = { 'content-type': 'application/json' }; if (this.cookie) h.cookie = this.cookie;
    const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
    for (const c of r.headers.getSetCookie?.() || []) { const kv = c.split(';')[0]; this.cookie = /=$/.test(kv) ? '' : kv; }
    const text = await r.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
    return { status: r.status, data, text };
  }
}
/* an independent TOTP implementation, so the test does not just agree with itself */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const dec = s => { let bits = 0, val = 0; const out = []; for (const c of s) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; val &= (1 << bits) - 1; } } return Buffer.from(out); };
const code = (secret, offset = 0) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + offset)); const h = crypto.createHmac('sha1', dec(secret)).update(b).digest(), o = h[19] & 15; return String(((h.readUInt32BE(o) & 0x7fffffff) % 1e6)).padStart(6, '0'); };

(async () => {
  const tag = Math.random().toString(36).slice(2, 6), A = new Client(), B = new Client(), anon = new Client(), email = `tf-${tag}@example.com`, pw = 'a long enough password';
  ok((await A.req('POST', '/api/signup', { email, password: pw })).status === 201, 'owner signs up');
  ok((await A.req('GET', '/api/me')).data.twofa === false, 'two-factor starts off');
  ok((await anon.req('POST', '/api/2fa/setup', {})).status === 401, 'setup needs a sign-in');

  const setup = await A.req('POST', '/api/2fa/setup', {});
  ok(setup.status === 200 && /^[A-Z2-7]{32}$/.test(setup.data.secret) && setup.data.uri.startsWith('otpauth://totp/Bookable:'), 'setup returns a secret and an authenticator link');
  ok((await A.req('GET', '/api/me')).data.twofa === false, 'it is not on until a code is confirmed');
  ok((await A.req('POST', '/api/2fa/enable', { code: '000000' })).status === 422, 'a wrong code does not turn it on');
  const en = await A.req('POST', '/api/2fa/enable', { code: code(setup.data.secret) });
  ok(en.status === 200 && en.data.backup.length === 8 && /^[a-z2-7]{4}-[a-z2-7]{4}$/.test(en.data.backup[0]), 'the right code turns it on and gives 8 recovery codes');
  ok((await A.req('GET', '/api/me')).data.twofa === true, 'two-factor is now on');
  ok(!JSON.stringify(await (await fetch(BASE + '/api/me', { headers: { cookie: A.cookie } })).text()).includes(setup.data.secret), 'the secret is never sent back again');

  /* signing in */
  let r = await B.req('POST', '/api/login', { email, password: pw });
  ok(r.status === 401 && r.data.error === 'code_required', 'a password alone is no longer enough');
  ok((await B.req('GET', '/api/me')).data.email === null, 'and no session was started');
  ok((await B.req('POST', '/api/login', { email, password: 'wrong password here', code: code(setup.data.secret) })).data.error === 'invalid_login', 'a wrong password is still refused, whatever the code');
  ok((await B.req('POST', '/api/login', { email, password: pw, code: '123456' })).data.error === 'invalid_code', 'a wrong code is refused');
  ok((await B.req('POST', '/api/login', { email, password: pw, code: code(setup.data.secret) })).status === 200, 'password + right code signs in');
  ok((await B.req('GET', '/api/me')).data.email === email, 'and the session works');
  const C = new Client();
  ok((await C.req('POST', '/api/login', { email, password: pw, code: code(setup.data.secret, -1) })).status === 200, 'the previous 30-second code is still accepted (clock drift)');
  const D = new Client();
  ok((await D.req('POST', '/api/login', { email, password: pw, code: code(setup.data.secret, 5) })).status === 401, 'a code from far away in time is refused');

  /* recovery codes work once */
  const rc = en.data.backup[0], E = new Client(), F = new Client();
  ok((await E.req('POST', '/api/login', { email, password: pw, code: rc })).status === 200, 'a recovery code signs in');
  ok((await F.req('POST', '/api/login', { email, password: pw, code: rc })).status === 401, 'but only once');

  /* turning it off */
  ok((await A.req('POST', '/api/2fa/disable', { password: 'wrong password here', code: code(setup.data.secret) })).status === 422, 'turning off needs the password');
  ok((await A.req('POST', '/api/2fa/disable', { password: pw, code: '000000' })).status === 422, 'and a valid code');
  ok((await A.req('POST', '/api/2fa/disable', { password: pw, code: code(setup.data.secret) })).status === 200, 'with both it turns off');
  ok((await new Client().req('POST', '/api/login', { email, password: pw })).status === 200, 'then a password alone works again');

  await A.req('DELETE', '/api/account', {});
  console.log(fails ? `\n${fails} two-factor check(s) FAILED` : '\nall two-factor checks passed');
  process.exit(fails ? 1 : 0);
})();
