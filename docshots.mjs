/* Builds the README images. Same scenarios as shot.mjs, but at 1x and encoded as
   JPEG so the repository doesn't carry 7 MB of retina PNG per picture. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'index.html').replace(/\\/g, '/') + '?boot=0';

const helpers = `
  window.__only = (app, opts, rect) => {
    WM.list.slice().forEach(w => WM.close(w.id));
    const w = WM.open(app, Object.assign({ force: true }, opts));
    if (rect) Object.assign(w.node.style, { left: rect[0]+'px', top: rect[1]+'px', width: rect[2]+'px', height: rect[3]+'px' });
    if (APPS[app].onResize) APPS[app].onResize(w);
    window.__w = w; return w.id;
  };
  window.__add = (app, opts, rect) => {
    const w = WM.open(app, Object.assign({ force: true }, opts));
    if (rect) Object.assign(w.node.style, { left: rect[0]+'px', top: rect[1]+'px', width: rect[2]+'px', height: rect[3]+'px' });
    if (APPS[app].onResize) APPS[app].onResize(w);
    return w.id;
  };
`;

const SHOTS = {
  desktop: async (p) => {
    await p.evaluate(() => __only('terminal', {}, [92, 452, 690, 430]));
    await p.waitForTimeout(360);
    await p.keyboard.type('neofetch\n', { delay: 10 });
    await p.waitForTimeout(400);
    await p.evaluate(() => {
      __add('music', {}, [820, 470, 800, 470]);
      __add('notes', {}, [520, 96, 900, 540]);
      __add('safari', {}, [96, 74, 780, 500]);
      Saf.go('prasen.dev');
    });
    await p.waitForTimeout(800);
    const b = await p.locator('#dock .di[data-app="photos"]').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
    await p.waitForTimeout(560);
  },
  safari: async (p) => {
    await p.evaluate(() => __only('safari', {}, [180, 60, 1320, 800]));
    await p.waitForTimeout(400);
    await p.evaluate(() => Saf.go('overreacted.io/before-you-memo/'));
    await p.waitForTimeout(14000);
  },
  photos: async (p) => {
    await p.evaluate(() => __only('photos', {}, [180, 60, 1320, 800]));
    await p.waitForTimeout(7000);
  },
  dark: async (p) => {
    await p.evaluate(() => { Theme.setAppearance('dark'); Wall.set('night'); });
    await p.waitForTimeout(1800);
    await p.evaluate(() => {
      __only('music', {}, [110, 70, 900, 560]);
      __add('finder', {}, [600, 260, 780, 480]);
      __add('terminal', {}, [200, 420, 640, 380]);
    });
    await p.waitForTimeout(900);
  },
};

const browser = await chromium.launch({
  args: ['--hide-scrollbars', '--window-position=-4000,-4000',
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: 1 });

for (const [name, run] of Object.entries(SHOTS)) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2400);
  await page.addScriptTag({ content: helpers });
  await run(page);
  const file = path.join(dir, 'docs', name + '.jpg');
  await page.screenshot({ path: file, type: 'jpeg', quality: 88 });
  console.log('docs/' + name + '.jpg');
}
await browser.close();
