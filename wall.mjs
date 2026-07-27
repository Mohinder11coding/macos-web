/* Switches through every wallpaper and reports whether a photo layer is actually
   painted afterwards — the failure mode is the procedural gradient showing through,
   which looks like a deliberate flat-colour theme rather than a broken image. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch({
  headless: false,
  args: ['--hide-scrollbars', '--window-position=-4000,-4000',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
const failed = [];
page.on('requestfailed', r => { if (/unsplash|images\./.test(r.url())) failed.push(r.url().slice(0, 70) + ' :: ' + (r.failure() || {}).errorText); });
page.on('response', r => { if (/unsplash/.test(r.url()) && r.status() >= 400) failed.push(r.status() + ' ' + r.url().slice(0, 70)); });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2600);

/* Full-resolution pictures are 3200px wide, so on a cold cache a fixed delay reads
   the desktop mid-fade and calls a working switch broken. Wait for it to settle. */
const settle = (want, ms = 14000) => page.waitForFunction(([k]) => {
  const ls = [...document.querySelectorAll('#wall .layer.photo')];
  const live = ls.filter(l => getComputedStyle(l).opacity === '1');
  return live.length === 1 && live[0].dataset.key === k && live[0].hasAttribute('data-full');
}, [want], { timeout: ms }).then(() => true).catch(() => false);

const keys = await page.evaluate(() => Object.keys(WALLPAPERS));
for (const k of keys) {
  await page.evaluate(x => Wall.set(x), k);
  const ok = await settle(k);
  const st = await page.evaluate(() => [...document.querySelectorAll('#wall .layer.photo')]
    .map(l => ({ k: l.dataset.key, full: l.hasAttribute('data-full'), op: getComputedStyle(l).opacity })));
  console.log((ok ? 'ok   ' : 'BAD  ') + k.padEnd(8) + JSON.stringify(st));
}
if (failed.length) console.log('\nnetwork problems:\n' + [...new Set(failed)].join('\n'));
else console.log('\nno image request failures');

/* Rapid-fire switching used to leave a stale cleanup timer deleting the newest
   layer, so hammer it and confirm the picture that wins is the one asked for last. */
for (const burst of [1, 2, 3]) {
  const order = burst === 2 ? [...keys].reverse() : keys;
  /* Resolve only once every switch has been dispatched. Settling early would just
     read the state before the burst got going and blame the page for it. */
  await page.evaluate(ks => new Promise(res => {
    ks.forEach((k, i) => setTimeout(() => Wall.set(k), i * 90));
    setTimeout(res, ks.length * 90 + 60);
  }), order);
  const want = order[order.length - 1];
  const ok = await settle(want);
  /* Old layers are retired 800ms after the new one lands so the cross-fade can
     finish, so counting them any sooner counts layers that are on their way out. */
  await page.waitForTimeout(1000);
  const st = await page.evaluate(() => ({
    sys: SYS.wallpaper,
    count: document.querySelectorAll('#wall .layer.photo').length,
  }));
  console.log(`${ok && st.sys === want && st.count === 1 ? 'ok   ' : 'BAD  '}` +
    `burst ${burst}: want=${want} sys=${st.sys} layers=${st.count}`);
}

/* And the failure path: point a picture at a dead URL and make sure the desktop
   keeps the photo it already had rather than falling back to the gradient. */
const kept = await page.evaluate(async () => {
  const before = SYS.wallpaper;
  WALLPAPERS.broken = { name: 'Broken', ink: 'dark', url: 'https://images.unsplash.com/does-not-exist-9999?w=3200' };
  Wall.set('broken');
  await new Promise(r => setTimeout(r, 2600));
  const live = [...document.querySelectorAll('#wall .layer.photo')]
    .filter(l => getComputedStyle(l).opacity === '1').map(l => l.dataset.key);
  return { before, live };
});
console.log((kept.live.length === 1 && kept.live[0] === kept.before ? 'ok   ' : 'BAD  ') +
  `dead url: kept=[${kept.live}] (was ${kept.before})`);
await browser.close();
