/* Same page, but over http — which is how it'll actually be shared. Some things
   (YouTube embeds especially) only work with a real origin, so they get checked here. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = 'http://localhost:8899/index.html?boot=0';

const browser = await chromium.launch({
  headless: false,
  args: ['--hide-scrollbars', '--window-position=-4000,-4000',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });
await page.goto(base, { waitUntil: 'load' });
await page.waitForTimeout(2000);

await page.evaluate(() => { WM.list.slice().forEach(w => WM.close(w.id)); });
await page.waitForTimeout(300);
await page.evaluate(() => { const w = WM.open('safari'); Object.assign(w.node.style, { left: '70px', top: '60px', width: '1120px', height: '700px' }); });
await page.waitForTimeout(600);
await page.evaluate(() => Saf.go('youtube.com/watch?v=aqz-KE-bpKQ'));
await page.waitForTimeout(5000);
await page.screenshot({ path: path.join(root, 'shots', 'served-video.png'), clip: { x: 40, y: 30, width: 1200, height: 780 } });
console.log('shot → shots/served-video.png');
await browser.close();
