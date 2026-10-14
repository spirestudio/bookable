// Saves a dated copy of the live database to backups/. Run: npm run backup
// The file contains clients' names and phone numbers: keep it private, never upload or share it.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
fs.mkdirSync('backups', { recursive: true });
const d = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
const out = `backups/pencil-${d}.sql`;
execSync(`npx wrangler d1 export pencil-db --remote --output ${out}`, { stdio: 'inherit' });
const keep = fs.readdirSync('backups').filter(f => /^pencil-.*\.sql$/.test(f)).sort();
for (const f of keep.slice(0, -30)) fs.unlinkSync('backups/' + f);   // keep the newest 30
console.log('Backup saved to ' + out);
