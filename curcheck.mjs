/* Cursor art can't be screenshotted from a page — the OS draws it. So pull the
   data URIs straight out of the tokens and blow them up on a checkerboard. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const url = 'file://' + path.join(dir, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch({ args: ['--window-position=-4000,-4000'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 480 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const names = ['arrow', 'hand', 'fist', 'text', 'ew', 'ns', 'nwse', 'nesw', 'cross'];
const urls = await page.evaluate(ns => {
  const cs = getComputedStyle(document.documentElement);
  return ns.map(n => {
    const v = cs.getPropertyValue('--cur-' + n).trim();
    return (v.match(/url\((["']?)(.*?)\1\)/) || [])[2] || '';
  });
}, names);

await page.setContent(`<body style="margin:0;background:
  repeating-conic-gradient(#dcdce0 0 25%,#f4f4f6 0 50%) 0 0/22px 22px;
  font:13px -apple-system,Segoe UI,sans-serif;display:flex;flex-wrap:wrap;gap:10px;padding:20px">
  ${urls.map((u, i) => `<div style="text-align:center;width:150px">
    <div style="height:170px;display:grid;place-items:center">
      <img src="${u}" style="image-rendering:auto;transform:scale(4.5);transform-origin:center">
    </div>
    <div style="margin-top:8px;color:#333">${names[i]}</div></div>`).join('')}
</body>`);
await page.waitForTimeout(500);
await page.screenshot({ path: path.join(dir, 'shots', 'cursors.png'), fullPage: true });
console.log('shot → shots/cursors.png');
await browser.close();
