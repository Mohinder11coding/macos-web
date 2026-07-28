/* Finds controls that look clickable and do nothing. Opens every app, clicks each
   button/link in turn, and watches for any consequence: a DOM change inside the
   window, a toast, a popover, a new window, a navigation. Anything that produces
   none of those is a dead end and gets listed. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch({ args: ['--window-position=-4000,-4000'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('pageerror', e => errors.push('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const apps = await page.evaluate(() => Object.keys(APPS).filter(k => APPS[k].name));
const dead = [];
const inert = {};

for (const app of apps) {
  await page.evaluate(a => {
    WM.list.slice().forEach(w => WM.close(w.id));
    Pop.close(true);
    const w = WM.open(a, {});
    if (w) Object.assign(w.node.style, { left: '80px', top: '60px', width: '1100px', height: '700px' });
    window.__w = w;
  }, app);
  await page.waitForTimeout(700);

  const n = await page.evaluate(() => {
    const w = window.__w; if (!w) return 0;
    window.__ctl = [...w.node.querySelectorAll('button,a,[data-goto],[role="button"]')]
      .filter(e => {
        const r = e.getBoundingClientRect();
        return r.width > 3 && r.height > 3 && !e.closest('.rz');
      });
    return window.__ctl.length;
  });

  for (let i = 0; i < n; i++) {
    const res = await page.evaluate(async idx => {
      const w = window.__w; if (!w || w.dead) return null;
      const btn = window.__ctl[idx]; if (!btn || !btn.isConnected) return null;
      const label = (btn.getAttribute('title') || btn.textContent || '').trim().slice(0, 40) ||
        btn.className || btn.tagName;
      /* Anything that closes the window or quits would end the sweep. */
      if (btn.closest('.tl') || /close|quit/i.test(label)) return { label, skip: true };
      /* A dimmed control doing nothing is correct — Back at the start of history
         is inert on purpose. What matters is that it looks inert, so it's counted
         rather than reported. Same for the already-selected half of a segmented
         control: clicking it again is a no-op in every real app. */
      if (btn.matches('.dis,[disabled],[aria-disabled="true"]')) return { label, inert: 'disabled' };
      if (btn.classList.contains('on') && !btn.querySelector('input')) return { label, inert: 'selected' };

      let hits = 0;
      const obs = new MutationObserver(m => { hits += m.length; });
      obs.observe(w.node, { subtree: true, childList: true, attributes: true, characterData: true });
      /* A toast is a single reused node, so its text is the signal, not its count. */
      const snap = () => ({
        wins: WM.list.length,
        pops: document.querySelectorAll('.pop,#lpad,#spot').length,
        toast: ($('#toast') && $('#toast').classList.contains('on') ? $('#toast').textContent : ''),
      });
      const before = snap();
      if ($('#toast')) $('#toast').classList.remove('on');
      btn.click();
      await new Promise(r => setTimeout(r, 130));
      obs.disconnect();
      const after = snap();
      const acted = hits > 0 || after.wins !== before.wins || after.pops !== before.pops || !!after.toast;
      /* Leave the app in a clean state for the next control. */
      Pop.close(true);
      return { label, acted, hits };
    }, i);
    if (res && res.inert) inert[res.inert] = (inert[res.inert] || 0) + 1;
    else if (res && !res.skip && !res.acted) dead.push(`${app.padEnd(11)} ${res.label}`);
    /* A control may have opened a sheet or another window; put things back. */
    await page.evaluate(a => {
      Pop.close(true);
      if (!window.__w || window.__w.dead || WM.list.length !== 1) {
        WM.list.slice().forEach(w => WM.close(w.id));
        const w = WM.open(a, {});
        if (w) Object.assign(w.node.style, { left: '80px', top: '60px', width: '1100px', height: '700px' });
        window.__w = w;
        window.__ctl = [...w.node.querySelectorAll('button,a,[data-goto],[role="button"]')]
          .filter(e => { const r = e.getBoundingClientRect(); return r.width > 3 && r.height > 3 && !e.closest('.rz'); });
      }
    }, app);
  }
  process.stdout.write(`${app} (${n}) `);
}

console.log('\n');
if (dead.length) {
  console.log(`--- ${dead.length} CONTROLS WITH NO EFFECT ---`);
  dead.forEach(d => console.log('  ' + d));
} else console.log('every control did something');
console.log(`(inert by design: ${Object.entries(inert).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'})`);
if (errors.length) { console.log('\n--- ERRORS ---'); errors.forEach(e => console.log(e)); }
await browser.close();
