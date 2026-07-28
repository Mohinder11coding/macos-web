/* Reads the *computed* cursor off real elements. Custom cursor art can be perfect
   and still never render if the declaration is invalid, which no screenshot shows. */
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
await page.waitForTimeout(1800);
await page.evaluate(() => { WM.open('notes'); WM.open('safari'); WM.open('calculator'); WM.open('music'); });
await page.waitForTimeout(1100);

const probes = [
  ['body', 'body'],
  ['dock icon', '#dock .di'],
  ['menu item', '#menubar .mb-item'],
  ['traffic light', '.win .tl b'],
  ['toolbar button', '.win .tbtn:not(.dis)'],
  ['note row', '.nt-i'],
  ['note editor', '.nt-doc'],
  ['search input', '.sfield input'],
  ['resize se', '.win [data-rz="se"]'],
  ['resize n', '.win [data-rz="n"]'],
  ['resize ne', '.win [data-rz="ne"]'],
  ['desktop icon', '#desktop .dicon'],
  ['safari link', '.sf-page [data-goto]'],
  ['menu bar', '#menubar'],
  ['slider', '.win .sl'],
  ['calc key', '.ck'],
  ['dock divider', '#dock'],
];
let bad = 0;
for (const [label, sel] of probes) {
  const v = await page.evaluate(s => {
    const e = document.querySelector(s);
    if (!e) return 'MISSING';
    const c = getComputedStyle(e).cursor;
    return c.startsWith('url(') ? 'custom → ' + c.split(')').pop().trim() : c;
  }, sel);
  const ok = v.startsWith('custom');
  if (!ok) bad++;
  console.log((ok ? 'ok   ' : 'BAD  ') + label.padEnd(16) + v.slice(0, 60));
}
console.log(bad ? `\n${bad} element(s) not using the custom cursor` : '\nall probes use the custom art');
await browser.close();
