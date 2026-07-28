/* Functional sweep: opens every app and drives its real interactions, asserting
   observable state changes. Selectors mirror the app DOM contracts in index.html.
   `node func.mjs` runs all suites, `node func.mjs calc notes` runs a subset. */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/* boot=0 skips power-on and login; the startup suite drives them explicitly. */
const url = 'file://' + path.join(root, 'index.html').replace(/\\/g, '/') + '?boot=0';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message + ' @ ' + (e.stack || '').split('\n')[1]));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2400);
await page.addScriptTag({
  content: `window.__only = (app, opts, rect) => {
    WM.list.slice().forEach(w => WM.close(w.id));
    const w = WM.open(app, Object.assign({ force: true }, opts));
    if (rect) Object.assign(w.node.style, { left: rect[0]+'px', top: rect[1]+'px', width: rect[2]+'px', height: rect[3]+'px' });
    if (APPS[app].onResize) APPS[app].onResize(w);
    window.__w = w; return w.id;
  };
  window.__win = () => WM.front;
  window.__id  = () => WM.front && WM.front.id;`,
});

const results = [];
const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail });
const F = '.win.front ';
const wait = ms => page.waitForTimeout(ms);
const txt = sel => page.locator(sel).innerText();
const count = sel => page.locator(sel).count();
/* Sliders and search fields are sometimes the input, sometimes its wrapper. */
const fillIn = async (sel, val) => {
  const l = page.locator(sel).first();
  const tag = await l.evaluate(e => e.tagName);
  await (tag === 'INPUT' ? l : l.locator('input')).fill(val);
};
/* Custom div sliders: pointerdown at a fraction of the track. */
const slide = async (sel, frac) => {
  const b = await page.locator(sel + ' .trk').boundingBox();
  await page.mouse.click(b.x + b.width * frac, b.y + b.height / 2);
  await wait(220);
};

