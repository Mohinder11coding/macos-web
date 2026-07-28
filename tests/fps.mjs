/* Frame-time probe. Sweeps the cursor across the dock while sampling rAF deltas,
   because "silky smooth" is a claim that deserves numbers behind it. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch({
  headless: false,
  args: ['--hide-scrollbars', '--window-position=-4000,-4000',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2200);

const sample = async (label, act) => {
  await page.evaluate(() => {
    window.__f = []; let last = performance.now();
    window.__stop = false;
    const tick = t => { window.__f.push(t - last); last = t; if (!window.__stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  await act();
  const f = await page.evaluate(() => { window.__stop = true; return window.__f.slice(2); });
  const s = [...f].sort((a, b) => a - b);
  const pct = p => s[Math.floor(s.length * p)].toFixed(1);
  const long = f.filter(d => d > 20).length;
  console.log(`${label.padEnd(22)} frames=${String(f.length).padStart(4)}  ` +
    `median=${pct(.5)}ms  p95=${pct(.95)}ms  worst=${s[s.length - 1].toFixed(1)}ms  >20ms=${long}`);
};

const box = await page.locator('#dock .di').first().boundingBox();
const items = await page.locator('#dock .di').count();
const lastBox = await page.locator('#dock .di').nth(items - 1).boundingBox();
const y = box.y + box.height / 2;

await sample('dock sweep', async () => {
  for (let pass = 0; pass < 2; pass++) {
    const [a, b] = pass ? [lastBox.x, box.x] : [box.x, lastBox.x];
    for (let i = 0; i <= 60; i++) {
      await page.mouse.move(a + (b - a) * (i / 60), y);
      await page.waitForTimeout(8);
    }
  }
});

await sample('window open+close', async () => {
  for (const app of ['safari', 'notes', 'music', 'calendar']) {
    await page.evaluate(a => WM.open(a), app);
    await page.waitForTimeout(420);
  }
  await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
  await page.waitForTimeout(500);
});

for (const n of [1, 2, 3]) {
  await sample('launchpad open #' + n, async () => {
    await page.evaluate(() => Launchpad.open()); await page.waitForTimeout(700);
    await page.evaluate(() => Launchpad.close()); await page.waitForTimeout(500);
  });
}
for (const n of [1, 2]) {
  await sample('spotlight open #' + n, async () => {
    await page.evaluate(() => Spotlight.open()); await page.waitForTimeout(400);
    await page.evaluate(() => Spotlight.search('ca')); await page.waitForTimeout(300);
    await page.evaluate(() => Spotlight.close()); await page.waitForTimeout(400);
  });
}

await sample('notif centre slide', async () => {
  await page.evaluate(() => NotifCenter.open()); await page.waitForTimeout(700);
  await page.evaluate(() => NotifCenter.close()); await page.waitForTimeout(500);
});

await page.evaluate(() => WM.open('finder'));
await page.waitForTimeout(900);
await sample('genie minimise', async () => {
  await page.evaluate(() => WM.minimize(WM.front.id)); await page.waitForTimeout(700);
});
await sample('genie restore', async () => {
  await page.evaluate(() => WM.unmin(WM.list[0].id)); await page.waitForTimeout(700);
});

await browser.close();
