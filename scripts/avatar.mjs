/* Turns the avatar into an inline data URL. The clone has to stay a single file, so
   the picture rides along as base64 — resized in a real canvas first, because a
   400px source is four times more pixels than the largest place it's shown. */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
const size = Number(process.argv[3] || 176);
const b64 = readFileSync(src).toString('base64');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const out = await page.evaluate(async ([data, S]) => {
  const img = new Image();
  img.src = 'data:image/png;base64,' + data;
  await img.decode();
  const c = Object.assign(document.createElement('canvas'), { width: S, height: S });
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  /* Square crop from the centre so a non-square source doesn't squash. */
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  g.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, S, S);
  return { url: c.toDataURL('image/jpeg', 0.9), w: img.naturalWidth, h: img.naturalHeight };
}, [b64, size]);
await browser.close();

writeFileSync(path.join(root, 'avatar.txt'), out.url);
console.log(`source ${out.w}x${out.h} → ${size}px jpeg, ${(out.url.length / 1024).toFixed(1)} KB of base64`);
console.log('written to avatar.txt');