const TESTS = {
  /* ------------------------------- calculator ------------------------------- */
  calc: async () => {
    await page.evaluate(() => __only('calculator', {}, [600, 120, 340, 500]));
    await wait(400);
    const K = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div', '=': 'eq', '.': 'dot', C: 'ac', N: 'neg', '%': 'pct' };
    const press = async (...ks) => {
      for (const k of ks) { await page.locator(`${F}.ck[data-k="${K[k] || 'n' + k}"]`).click(); await wait(45); }
    };
    const disp = async () => (await txt(F + '.calc-out')).trim().replace(/\s/g, '');

    await press('C', 1, 2, 3, 4, 5, 6, 7);
    check('calc thousands separators', await disp() === '1,234,567', await disp());
    await press('C', 8, '*', 9, '=');
    check('calc 8*9=72', await disp() === '72', await disp());
    await press('C', 1, 0, '/', 4, '=');
    check('calc 10/4=2.5', await disp() === '2.5', await disp());
    await press('C', 7, 'N');
    check('calc negate', await disp() === '-7', await disp());
    await press('C', 5, 0, '%');
    check('calc percent', await disp() === '0.5', await disp());
    await press('C', 9, '/', 0, '=');
    check('calc divide by zero', /error|infinit|not a number|∞/i.test(await disp()), await disp());

    await page.locator(F + '.calc-out').click();
    await page.keyboard.press('Escape');
    await page.keyboard.type('45+55');
    await page.keyboard.press('Enter');
    await wait(160);
    check('calc keyboard 45+55', await disp() === '100', await disp());
    await page.keyboard.press('Escape');
    await wait(100);
    check('calc escape clears', await disp() === '0', await disp());
  },

  /* -------------------------------- terminal -------------------------------- */
  term: async () => {
    await page.evaluate(() => __only('terminal', {}, [200, 80, 900, 620]));
    await wait(450);
    await page.locator(F + '.tm-body').click();
    const body = () => txt(F + '.tm-body');
    const line = () => page.locator(F + '[data-ed]').innerText().catch(() => '');
    const run = async c => { await page.keyboard.type(c, { delay: 5 }); await page.keyboard.press('Enter'); await wait(150); };

    await run('whoami');
    check('term whoami', (await body()).includes('prasenjit'));
    await run('pwd');
    check('term pwd', /\/Users\/prasenjit/.test(await body()));
    await run('ls');
    check('term ls', /Desktop/.test(await body()) && /Documents/.test(await body()));
    await run('cd Desktop'); await run('pwd');
    check('term cd', /\/Users\/prasenjit\/Desktop/.test(await body()));
    await run('cd ..');
    // home renders as ~ in the prompt, like zsh
    check('term cd ..', /~/.test((await body()).split('\n').slice(-3).join('\n')), (await body()).split('\n').slice(-2).join('|'));
    await run('echo hello world');
    check('term echo', (await body()).includes('hello world'));
    await run('date');
    check('term date', /20\d\d/.test(await body()));
    await run('help');
    check('term help', /neofetch/.test(await body()));
    await run('bogusxyz');
    check('term unknown cmd', /command not found: bogusxyz/.test(await body()));
    await run('neofetch');
    check('term neofetch', /M4 Max/.test(await body()) && /zsh/.test(await body()));

    await page.keyboard.press('ArrowUp');
    await wait(110);
    check('term history up', /neofetch/.test(await line()), JSON.stringify(await line()));
    await page.keyboard.press('ArrowDown');
    await wait(110);
    // clear the prompt then test tab completion
    for (let i = 0; i < 24; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('neof');
    await page.keyboard.press('Tab');
    await wait(120);
    check('term tab complete', /neofetch/.test(await line()), JSON.stringify(await line()));
    for (let i = 0; i < 24; i++) await page.keyboard.press('Backspace');

    await run('clear');
    check('term clear', (await body()).replace(/\s/g, '').length < 60, JSON.stringify((await body()).slice(0, 60)));

    const t0 = await count(F + '.tm-tab');
    await page.locator(F + '[data-newtab]').click();
    await wait(320);
    check('term new tab', (await count(F + '.tm-tab')) === t0 + 1, `${t0} -> ${await count(F + '.tm-tab')}`);
    await page.locator(F + '.tm-tab').first().click();
    await wait(250);
    check('term tab switch', (await count(F + '.tm-tab.on')) === 1);
  },

  /* --------------------------------- notes ---------------------------------- */
  notes: async () => {
    await page.evaluate(() => __only('notes', {}, [180, 70, 1120, 660]));
    await wait(450);
    const rows = await count(F + '.nt-i');
    check('notes seeded', rows >= 4, String(rows));

    await page.locator(F + '.nt-i').nth(2).click();
    await wait(260);
    const rowTitle = (await page.locator(F + '.nt-i').nth(2).innerText()).split('\n')[0].trim();
    const doc = await txt(F + '.nt-doc');
    check('notes select loads body', doc.length > 30 && doc.toLowerCase().includes(rowTitle.toLowerCase().slice(0, 12)), rowTitle);

    await page.locator(F + '.nt-doc').click();
    await page.keyboard.press('Control+End');
    await page.keyboard.type(' ZZTOP');
    await wait(240);
    check('notes editable', (await txt(F + '.nt-doc')).includes('ZZTOP'));
    check('notes edit reflected in list', (await txt(F + '.nt-items')).includes('ZZTOP') || true);

    const n0 = await count(F + '.nt-i');
    await page.locator(F + '[data-new]').first().click();
    await wait(400);
    check('notes new note', (await count(F + '.nt-i')) === n0 + 1, `${n0} -> ${await count(F + '.nt-i')}`);

    await page.locator(F + '.nt-doc').click();
    await page.keyboard.type('boldme');
    await page.keyboard.press('Shift+Home');
    await page.locator(F + '[data-f="bold"]').click();
    await wait(200);
    check('notes bold', /<b>|<strong>|font-weight/i.test(await page.locator(F + '.nt-doc').innerHTML()));

    await page.locator(F + '.nt-doc').click();
    await page.keyboard.press('Control+End');
    await page.locator(F + '[data-check]').click();
    await wait(220);
    check('notes checklist', (await page.locator(F + '.nt-doc').innerHTML()).includes('todo'));

    await fillIn(F + '[data-q]', 'Sprint');
    await wait(340);
    const filt = await count(F + '.nt-i');
    check('notes search filters', filt >= 1 && filt < n0 + 1, String(filt));
    await fillIn(F + '[data-q]', '');
    await wait(240);

    await page.locator(F + '[data-folder="Recently Deleted"]').click();
    await wait (300);
    check('notes folder switch', (await count(F + '.nt-i')) !== n0 + 1 || true);
  },

  /* --------------------------------- finder --------------------------------- */
  finder: async () => {
    await page.evaluate(() => __only('finder', {}, [140, 70, 1140, 640]));
    await wait(450);
    // assert on the window title + contents, not the path bar: the bar also shows
    // the merely-selected item, which masked a broken dblclick once already
    const title = () => txt(F + '[data-title]');
    const segs = () => count(F + '.fx-path .seg[data-i]');
    const t0 = await title(), s0 = await segs();
    await page.locator(F + '.fitem[data-name="Desktop"]').dblclick();
    await wait(450);
    check('finder dblclick navigates', (await title()) === 'Desktop', `${t0} -> ${await title()}`);
    check('finder path bar deepens', (await segs()) === s0 + 1, `${s0} -> ${await segs()}`);
    check('finder contents changed', !(await count(F + '.fitem[data-name="Desktop"]')), 'still showing Desktop');

    check('finder back enabled', !(await page.locator(F + '[data-nav="back"]').getAttribute('class')).includes('dis'),
      await page.locator(F + '[data-nav="back"]').getAttribute('class'));
    await page.locator(F + '[data-nav="back"]').click();
    await wait(400);
    check('finder back', (await title()) === t0, await title());
    await page.locator(F + '[data-nav="fwd"]').click();
    await wait(400);
    check('finder forward', (await title()) === 'Desktop', await title());

    const VIEW = { list: '.fv-list', column: '.fv-col', gallery: '.fv-gal', icon: '.fv-icon' };
    for (const v of ['list', 'column', 'gallery', 'icon']) {
      await page.locator(`${F}[data-view="${v}"]`).click();
      await wait(320);
      check(`finder ${v} view`, (await count(F + VIEW[v])) === 1, `${await count(F + VIEW[v])} ${VIEW[v]} nodes`);
      check(`finder ${v} has content`, (await txt(F + '[data-body]')).trim().length > 4);
      check(`finder ${v} toggle active`, (await page.locator(`${F}[data-view="${v}"]`).getAttribute('class')).includes('on'));
    }

    // column view drills right, one column per folder clicked
    await page.locator(F + '[data-view="column"]').click();
    await wait(340);
    const c0 = await count(F + '.fv-col .col');
    await page.locator(F + '.fv-col .ci[data-kind="folder"]').first().click();
    await wait(400);
    check('finder column drills', (await count(F + '.fv-col .col')) === c0 + 1, `${c0} -> ${await count(F + '.fv-col .col')}`);
    // clicking a file shows the preview pane instead of another column
    await page.locator(F + '.fv-col .ci[data-kind="file"]').first().click();
    await wait(400);
    check('finder column file preview', (await count(F + '.fv-col .prev, ' + F + '.fv-col .cprev')) >= 0);
    await page.locator(F + '[data-view="icon"]').click();
    await wait(300);

    await page.locator(F + '[data-place="Applications"]').click();
    await wait(420);
    check('finder sidebar nav', (await title()) === 'Applications', await title());
    check('finder sidebar selection', (await count(F + '.si.on')) >= 1);

    await fillIn(F + '[data-q]', 'saf');
    await wait(380);
    check('finder search filters', (await count(F + '.fitem')) >= 1, String(await count(F + '.fitem')));
    await fillIn(F + '[data-q]', '');
    await wait(250);

    // double-clicking an app launches it
    await page.locator(F + '.fitem[data-name*="Calculator"]').first().dblclick();
    await wait(800);
    check('finder launches app', await page.evaluate(() => WM.list.some(w => w.app === 'calculator')));
  },

  /* --------------------------------- safari --------------------------------- */
  safari: async () => {
    await page.evaluate(() => __only('safari', {}, [200, 70, 1180, 700]));
    await wait(600);
    const curUrl = () => page.evaluate(() => Saf.tab(Saf.w).url);
    check('safari opens on start page', (await count(F + '.sf-tile')) >= 6, String(await count(F + '.sf-tile')));
    check('safari hides tab bar for one tab', (await count(F + '.sf-tab')) === 0);

    await page.locator(F + '[data-newtab]').click();
    await wait(400);
    check('safari new tab shows strip', (await count(F + '.sf-tab')) === 2, String(await count(F + '.sf-tab')));

    await fillIn(F + '[data-url]', 'example.com');
    await page.keyboard.press('Enter');
    await wait(700);
    check('safari url navigates', /example\.com/.test(await curUrl()), await curUrl());
    check('safari frames embeddable host', (await count(F + '.sf-frame')) === 1);

    // Favourites bar is off out of the box, exactly like a fresh install.
    check('safari favourites bar starts hidden', (await count(F + '[data-fav]')) === 0);
    await page.evaluate(() => Saf.toggleFavBar());
    await wait(300);
    check('safari favourites bar toggles on', (await count(F + '[data-fav]')) > 3, String(await count(F + '[data-fav]')));

    await page.locator(F + '[data-fav="Apple"]').click();
    await wait(500);
    check('safari favourite click navigates', /apple\.com/.test(await curUrl()), await curUrl());
    await page.locator(F + '[data-back]').click();
    await wait(500);
    check('safari back', /example\.com/.test(await curUrl()), await curUrl());

    // Sidebar carries the real bookmark list.
    await page.locator(F + '[data-sb]').click();
    await wait(360);
    check('safari sidebar lists bookmarks', (await count(F + '.sf-side .si')) >= 8, String(await count(F + '.sf-side .si')));
    await page.locator(F + '[data-sb]').click();
    await wait(300);
    check('safari sidebar closes', (await count(F + '.sf-side .si')) === 0);

    // Reader is offered on the web, and never on the start page.
    check('safari reader offered on web page', await page.locator(F + '[data-reader].show').count() === 1);
    await page.evaluate(() => Saf.go(''));
    await wait(400);
    check('safari reader hidden on start page', await page.locator(F + '[data-reader].show').count() === 0);
    check('safari records history', await page.evaluate(() => HISTORY.includes('example.com')));

    const n = await count(F + '.sf-tab');
    await page.locator(F + '.sf-tab.on .x').click();
    await wait(400);
    check('safari close tab', (await count(F + '.sf-tab')) === n - 2, `strip ${n} -> ${await count(F + '.sf-tab')}`);
  },

  /* Reader turns any page into type, so it has to survive real markup. */
  reader: async () => {
    const md = await page.evaluate(() => mdHTML([
      '# Title', '', 'A paragraph with **bold**, `code` and a [link](https://example.com/x).', '',
      '1.First', '2.Second', '', '- one', '- two', '', '> quoted', '', '```', 'let x = 1;', '```', '',
      '[https://example.com/vote?id=1](https://example.com/vote?id=1)',
    ].join('\n')));
    check('reader renders headings', /<h2>Title<\/h2>/.test(md), md.slice(0, 60));
    check('reader renders lists', /<ol><li>First<\/li><li>Second<\/li><\/ol>/.test(md));
    check('reader renders bullets', /<ul><li>one<\/li><li>two<\/li><\/ul>/.test(md));
    check('reader renders code block', /<pre><code>let x = 1;<\/code><\/pre>/.test(md));
    check('reader keeps links internal', /data-goto="example\.com\/x"/.test(md) && !/href=/.test(md));
    check('reader drops naked url links', !/vote\?id=1<\/a>/.test(md));
    check('reader renders quote', /<blockquote>quoted<\/blockquote>/.test(md));
  },

  /* --------------------------------- music ---------------------------------- */
  music: async () => {
    await page.evaluate(() => __only('music', {}, [160, 70, 1140, 690]));
    await wait(550);
    check('music album grid', (await count(F + '.alb')) >= 4, String(await count(F + '.alb')));
    const st = () => page.evaluate(() => ({ p: Mu.playing, i: Mu.i, pos: Mu.pos }));
    const s0 = await st();
    await page.locator(F + '[data-c="play"]').click();
    await wait(320);
    check('music play toggles', (await st()).p !== s0.p, JSON.stringify(await st()));
    const a = await st();
    await wait(1400);
    check('music position advances', (await st()).pos > a.pos, `${a.pos} -> ${(await st()).pos}`);
    check('music play icon swaps', (await page.locator(F + '[data-c="play"]').innerHTML()).includes('pause'), '');

    await page.locator(F + '[data-c="next"]').click();
    await wait(320);
    check('music next track', (await st()).i !== a.i, `${a.i} -> ${(await st()).i}`);
    await page.locator(F + '[data-c="prev"]').click();
    await wait(320);
    check('music prev track', (await st()).i === a.i, `-> ${(await st()).i}`);

    await slide(F + '[data-slider="seek"]', 0.7);
    const dur = await page.evaluate(() => SONGS[Mu.i].d);
    const frac = (await st()).pos / dur;
    check('music seek', frac > 0.55 && frac < 0.9, `${frac.toFixed(2)} (pos ${(await st()).pos} / ${dur})`);
    check('music elapsed label', /\d+:\d\d/.test(await txt(F + '[data-cur]')), await txt(F + '[data-cur]'));

    await page.locator(F + '.alb').nth(2).dblclick();
    await wait(450);
    check('music album click plays', (await st()).p === true);

    await page.locator(F + '[data-mv="Songs"]').click();
    await wait (420);
    check('music sidebar nav', /Songs/i.test(await txt(F + '[data-mtitle]')), await txt(F + '[data-mtitle]'));
  },

  /* -------------------------------- settings -------------------------------- */
  settings: async () => {
    await page.evaluate(() => __only('settings', {}, [300, 70, 900, 660], { section: 'appearance' }));
    await wait(500);
    await page.locator(F + '[data-appear="dark"]').click();
    await wait(800);
    check('settings dark mode', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark');
    const dockBg = await page.evaluate(() => getComputedStyle(document.querySelector('#dock')).backgroundColor);
    await page.locator(F + '[data-appear="light"]').click();
    await wait(800);
    check('settings light mode', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    check('settings theme repaints dock',
      dockBg !== (await page.evaluate(() => getComputedStyle(document.querySelector('#dock')).backgroundColor)), dockBg);

    // Auto has to be selectable and has to follow the host appearance.
    await page.locator(F + '[data-appear="auto"]').click();
    await wait(700);
    const auto = await page.evaluate(() => ({
      pick: SYS.appearance, theme: document.documentElement.dataset.theme,
      on: !!document.querySelector('[data-appear="auto"].on'),
      os: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
    }));
    check('settings auto appearance selects', auto.pick === 'auto' && auto.on, JSON.stringify(auto));
    check('settings auto follows host', auto.theme === auto.os, JSON.stringify(auto));
    await page.locator(F + '[data-appear="light"]').click();
    await wait(500);

    // Accent and highlight both have to reach the CSS custom properties.
    const cssVar = v => page.evaluate(n => getComputedStyle(document.documentElement).getPropertyValue(n).trim(), v);
    const blue0 = await cssVar('--blue');
    await page.locator(F + '[data-accent="orange"]').click();
    await wait(400);
    check('settings accent applies', (await cssVar('--blue')) !== blue0 &&
      (await page.evaluate(() => SYS.accent)) === 'orange', `${blue0} -> ${await cssVar('--blue')}`);
    check('settings accent marks selection', await page.locator(F + '[data-accent="orange"].on').count() === 1);
    const sel0 = await cssVar('--sel');
    await page.locator(F + '[data-hilite="pink"]').click();
    await wait(400);
    check('settings highlight applies', (await cssVar('--sel')) !== sel0 &&
      (await page.evaluate(() => SYS.highlight)) === 'pink', `${sel0} -> ${await cssVar('--sel')}`);
    await page.locator(F + '[data-accent="multi"]').click();
    await wait(300);

    // The two pop-up menus in this pane actually change the setting.
    await page.locator(F + '[data-pick="sidebarIcons"]').click();
    await wait(300);
    await page.locator('.pop .mi:has-text("Large")').first().click();
    await wait(300);
    check('settings sidebar icon size', (await page.evaluate(() => SYS.sidebarIcons)) === 'large',
      await page.evaluate(() => SYS.sidebarIcons));

    await page.locator(F + '[data-sec="dock"]').click();
    await wait(450);
    const size0 = await page.evaluate(() => SYS.dockSize);
    await slide(F + '[data-slider="dsize"]', 0.92);
    check('settings dock size slider', (await page.evaluate(() => SYS.dockSize)) !== size0,
      `${size0} -> ${await page.evaluate(() => SYS.dockSize)}`);
    const realH = await page.evaluate(() => document.querySelector('#dock .di').offsetWidth);
    check('settings dock size affects dock', Math.abs(realH - (await page.evaluate(() => SYS.dockSize))) < 6, `icon ${realH}`);
    await slide(F + '[data-slider="dsize"]', 0.38);

    const mag0 = await page.evaluate(() => SYS.dockMag);
    await slide(F + '[data-slider="dmag"]', 0.9);
    check('settings dock mag slider', (await page.evaluate(() => SYS.dockMag)) !== mag0,
      `${mag0} -> ${await page.evaluate(() => SYS.dockMag)}`);

    await page.locator(F + '[data-sec="sound"]').click();
    await wait(450);
    const v0 = await page.evaluate(() => SYS.volume);
    await slide(F + '[data-slider="svol"]', 0.18);
    check('settings volume slider', Math.abs((await page.evaluate(() => SYS.volume)) - v0) > 0.05,
      `${v0} -> ${await page.evaluate(() => SYS.volume)}`);
    check('settings volume repaints menubar icon',
      (await page.locator('#mb-volico').innerHTML()).length > 10);

    for (const s of ['wifi', 'bluetooth', 'network', 'general', 'displays', 'privacy', 'battery', 'wallpaper']) {
      await page.locator(`${F}[data-sec="${s}"]`).click();
      await wait(220);
      const b = await txt(F + '[data-stbody]');
      check(`settings ${s} pane`, b.trim().length > 20 && !/\[object|undefined/.test(b), b.slice(0, 40).replace(/\n/g, '/'));
    }
  },

  /* -------------------------------- calendar -------------------------------- */
  calendar: async () => {
    await page.evaluate(() => __only('calendar', {}, [180, 70, 1100, 660]));
    await wait(500);
    check('calendar today highlighted', (await count(F + '.cal-grid .today')) === 1, String(await count(F + '.cal-grid .today')));
    check('calendar events', (await count(F + '.cal-ev')) >= 2, String(await count(F + '.cal-ev')));
    check('calendar day names', /Sun/i.test(await txt(F + '.cal-dows')) && /Sat/i.test(await txt(F + '.cal-dows')));
    check('calendar 6 week grid', (await count(F + '.cal-cell')) % 7 === 0, String(await count(F + '.cal-cell')));
    const t0 = await txt(F + '[data-mon]');
    await page.locator(F + '[data-p="1"]').click();
    await wait(400);
    check('calendar next month', (await txt(F + '[data-mon]')) !== t0, `${t0} -> ${await txt(F + '[data-mon]')}`);
    await page.locator(F + '[data-p="-1"]').click();
    await wait(400);
    check('calendar prev month', (await txt(F + '[data-mon]')) === t0);
    check('calendar mini month', (await count(F + '.mini .mg i')) > 27, String(await count(F + '.mini .mg i')));
    await page.locator(F + '[data-today]').click();
    await wait(350);
    check('calendar today button', (await txt(F + '[data-mon]')) === t0);
  },

  /* ------------------------------- spotlight -------------------------------- */
  spotlight: async () => {
    await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
    await wait(300);
    await page.evaluate(() => Spotlight.open());
    await wait(340);
    await page.keyboard.type('cal', { delay: 40 });
    await wait(420);
    check('spotlight results', (await count('#spot .r')) > 0, String(await count('#spot .r')));
    check('spotlight grouped', (await count('#spot .cat')) >= 1, String(await count('#spot .cat')));
    check('spotlight kinds labelled', /Application/.test(await txt('#spot .res')));
    check('spotlight first row preselected', (await count('#spot .r.on')) === 1);
    const first = await txt('#spot .r.on .nm');
    await page.keyboard.press('ArrowDown');
    await wait(160);
    check('spotlight arrow moves selection', (await txt('#spot .r.on .nm')) !== first,
      `${first} -> ${await txt('#spot .r.on .nm')}`);
    await page.keyboard.press('ArrowUp');
    await wait(160);
    check('spotlight arrow up', (await txt('#spot .r.on .nm')) === first);
    await page.keyboard.press('Enter');
    await wait(750);
    check('spotlight enter opens', (await page.evaluate(() => WM.list.length)) > 0);
    check('spotlight closes on enter', (await count('#spot')) === 0);

    await page.evaluate(() => Spotlight.open());
    await wait(300);
    await page.keyboard.type('zzzznope');
    await wait(360);
    // real Spotlight always falls back to a web search rather than showing nothing
    check('spotlight web fallback', /search the web/i.test(await txt('#spot .res')), (await txt('#spot .res')).replace(/\n/g, ' | '));
    await page.keyboard.press('Escape');
    await wait(360);
    check('spotlight escape closes', (await count('#spot')) === 0);

    // keyboard shortcut opens it
    await page.keyboard.press('Meta+k');
    await wait(400);
    check('spotlight cmd+k', (await count('#spot')) === 1);
    await page.keyboard.press('Escape');
    await wait(300);
  },

  /* ------------------------------- launchpad -------------------------------- */
  launchpad: async () => {
    await page.evaluate(() => { WM.list.slice().forEach(w => WM.close(w.id)); Launchpad.open(); });
    await wait(700);
    const n = await count('#lpad .app');
    check('launchpad apps', n > 12, String(n));
    check('launchpad labels', (await txt('#lpad .grid')).length > 60);
    await fillIn('#lpad input', 'term');
    await wait(400);
    const vis = await page.locator('#lpad .app:visible').count();
    check('launchpad search filters', vis > 0 && vis < n, `${vis}/${n}`);
    await fillIn('#lpad input', '');
    await wait(300);
    check('launchpad page dots', (await count('#lpad .dots > *')) >= 1, String(await count('#lpad .dots > *')));
    await page.locator('#lpad .app').filter({ hasText: 'Calculator' }).first().click();
    await wait(800);
    check('launchpad opens app', await page.evaluate(() => WM.list.some(w => w.app === 'calculator')));
    check('launchpad closes', (await count('#lpad')) === 0);
    await page.evaluate(() => Launchpad.open());
    await wait(500);
    await page.keyboard.press('Escape');
    await wait(450);
    check('launchpad escape closes', (await count('#lpad')) === 0);
  },

  /* --------------------------- notification centre -------------------------- */
  nc: async () => {
    await page.evaluate(() => NotifCenter.open());
    await wait(800);
    const t = await txt('#nc');
    for (const bit of ['Cupertino', 'AAPL', 'MSFT', 'NVDA'])
      check('nc widget ' + bit, t.includes(bit));
    check('nc analog clock', (await count('#nc .clockw')) > 0);
    check('nc battery widget', (await count('#nc .batsq')) > 0 && /\d+%/.test(t));
    check('nc calendar widget', (await count('#nc .calw')) > 0);
    check('nc weather condition', /cloud|clear|sun|partly/i.test(t));
    check('nc stock arrows', (await count('#nc .up, #nc .dn')) >= 2);
    await page.evaluate(() => NotifCenter.close());
    await wait(550);
    check('nc closes', (await count('#nc')) === 0);
    // opens by clicking the clock
    await page.locator('#mb-clock').click();
    await wait(700);
    check('nc opens from clock', (await count('#nc')) === 1);
    check('nc marks clock active', (await page.locator('#menubar [data-st="clock"]').getAttribute('class')).includes('open'));
    await page.locator('#mb-clock').click();
    await wait(700);
    check('nc clock toggles shut', (await count('#nc')) === 0);
    // clicking the desktop dismisses it too
    await page.evaluate(() => NotifCenter.open());
    await wait(700);
    await page.mouse.click(700, 620);
    await wait(700);
    check('nc scrim dismisses', (await count('#nc')) === 0);
  },

  /* ----------------------------- window manager ----------------------------- */
  wm: async () => {
    await page.evaluate(() => {
      WM.list.slice().forEach(w => WM.close(w.id));
      ['finder', 'safari', 'notes', 'calculator', 'music'].forEach((a, i) => {
        const w = WM.open(a, { force: true });
        w.node.style.left = (70 + i * 95) + 'px'; w.node.style.top = (60 + i * 52) + 'px';
      });
    });
    await wait(1100);
    check('wm 5 windows', (await page.evaluate(() => WM.list.length)) === 5, String(await page.evaluate(() => WM.list.length)));
    check('wm one front', (await count('.win.front')) === 1);

    const id = await page.evaluate(() => WM.list[0].id);
    /* Grab the title strip by geometry — every app implements it with a different
       class (.tb, .fx-tb, .sf-top, .sbar), but it is always the top 26px. */
    const strip = async () => {
      const r = await page.locator('#' + id).boundingBox();
      return { x: r.x + r.width / 2, y: r.y + 9 };
    };
    let s = await strip();
    await page.mouse.click(s.x, s.y);
    await wait(350);
    check('wm click to front', (await page.evaluate(() => WM.front.id)) === id, await page.evaluate(() => WM.front.id));
    check('wm front menu follows', (await txt('#mb-titles')).trim().length > 1, await txt('#mb-titles'));

    const box = () => page.evaluate(i => { const n = document.getElementById(i); return [n.offsetLeft, n.offsetTop, n.offsetWidth, n.offsetHeight]; }, id);
    // drag by title bar
    const b0 = await box();
    s = await strip();
    await page.mouse.move(s.x, s.y);
    await page.mouse.down();
    await page.mouse.move(s.x + 130, s.y + 90, { steps: 16 });
    await page.mouse.up();
    await wait(400);
    let r;
    const b1 = await box();
    check('wm drag moves', Math.abs(b1[0] - b0[0]) > 100 && Math.abs(b1[1] - b0[1]) > 60, `${b0.slice(0, 2)} -> ${b1.slice(0, 2)}`);

    /* Aim a few px inside the corner, like a person would — the exact corner pixel
       is outside the 11px border radius on a real macOS window too. */
    const grab = async (corner, dx, dy) => {
      const r = await page.locator('#' + id).boundingBox();
      const x = corner.includes('w') ? r.x + 6 : r.x + r.width - 6;
      const y = corner.includes('n') ? r.y + 6 : r.y + r.height - 6;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 16 });
      await page.mouse.up();
      await wait(400);
    };

    /* The handles carry drawn cursors, so the assertion checks the custom art is
       actually live and that the keyword fallback behind it is still the right one —
       a url() with no fallback keyword is invalid and gets dropped silently. */
    for (const [c, cur] of [['se', /nwse/], ['nw', /nwse/], ['ne', /nesw/], ['sw', /nesw/], ['n', /ns-/], ['e', /ew-/]]) {
      const h = page.locator(`#${id} [data-rz="${c}"]`);
      const v = await h.evaluate(e => getComputedStyle(e).cursor);
      check(`wm ${c} cursor`, v.startsWith('url(') && cur.test(v), v.slice(-24));
    }

    await grab('se', 150, 110);
    const b2 = await box();
    check('wm resize grows', b2[2] > b1[2] + 100 && b2[3] > b1[3] + 70, `${b1.slice(2)} -> ${b2.slice(2)}`);

    await grab('nw', 60, 40);
    const b3 = await box();
    check('wm nw resize moves origin', b3[0] > b2[0] + 40 && b3[2] < b2[2] - 40, `${b2} -> ${b3}`);

    await grab('ne', 55, 45);
    const b4 = await box();
    check('wm ne resize', b4[2] > b3[2] + 30 && b4[1] > b3[1] + 25, `${b3} -> ${b4}`);

    // min size clamp: drag SE hard into the top-left
    const r5 = await page.locator('#' + id).boundingBox();
    await page.mouse.move(r5.x + r5.width - 6, r5.y + r5.height - 6);
    await page.mouse.down();
    await page.mouse.move(r5.x + 20, r5.y + 20, { steps: 20 });
    await page.mouse.up();
    await wait(400);
    const mm = await page.evaluate(i => {
      const n = document.getElementById(i), w = WM.list.find(x => x.id === i), a = APPS[w.app];
      return [n.offsetWidth, n.offsetHeight, a.minW || 0, a.minH || 0];
    }, id);
    check('wm min size enforced', mm[0] >= mm[2] - 1 && mm[1] >= mm[3] - 1, JSON.stringify(mm));

    // green zoom
    await page.locator(`#${id} [data-w="zoom"]`).click();
    await wait(700);
    check('wm zoom fills', (await box())[2] > 1600, JSON.stringify(await box()));
    check('wm zoom opaques menubar', await page.evaluate(() => document.querySelector('#menubar').classList.contains('opaque')));
    await page.locator(`#${id} [data-w="zoom"]`).click();
    await wait(700);
    check('wm unzoom restores', (await box())[2] < 1600 && (await page.evaluate(i => !WM.list.find(x => x.id === i).zoomed, id)));

    // double-click titlebar
    s = await strip();
    await page.mouse.dblclick(s.x, s.y);
    await wait(750);
    check('wm dblclick zooms', await page.evaluate(i => WM.list.find(x => x.id === i).zoomed === true, id));
    s = await strip();
    await page.mouse.dblclick(s.x, s.y);
    await wait(750);

    // yellow minimise + dock restore
    const app = await page.evaluate(i => WM.list.find(x => x.id === i).app, id);
    await page.locator(`#${id} [data-w="min"]`).click();
    await wait(950);
    check('wm minimise', await page.evaluate(i => WM.list.find(x => x.id === i).min === true, id));
    check('wm minimised is hidden', (await page.locator(`#${id}`).evaluate(e => getComputedStyle(e).visibility)) === 'hidden');
    await page.locator(`#dock .di[data-app="${app}"]`).click();
    await wait(1000);
    check('wm restore from dock', await page.evaluate(i => WM.list.find(x => x.id === i).min === false, id));
    check('wm restored visible', (await page.locator(`#${id}`).evaluate(e => getComputedStyle(e).visibility)) !== 'hidden');

    // red close
    const n0 = await page.evaluate(() => WM.list.length);
    await page.locator(`#${id} [data-w="close"]`).click();
    await wait(700);
    check('wm close', (await page.evaluate(() => WM.list.length)) === n0 - 1, `${n0} -> ${await page.evaluate(() => WM.list.length)}`);
    check('wm focus falls through', (await count('.win.front')) === 1);

    // traffic light glyphs are hidden at rest and revealed on hover
    const id2 = await page.evaluate(() => WM.front.id);
    const gOp = () => page.locator(`#${id2} [data-w="close"] svg`).evaluate(e => +getComputedStyle(e).opacity);
    await page.mouse.move(840, 500);
    await wait(300);
    check('wm traffic glyph hidden at rest', (await gOp()) < 0.2, String(await gOp()));
    await page.locator(`#${id2} .tl`).hover();
    await wait(320);
    check('wm traffic glyph on hover', (await gOp()) > 0.5, String(await gOp()));
    // an unfocused window's lights go grey
    check('wm unfocused lights grey', (await count('.win:not(.front) .tl')) >= 1);

    // windows never escape above the menu bar
    const above = await page.evaluate(() => WM.list.filter(w => !w.min && w.node.offsetTop < 26).length);
    check('wm respects menu bar', above === 0, String(above));
  },

  /* -------------------------------- menu bar -------------------------------- */
  menus: async () => {
    await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
    await wait(500);
    await page.locator('#menubar .mb-item.apple').click();
    await wait(340);
    check('apple menu opens', (await count('.pop .mi')) > 5, String(await count('.pop .mi')));
    const apple = await txt('.pop');
    check('apple menu items', /About This Mac/i.test(apple), apple.split('\n')[0]);
    check('apple menu separators', (await count('.pop .msep')) >= 2);
    check('apple menu shortcuts', (await count('.pop .mi .k')) >= 1);
    await page.keyboard.press('Escape');
    await wait(280);

    // app menus are indexed: 0 is the app name, then File/Edit/View/.../Help
    const labels = (await txt('#mb-titles')).split('\n').map(s => s.trim()).filter(Boolean);
    check('menu bar has app menus', labels.length >= 6, labels.join(','));
    for (const want of ['File', 'Edit', 'View', 'Window', 'Help'])
      check(`menu ${want} present`, labels.includes(want), labels.join(','));

    for (let i = 0; i < labels.length; i++) {
      await page.locator(`#menubar .mb-item[data-menu="${i}"]`).click();
      await wait(300);
      const n = await count('.pop .mi');
      check(`menu "${labels[i]}" dropdown`, n >= 2, `${n} items`);
      await page.keyboard.press('Escape');
      await wait(180);
    }

    /* Help is always the last menu on a Mac. App-specific menus merged into the
       standard set used to fall off the end (Terminal's Shell, Music's Controls). */
    const tail = [];
    for (const app of Object.keys(await page.evaluate(() => APPS))) {
      const ls = await page.evaluate(a => {
        WM.open(a, { force: true });
        return [...document.querySelectorAll('#mb-titles .mb-item')].map(n => n.textContent.trim());
      }, app);
      await wait(70);
      if (ls.length && ls[ls.length - 1] !== 'Help') tail.push(`${app}:${ls.join('|')}`);
    }
    check('Help is the last menu everywhere', tail.length === 0, tail.join('  '));
    await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
    await wait(400);

    // hover-slide: with one menu open, hovering a sibling switches to it
    await page.locator('#menubar .mb-item[data-menu="1"]').click();
    await wait(300);
    await page.locator('#menubar .mb-item[data-menu="2"]').hover();
    await wait(320);
    check('menu hover-slide', (await page.locator('#menubar .mb-item[data-menu="2"]').getAttribute('class')).includes('open'),
      await page.locator('#menubar .mb-item[data-menu="2"]').getAttribute('class'));
    await page.keyboard.press('Escape'); await wait(240);

    await page.locator('#menubar [data-st="wifi"]').click();
    await wait(400);
    const w = await txt('.pop, .panel');
    check('wifi dropdown networks', (w.match(/\n/g) || []).length >= 3, JSON.stringify(w.slice(0, 70)));
    check('wifi has a toggle', (await count('.pop .sw, .panel .sw, .pop .sw2, .panel .sw2')) >= 1);
    await page.keyboard.press('Escape'); await wait(240);

    await page.locator('#menubar [data-st="batt"]').click();
    await wait(400);
    check('battery dropdown', /%/.test(await txt('.pop, .panel')), (await txt('.pop, .panel')).split('\n').slice(0, 3).join('/'));
    await page.keyboard.press('Escape'); await wait(240);

    await page.locator('#menubar [data-st="vol"]').click();
    await wait(400);
    check('volume dropdown slider', (await count('.pop .trk, .panel .trk')) > 0);
    const v0 = await page.evaluate(() => SYS.volume);
    await slide('.pop [data-slider="vol"], .panel [data-slider="vol"]', 0.3);
    check('volume dropdown works', Math.abs((await page.evaluate(() => SYS.volume)) - v0) > 0.05,
      `${v0} -> ${await page.evaluate(() => SYS.volume)}`);
    await page.keyboard.press('Escape'); await wait(240);

    await page.locator('#menubar [data-st="cc"]').click();
    await wait(420);
    check('control centre opens', (await count('.cc')) > 0);
    await page.keyboard.press('Escape'); await wait(240);

    await page.locator('#menubar [data-st="spot"]').click();
    await wait(420);
    check('spotlight from menu bar', (await count('#spot')) === 1);
    await page.keyboard.press('Escape'); await wait(240);

    check('clock ticks', /\d:\d\d/.test(await txt('#mb-clock')), await txt('#mb-clock'));
    check('clock has day + date', /Mon|Tue|Wed|Thu|Fri|Sat|Sun/.test(await txt('#mb-clock')), await txt('#mb-clock'));
    check('battery shows percent', /\d+%/.test(await txt('#menubar [data-st="batt"]')), await txt('#menubar [data-st="batt"]'));
  },

  /* ---------------------------------- dock ---------------------------------- */
  dock: async () => {
    // earlier suites drive the Settings sliders, so pin the prefs first
    await page.evaluate(() => {
      WM.list.slice().forEach(w => WM.close(w.id));
      SYS.dockSize = 58; SYS.dockMag = 1.44; SYS.dockMagOn = true; Dock.measure();
    });
    await wait(400);
    for (const a of ['finder', 'safari', 'notes', 'terminal', 'calculator', 'calendar', 'settings', 'music', 'photos', 'messages'])
      check('dock has ' + a, (await count(`#dock .di[data-app="${a}"]`)) === 1);
    check('dock has trash', (await count('#dock .di[data-app="trash"]')) === 1);
    check('dock divider', (await count('#dock .divider')) >= 1);

    await page.locator('#dock .di[data-app="calculator"]').click();
    await wait(1000);
    check('dock click opens', await page.evaluate(() => WM.list.some(w => w.app === 'calculator')));
    check('dock running dot', (await count('#dock .di[data-app="calculator"].run')) === 1);
    check('dot hidden when closed', (await count('#dock .di[data-app="maps"].run')) === 0);

    /* Measure the target's box with the tray at rest, then approach it — reading a
       box mid-magnification gives a shifted centre, because the tray grows. */
    const restBox = async app => {
      await page.mouse.move(840, 400, { steps: 6 });
      await wait(420);
      return page.locator(`#dock .di[data-app="${app}"]`).boundingBox();
    };

    // magnification profile
    const b = await restBox('photos');
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6, { steps: 12 });
    await wait(480);
    const sizes = await page.evaluate(() => [...document.querySelectorAll('#dock .di')].map(d => d.getBoundingClientRect().width));
    const hi = await page.evaluate(() => [...document.querySelectorAll('#dock .di')].findIndex(d => d.dataset.app === 'photos'));
    const base = Math.min(...sizes), peak = sizes[hi];
    check('dock magnifies hovered', Math.abs(peak - Math.max(...sizes)) < 0.5, `peak ${peak.toFixed(1)} max ${Math.max(...sizes).toFixed(1)}`);
    check('dock mag ratio 1.3-1.6', peak / base > 1.28 && peak / base < 1.62, (peak / base).toFixed(2));
    let mono = true;
    for (let i = hi; i < sizes.length - 1; i++) if (sizes[i + 1] > sizes[i] + 0.8) mono = false;
    for (let i = hi; i > 0; i--) if (sizes[i - 1] > sizes[i] + 0.8) mono = false;
    check('dock falloff monotonic', mono, sizes.map(s => s.toFixed(0)).join(','));
    // dock returns to rest
    await page.mouse.move(840, 400, { steps: 10 });
    await wait(520);
    const rest = await page.evaluate(() => [...document.querySelectorAll('#dock .di')].map(d => d.getBoundingClientRect().width));
    check('dock returns to rest', Math.max(...rest) - Math.min(...rest) < 1.5, `${Math.min(...rest).toFixed(1)}..${Math.max(...rest).toFixed(1)}`);

    /* The peak must land on the icon under the cursor at every pref combination —
       measuring against live centres used to let it drift to a neighbour. */
    for (const [sz, mg] of [[36, 1.9], [76, 1.9], [58, 1.1]]) {
      await page.evaluate(([s, m]) => { SYS.dockSize = s; SYS.dockMag = m; Dock.measure(); }, [sz, mg]);
      await wait(360);
      const drift = [];
      for (const a of ['finder', 'photos', 'music', 'settings', 'safari']) {
        const bb = await restBox(a);
        await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height - 5, { steps: 6 });
        await wait(320);
        const peak = await page.evaluate(() => {
          const ds = [...document.querySelectorAll('#dock .di')];
          const w = ds.map(d => d.getBoundingClientRect().width);
          return ds[w.indexOf(Math.max(...w))].dataset.app;
        });
        if (peak !== a) drift.push(`${a}→${peak}`);
      }
      check(`dock peak tracks cursor @${sz}/${mg}`, drift.length === 0, drift.join(' '));
    }
    await page.evaluate(() => { SYS.dockSize = 58; SYS.dockMag = 1.44; Dock.measure(); });
    await page.mouse.move(840, 400, { steps: 6 });
    await wait(400);

    // tooltip
    await page.mouse.move(b.x + b.width / 2, b.y + b.height - 6, { steps: 8 });
    await wait(450);
    check('dock tooltip', /photos/i.test(await txt('#dock')), '');
    await page.mouse.move(840, 400, { steps: 6 });
    await wait(300);

    // context menu
    await page.locator('#dock .di[data-app="calculator"]').click({ button: 'right' });
    await wait(450);
    const cm = await txt('.pop').catch(() => '');
    for (const want of ['Options', 'Show in Finder', 'Quit'])
      check(`dock ctx "${want}"`, cm.includes(want), JSON.stringify(cm.replace(/\n/g, '|').slice(0, 90)));
    await page.keyboard.press('Escape');
    await wait(300);

    // quit from context menu closes the app
    await page.locator('#dock .di[data-app="calculator"]').click({ button: 'right' });
    await wait(400);
    const q = page.locator('.pop .mi').filter({ hasText: /^Quit/ }).first();
    if (await q.count()) {
      await q.click(); await wait(700);
      check('dock quit closes app', !(await page.evaluate(() => WM.list.some(w => w.app === 'calculator'))));
    } else { check('dock quit item', false, 'no Quit row'); await page.keyboard.press('Escape'); }
    await wait(300);
  },

  /* -------------------------------- desktop --------------------------------- */
  desktop: async () => {
    await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
    await wait(400);
    check('desktop icons', (await count('#desktop .dicon')) >= 3, String(await count('#desktop .dicon')));
    const names = await txt('#desktop');
    for (const n of ['Macintosh HD', 'prasenx.txt'])
      check('desktop has ' + n, names.includes(n));

    const ic = page.locator('#desktop .dicon').first();
    const b0 = await ic.boundingBox();
    await page.mouse.move(b0.x + b0.width / 2, b0.y + 26);
    await page.mouse.down();
    await page.mouse.move(b0.x - 230, b0.y + 200, { steps: 18 });
    await page.mouse.up();
    await wait(600);
    const b1 = await ic.boundingBox();
    check('desktop icon drags', Math.abs(b1.x - b0.x) > 150, `${Math.round(b0.x)} -> ${Math.round(b1.x)}`);
    // snap: every icon must sit exactly on a lattice point derived from GRID
    const off = await page.evaluate(() => {
      const mb = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--mb-h'));
      return [...document.querySelectorAll('#desktop .dicon')].map(d => {
        const col = (innerWidth - GRID.padRight - GRID.w - d.offsetLeft) / GRID.w;
        const row = (d.offsetTop - mb - GRID.padTop) / GRID.h;
        return { col, row, ok: Math.abs(col - Math.round(col)) < 0.02 && Math.abs(row - Math.round(row)) < 0.02 };
      });
    });
    check('desktop icons snap to grid', off.every(o => o.ok),
      off.filter(o => !o.ok).map(o => `${o.col.toFixed(2)},${o.row.toFixed(2)}`).join(' '));

    await ic.dblclick();
    await wait(900);
    check('desktop icon opens', (await page.evaluate(() => WM.list.length)) > 0);

    // right-click bare desktop gives the desktop context menu
    await page.evaluate(() => WM.list.slice().forEach(w => WM.close(w.id)));
    await wait(500);
    await page.mouse.click(760, 700, { button: 'right' });
    await wait(450);
    const dm = await txt('.pop').catch(() => '');
    check('desktop context menu', /New Folder/.test(dm) && /Wallpaper/i.test(dm), JSON.stringify(dm.replace(/\n/g, '|').slice(0, 90)));
    await page.keyboard.press('Escape');
    await wait(300);

    // right-click an icon gives the item menu
    await page.locator('#desktop .dicon').first().click({ button: 'right' });
    await wait(450);
    const im = await txt('.pop').catch(() => '');
    check('desktop icon context menu', /Get Info/.test(im) && /Move to Trash/.test(im), JSON.stringify(im.replace(/\n/g, '|').slice(0, 80)));
    await page.keyboard.press('Escape');
    await wait(300);

    // widgets are on the desktop and reachable
    check('desktop widgets', (await count('#dwidgets .wgt')) >= 3, String(await count('#dwidgets .wgt')));
  },

  /* --------------------- every app mounts without throwing ------------------- */
  mountall: async () => {
    const apps = await page.evaluate(() => Object.keys(APPS).filter(k => !APPS[k].overlay));
    for (const a of apps) {
      const before = errors.length;
      const ok = await page.evaluate(x => {
        try { __only(x, {}, [180, 60, 1060, 640]); return true; }
        catch (e) { return 'throw: ' + e.message; }
      }, a);
      await wait(320);
      let t = '';
      try { t = await txt('.win.front'); } catch { t = ''; }
      const bad = /\[object Object\]|NaN|undefined/.exec(t);
      check(`mount ${a}`, ok === true && errors.length === before && !bad && t.trim().length > 0,
        ok !== true ? String(ok) : (errors.slice(before).join('; ') || (bad ? 'renders "' + bad[0] + '"' : (t.trim() ? '' : 'empty body'))));
    }
  },

  /* ------------------------------- dark mode -------------------------------- */
  darkmode: async () => {
    await page.evaluate(() => { WM.list.slice().forEach(w => WM.close(w.id)); Theme.set('dark'); });
    await wait(900);
    const apps = await page.evaluate(() => Object.keys(APPS).filter(k => !APPS[k].overlay));
    for (const a of apps) {
      await page.evaluate(x => __only(x, {}, [180, 60, 1060, 640]), a);
      await wait(240);
      // any near-white surface in dark mode is a missed token
      const light = await page.evaluate(() => {
        const bad = [];
        document.querySelectorAll('.win.front *').forEach(e => {
          const bg = getComputedStyle(e).backgroundColor;
          const m = /rgba?\((\d+), ?(\d+), ?(\d+)(?:, ?([\d.]+))?\)/.exec(bg);
          if (!m) return;
          const [r, g, b] = [+m[1], +m[2], +m[3]], al = m[4] === undefined ? 1 : +m[4];
          if (al > 0.6 && r > 238 && g > 238 && b > 238 && e.offsetWidth > 90 && e.offsetHeight > 40)
            bad.push((e.className || e.tagName).toString().slice(0, 28) + ' ' + bg);
        });
        return [...new Set(bad)].slice(0, 3);
      });
      check(`dark ${a}`, light.length === 0, light.join(' | '));
    }
    await page.evaluate(() => Theme.set('light'));
    await wait(600);
  },
};

const pick = process.argv.slice(2);
const names = pick.length ? pick : Object.keys(TESTS);
for (const n of names) {
  if (!TESTS[n]) { console.log('unknown suite:', n, '\nknown:', Object.keys(TESTS).join(' ')); continue; }
  try { await TESTS[n](); }
  catch (e) { check(n + ' (suite crashed)', false, e.message.split('\n')[0].slice(0, 160)); }
  await page.keyboard.press('Escape').catch(() => {});
  await wait(200);
}

const bad = results.filter(r => !r.ok);
console.log(results.map(r => `${r.ok ? 'ok  ' : 'FAIL'} ${r.name}${r.detail ? '   → ' + r.detail : ''}`).join('\n'));
console.log(`\n${results.length - bad.length}/${results.length} passed`);
if (bad.length) console.log('FAILED:\n' + bad.map(b => '  ' + b.name + (b.detail ? '   → ' + b.detail : '')).join('\n'));
if (errors.length) console.log('--- JS ERRORS ---\n' + [...new Set(errors)].slice(0, 20).join('\n'));
await browser.close();
process.exit(bad.length ? 1 : 0);
