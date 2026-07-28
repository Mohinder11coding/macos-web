/* Proves Music makes sound. Taps the synth's master gain with an analyser and reports
   the actual signal level, because "no console errors" says nothing about whether a
   speaker would move. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = 'file://' + path.join(root, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch({
  headless: false,
  args: ['--window-position=-4000,-4000', '--autoplay-policy=no-user-gesture-required',
    '--disable-features=CalculateNativeWinOcclusion'],
});
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const errs = [];
page.on('pageerror', e => errs.push(e.message));
await page.goto(url);
await page.waitForTimeout(1800);

await page.evaluate(() => { WM.list.slice().forEach(w => WM.close(w.id)); WM.open('music'); });
await page.waitForTimeout(600);

/* Measure RMS off the master bus over a window of real time. */
const measure = (tap = 'out') => page.evaluate(t => new Promise(res => {
  if (!Synth.ctx) return res({ err: 'no AudioContext' });
  const an = Synth.ctx.createAnalyser();
  an.fftSize = 2048;
  /* Tapping after the limiter is what tells us whether a speaker would clip. */
  (t === 'out' ? Synth.lim : Synth.master).connect(an);
  const buf = new Float32Array(an.fftSize);
  let peak = 0, sum = 0, n = 0;
  const t0 = performance.now();
  const loop = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0;
    for (let i = 0; i < buf.length; i++) { s += buf[i] * buf[i]; peak = Math.max(peak, Math.abs(buf[i])); }
    sum += Math.sqrt(s / buf.length); n++;
    if (performance.now() - t0 < 2500) requestAnimationFrame(loop);
    else {
      (t === 'out' ? Synth.lim : Synth.master).disconnect(an);
      res({ rms: +(sum / n).toFixed(4), peak: +peak.toFixed(4), clipped: peak > 1 });
    }
  };
  loop();
}), tap);

await page.evaluate(() => Mu.play(0));
await page.waitForTimeout(400);
console.log('song 0 playing:', JSON.stringify(await measure()));
console.log('  state:', JSON.stringify(await page.evaluate(() => ({
  playing: Mu.playing, pos: +Mu.pos.toFixed(2), live: Synth.live,
  ctx: Synth.ctx && Synth.ctx.state, bpm: Synth.rec.bpm, beat: Synth.beat,
}))));

/* Position has to advance off the audio clock, not a wall-clock guess. */
const p1 = await page.evaluate(() => Synth.pos());
await page.waitForTimeout(1500);
const p2 = await page.evaluate(() => Synth.pos());
console.log(`  clock advanced ${(p2 - p1).toFixed(2)}s over 1.5s wall time`);

await page.evaluate(() => Mu.toggle());
await page.waitForTimeout(500);
console.log('paused:', JSON.stringify(await measure()), 'live =', await page.evaluate(() => Synth.live));

await page.evaluate(() => Mu.toggle());
await page.waitForTimeout(400);
console.log('resumed:', JSON.stringify(await measure()));

/* Each track should be a different piece of music, not the same loop retitled. */
for (const i of [2, 4, 6]) {
  await page.evaluate(n => Mu.play(n), i);
  await page.waitForTimeout(500);
  const m = await measure();
  const r = await page.evaluate(() => ({ bpm: Synth.rec.bpm, root: Synth.rec.root, drums: Synth.rec.drums, verb: Synth.rec.verb }));
  console.log(`song ${i}: rms=${m.rms} peak=${m.peak} bpm=${r.bpm} root=${r.root} drums=${r.drums}`);
}

/* System volume has to reach the music. */
await page.evaluate(() => { SYS.volume = 0.12; Bus.emit('volume', 0.12); });
await page.waitForTimeout(500);
console.log('at 12% volume:', JSON.stringify(await measure()));
await page.evaluate(() => { SYS.muted = true; Bus.emit('volume', 0); });
await page.waitForTimeout(600);
console.log('muted:', JSON.stringify(await measure()));

console.log('errors:', errs.length ? errs : 'none');
await browser.close();

/* The real path is a click, under the browser's normal autoplay rules — an
   AudioContext built without a gesture starts suspended and stays silent. */
const strict = await chromium.launch({
  headless: false,
  args: ['--window-position=-4000,-4000', '--disable-features=CalculateNativeWinOcclusion'],
});
const sp = await strict.newPage({ viewport: { width: 1400, height: 900 } });
await sp.goto(url);
await sp.waitForTimeout(1800);
await sp.evaluate(() => { WM.list.slice().forEach(w => WM.close(w.id)); WM.open('music'); });
await sp.waitForTimeout(600);
await sp.locator('[data-c="play"]').click();
await sp.waitForTimeout(1200);
console.log('clicked play (no autoplay flag):', JSON.stringify(await sp.evaluate(() => ({
  ctx: Synth.ctx && Synth.ctx.state, live: Synth.live, playing: Mu.playing,
}))));
/* Recently Added shows albums; the song list lives under Songs. */
await sp.locator('[data-mv="Songs"]').click();
await sp.waitForTimeout(400);
await sp.locator('.mu-song').nth(3).dblclick();
await sp.waitForTimeout(1000);
console.log('double-clicked a track:', JSON.stringify(await sp.evaluate(() => ({
  i: Mu.i, title: Mu.cur().t, bpm: Synth.rec.bpm, ctx: Synth.ctx.state,
}))));
await strict.close();
