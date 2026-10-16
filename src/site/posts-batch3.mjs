/* Batch 3: 30 posts, three a day at 08:00, 14:00 and 19:00 UK time, starting 29 Oct 2026 14:00 (after the previous batch ended at 08:00 that day).
   The post text lives in posts-b3a/b/c.mjs; this file hands each one its date and time. */
import { B3A } from './posts-b3a.mjs';
import { B3B } from './posts-b3b.mjs';
import { B3C } from './posts-b3c.mjs';

const SLOTS = ['08:00', '14:00', '19:00'], START = Date.UTC(2026, 9, 29);   // 29 Oct 2026
const posts = [...B3A, ...B3B, ...B3C];
export const BATCH3 = posts.map((p, i) => {
  const n = i + 1;               // slot 0 (08:00 on 29 Oct) is already taken, so we begin at the second slot
  const day = new Date(START + Math.floor(n / 3) * 864e5).toISOString().slice(0, 10);
  return { ...p, date: day, time: SLOTS[n % 3] };
});
