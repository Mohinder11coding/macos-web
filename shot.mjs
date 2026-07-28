import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';

const dir = path.dirname(fileURLToPath(import.meta.url));
/* boot=0 skips power-on and login; those have their own scenarios. */
const url = 'file://' + path.join(dir, 'index.html').replace(/\\/g, '/') + '?boot=0';

// One name = that shot (plus optional trailing JS to eval). Several names = batch.
const args = process.argv.slice(2);
// `clip=x,y,w,h` and `dpr=1` let me pull a tight native-scale crop of anything
// without hardcoding a new entry in CLIPS first.
const flags = {};
const rest = args.filter(a => {
  const m = /^(clip|dpr|out|headless)=(.+)$/.exec(a);
  if (m) { flags[m[1]] = m[2]; return false; }
  return true;
});
const names = (rest.length ? rest : ['desktop']).filter(a => !a.startsWith('{') && !a.includes('('));
const extra = rest.filter(a => a.startsWith('{') || a.includes('(')).join(' ');
const adhoc = flags.clip && (([x, y, width, height]) => ({ x, y, width, height }))(flags.clip.split(',').map(Number));
const dpr = flags.dpr ? Number(flags.dpr) : 2;

// Crops let me inspect chrome at 2x instead of squinting at a full 1680px frame.
const CLIPS = {
  dock:     { x: 300, y: 918, width: 1080, height: 132 },
  dockzoom: { x: 520, y: 908, width: 640, height: 142 },
  menu:     { x: 0,   y: 0,   width: 560, height: 190 },
  menur:    { x: 1150, y: 0,  width: 530, height: 34  },
  tl:       { x: 160, y: 20,  width: 420, height: 90  },
  dots:     { x: 366, y: 960, width: 300, height: 90 },
  widgets:  { x: 0,   y: 20,  width: 300, height: 560 },
  darkwgt:  { x: 0,   y: 20,  width: 300, height: 560 },
  darktray: { x: 300, y: 918, width: 1080, height: 132 },
  ncwx:     { x: 1320, y: 20, width: 360, height: 430 },
  ncicon:   { x: 1520, y: 20, width: 160, height: 340 },
  bftest:   { x: 1150, y: 200, width: 320, height: 240 },
  bfoverlay:{ x: 1150, y: 200, width: 320, height: 240 },
  ncnoanim: { x: 1520, y: 20, width: 160, height: 340 },
  ncnoicon: { x: 1520, y: 20, width: 160, height: 340 },
  nctint:   { x: 1520, y: 20, width: 160, height: 340 },
  bfbisect: { x: 1120, y: 200, width: 560, height: 280 },
  dockL:    { x: 356, y: 978, width: 500, height: 66 },
  dockR:    { x: 856, y: 978, width: 500, height: 66 },
};

// `only` closes everything, opens one app at a fixed rect. Keeps shots comparable.
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

const one = (app, rect, opts) => async (p) => {
  await p.evaluate(([a, r, o]) => __only(a, o, r), [app, rect, opts || {}]);
  await p.waitForTimeout(600);
};

const SCENARIOS = {
  desktop: async () => {},
  /* These two need the real startup path, so they reload without boot=0. */
  boot: async (p) => {
    await p.goto(url.replace('?boot=0', ''), { waitUntil: 'load' });
    await p.waitForTimeout(900);
  },
  lock: async (p) => {
    await p.evaluate(() => Startup.lock());
    await p.waitForTimeout(1000);
  },
  /* Live-network Safari: a real search, a real article, a real embed. */
  safariSearch: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('liquid glass design'));
    await p.waitForTimeout(2600);
  },
  safariWiki: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('en.wikipedia.org/wiki/MacOS'));
    await p.waitForTimeout(3000);
  },
  safariBlocked: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('news.ycombinator.com'));
    await p.waitForTimeout(4200);
  },
  /* Reader has to fetch through an extractor, so it gets a long leash. */
  safariReader: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('news.ycombinator.com'));
    await p.waitForTimeout(14000);
  },
  safariArticle: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('overreacted.io/before-you-memo/'));
    await p.waitForTimeout(14000);
  },
  safariFrame: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('caniuse.com'));
    await p.waitForTimeout(5000);
  },
  safariChrome: async (p) => {
    await p.evaluate(() => {
      __only('safari', {}, [70, 60, 1120, 700]);
      Saf.toggleSidebar(); Saf.toggleFavBar();
      Saf.go('apple.com'); Saf.newTab(); Saf.go('en.wikipedia.org/wiki/Bézier_curve');
    });
    await p.waitForTimeout(3000);
  },
  safariLive: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('example.com'));
    await p.waitForTimeout(3400);
  },
  safariVideo: async (p) => {
    await p.evaluate(() => __only('safari', {}, [70, 60, 1120, 700]));
    await p.waitForTimeout(500);
    await p.evaluate(() => Saf.go('youtube.com/watch?v=aqz-KE-bpKQ'));
    await p.waitForTimeout(3200);
  },
  unlocking: async (p) => {
    await p.evaluate(() => Startup.lock());
    await p.waitForTimeout(700);
    await p.evaluate(() => Startup.unlock());
    await p.waitForTimeout(260);
  },
  widgets: async () => {},
  menur: async () => {},
  dockL: async () => {},
  dockR: async () => {},

  apps: async (p) => {
    await p.evaluate(() => {
      __only('terminal',   {}, [60, 60, 700, 420]);
      __add('calculator',  {}, [1180, 90, 320, 470]);
      __add('notes',       {}, [180, 330, 900, 540]);
      __add('safari',      {}, [620, 150, 1000, 620]);
    });
    await p.waitForTimeout(900);
  },

  five: async (p) => {
    await p.evaluate(() => {
      __only('finder', {}, [40, 50, 620, 400]);
      __add('music',   {}, [330, 130, 800, 500]);
      __add('calendar',{}, [620, 220, 820, 520]);
      __add('mail',    {}, [880, 300, 760, 500]);
      __add('settings',{}, [1150, 90, 500, 620]);
    });
    await p.waitForTimeout(900);
  },

  /* The arrangement worth screenshotting: a few apps that each show off something
     different, dock caught mid-magnification. */
  hero: async (p) => {
    await p.evaluate(() => __only('terminal', {}, [92, 452, 690, 430]));
    await p.waitForTimeout(360);
    await p.keyboard.type('neofetch\n', { delay: 10 });
    await p.waitForTimeout(360);
    await p.evaluate(() => {
      __add('music',  {}, [820, 470, 800, 470]);
      __add('notes',  {}, [520, 96, 900, 540]);
      __add('safari', {}, [96, 74, 780, 500]);
    });
    await p.waitForTimeout(700);
    const b = await p.locator('#dock .di[data-app="photos"]').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
    await p.waitForTimeout(520);
  },

  dots: async (p) => {
    await p.evaluate(() => { __only('finder'); __add('safari'); __add('notes'); __add('music'); });
    await p.waitForTimeout(700);
  },
  dock: async (p) => {
    const b = await p.locator('#dock .di[data-app="photos"]').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
    await p.waitForTimeout(500);
  },
  dockzoom: async (p) => {
    const b = await p.locator('#dock .di[data-app="notes"]').boundingBox();
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 14 });
    await p.waitForTimeout(500);
  },

  menu:      async (p) => { await p.mouse.click(20, 13); await p.waitForTimeout(360); },
  filemenu:  async (p) => { await p.mouse.click(75, 13); await p.waitForTimeout(360); },
  wifi:      async (p) => { await p.locator('#menubar [data-st="wifi"]').click(); await p.waitForTimeout(420); },
  cc:        async (p) => { await p.locator('#menubar [data-st="cc"]').click(); await p.waitForTimeout(420); },
  batt:      async (p) => { await p.locator('#menubar [data-st="battery"]').click(); await p.waitForTimeout(420); },

  tl: async (p) => {
    await p.evaluate(() => __only('textedit', { file: { name: 'prasenx.txt', k: 'Plain Text', body: 'hello' } }, [170, 40, 400, 300]));
    await p.waitForTimeout(400);
    const b = await p.locator('.win .tl').boundingBox();
    await p.mouse.move(b.x + 8, b.y + 6);
    await p.waitForTimeout(300);
  },

  spotlight: async (p) => {
    await p.evaluate(() => Spotlight.open());
    await p.waitForTimeout(220);
    await p.keyboard.type('ca', { delay: 40 });
    await p.waitForTimeout(450);
  },
  launchpad: async (p) => { await p.evaluate(() => Launchpad.open()); await p.waitForTimeout(700); },
  notif:     async (p) => { await p.evaluate(() => NotifCenter.open()); await p.waitForTimeout(800); },
  ncwx:      async (p) => { await p.evaluate(() => NotifCenter.open()); await p.waitForTimeout(800); },
  ncicon:    async (p) => { await p.evaluate(() => NotifCenter.open()); await p.waitForTimeout(900); },
  // Sanity: does backdrop-filter render at all in this browser?
  bftest:    async (p) => {
    await p.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:1200px;top:250px;width:220px;height:140px;z-index:940;' +
        'background:rgba(255,255,255,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)';
      document.querySelector('#stage').appendChild(d);
    });
    await p.waitForTimeout(500);
  },
  bfoverlay: async (p) => {
    await p.evaluate(() => {
      const d = document.createElement('div');
      d.style.cssText = 'position:absolute;left:1200px;top:250px;width:220px;height:140px;' +
        'background:rgba(255,255,255,.08);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)';
      document.querySelector('#layer-overlay').appendChild(d);
    });
    await p.waitForTimeout(500);
  },
  bfbisect: async (p) => {
    await p.evaluate(() => {
      const mk = (x, css) => {
        const d = document.createElement('div');
        d.style.cssText = `position:absolute;left:${x}px;top:250px;width:100px;height:200px;` + css;
        document.querySelector('#layer-overlay').appendChild(d);
      };
      mk(1140, 'backdrop-filter:blur(58px);-webkit-backdrop-filter:blur(58px)');
      mk(1260, 'backdrop-filter:blur(24px) saturate(150%) brightness(.97);-webkit-backdrop-filter:blur(24px) saturate(150%) brightness(.97)');
      mk(1380, 'background:rgba(0,0,0,.05);border-left:.5px solid rgba(255,255,255,.28);box-shadow:-10px 0 40px -12px rgba(0,0,0,.28);' +
        'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)');
      mk(1500, 'top:26px;height:1024px;width:160px;left:1500px;animation:ncIn .36s ease both;' +
        'backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px)');
    });
    await p.waitForTimeout(900);
  },
  nctint: async (p) => {
    const info = await p.evaluate(() => {
      NotifCenter.open();
      document.querySelector('#desktop').style.display = 'none';
      const all = document.querySelectorAll('#nc');
      const n = all[all.length - 1];
      n.style.backdropFilter = n.style.webkitBackdropFilter = 'blur(24px)';
      n.style.background = 'rgba(255,0,0,.16)';
      const w = document.querySelector('#nc .wgt');
      return {
        count: all.length, rect: JSON.stringify(n.getBoundingClientRect()),
        wgtBg: w ? getComputedStyle(w).backgroundColor : 'none',
        wgtBf: w ? getComputedStyle(w).backdropFilter : 'none',
        scrollOv: getComputedStyle(document.querySelector('#nc .nc-scroll')).overflow,
      };
    });
    console.log(info);
    await p.waitForTimeout(700);
  },
  ncnoicon: async (p) => {
    await p.evaluate(() => { NotifCenter.open(); document.querySelector('#desktop').style.display = 'none'; });
    await p.waitForTimeout(700);
  },
  ncnoanim: async (p) => {
    await p.evaluate(() => {
      NotifCenter.open();
      const n = document.querySelector('#nc');
      n.style.animation = 'none'; n.style.transform = 'none'; void n.offsetHeight;
    });
    await p.waitForTimeout(700);
  },

  terminal: async (p) => {
    await p.evaluate(() => __only('terminal', {}, [130, 60, 880, 660]));
    await p.waitForTimeout(400);
    await p.keyboard.type('neofetch\n', { delay: 12 });
    await p.waitForTimeout(500);
  },
  termls: async (p) => {
    await p.evaluate(() => __only('terminal', {}, [130, 60, 880, 620]));
    await p.waitForTimeout(400);
    await p.keyboard.type('ls -la\n', { delay: 10 });
    await p.keyboard.type('cd Projects && ls\n', { delay: 10 });
    await p.keyboard.type('git status\n', { delay: 10 });
    await p.keyboard.type('sudo rm -rf /\n', { delay: 10 });
    await p.waitForTimeout(500);
  },

  calculator: one('calculator', [640, 120, 340, 500]),
  finder: async (p) => {
    await p.evaluate(() => {
      __only('finder', {}, [120, 60, 1080, 660]);
      Finder.nav(__w, ['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Projects']);
    });
    await p.waitForTimeout(500);
  },
  column: async (p) => {
    await p.evaluate(() => {
      __only('finder', {}, [100, 60, 1180, 620]);
      __w.st.view = 'column'; Finder.render(__w);
    });
    await p.waitForTimeout(400);
    // Walk down three levels by clicking, the way a user would.
    for (const n of ['Desktop', 'Projects', 'macos-web']) {
      await p.locator(`.fv-col .ci:has-text("${n}")`).last().click();
      await p.waitForTimeout(260);
    }
    await p.locator('.fv-col .ci:has-text("index.html")').last().click();
    await p.waitForTimeout(500);
  },
  gallery: async (p) => {
    await p.evaluate(() => {
      __only('finder', {}, [100, 60, 1180, 620]);
      Finder.nav(__w, ['Macintosh HD', 'Users', 'prasenjit', 'Pictures']);
      __w.st.view = 'gallery'; Finder.render(__w);
    });
    await p.waitForTimeout(500);
  },
  list: async (p) => {
    await p.evaluate(() => {
      __only('finder', {}, [100, 60, 1080, 620]);
      __w.st.view = 'list'; Finder.render(__w);
    });
    await p.waitForTimeout(500);
  },

  safari:   one('safari', [180, 60, 1180, 720]),
  notes:    one('notes', [150, 60, 1120, 680]),
  calendar: one('calendar', [150, 60, 1100, 680]),
  photolib: async (p) => {
    await p.evaluate(() => __only('photos', {}, [110, 50, 1060, 700]));
    await p.waitForTimeout(6500);
  },
  photodetail: async (p) => {
    await p.evaluate(() => __only('photos', {}, [110, 50, 1060, 700]));
    await p.waitForTimeout(5000);
    await p.locator('.ph-cell').nth(4).dblclick();
    await p.waitForTimeout(4000);
  },
  photodays2: async (p) => {
    await p.evaluate(() => __only('photos', {}, [110, 50, 1060, 700]));
    await p.waitForTimeout(4000);
    await p.locator('[data-pgroup="Days"]').click();
    await p.waitForTimeout(5000);
  },
  photoweb: async (p) => {
    await p.evaluate(() => __only('photos', {}, [110, 50, 1060, 700]));
    await p.waitForTimeout(3500);
    await p.locator('[data-psearch]').fill('kerala backwaters');
    await p.waitForTimeout(600);
    await p.locator('[data-pweb]').first().click();
    await p.waitForTimeout(6500);
  },
  appearance: async (p) => {
    await p.evaluate(() => __only('settings', {}, [150, 60, 900, 640]));
    await p.waitForTimeout(400);
    await p.locator('[data-sec="appearance"]').click();
    await p.waitForTimeout(400);
  },
  accentorange: async (p) => {
    await p.evaluate(() => __only('settings', {}, [150, 60, 900, 640]));
    await p.waitForTimeout(400);
    await p.locator('[data-sec="appearance"]').click();
    await p.waitForTimeout(300);
    await p.locator('[data-accent="orange"]').click();
    await p.waitForTimeout(300);
    await p.evaluate(() => { __add('finder', {}, [520, 320, 700, 440]); });
    await p.waitForTimeout(600);
  },
  amenergy: async (p) => {
    await p.evaluate(() => __only('activity', {}, [180, 70, 900, 580]));
    await p.waitForTimeout(400);
    await p.locator('[data-am="Energy"]').click();
    await p.waitForTimeout(300);
  },
  amnet: async (p) => {
    await p.evaluate(() => __only('activity', {}, [180, 70, 900, 580]));
    await p.waitForTimeout(400);
    await p.locator('[data-am="Network"]').click();
    await p.waitForTimeout(300);
  },
  photodays: async (p) => {
    await p.evaluate(() => __only('photos', {}, [140, 70, 1000, 650]));
    await p.waitForTimeout(400);
    await p.locator('[data-pgroup="Days"]').click();
    await p.waitForTimeout(300);
  },
  calweek: async (p) => {
    await p.evaluate(() => __only('calendar', {}, [150, 60, 1100, 680]));
    await p.waitForTimeout(400);
    await p.locator('[data-view="week"]').click();
    await p.waitForTimeout(400);
  },
  calday: async (p) => {
    await p.evaluate(() => __only('calendar', {}, [150, 60, 1100, 680]));
    await p.waitForTimeout(400);
    await p.locator('[data-view="day"]').click();
    await p.waitForTimeout(400);
  },
  calyear: async (p) => {
    await p.evaluate(() => __only('calendar', {}, [150, 60, 1100, 680]));
    await p.waitForTimeout(400);
    await p.locator('[data-view="year"]').click();
    await p.waitForTimeout(400);
  },
  music:    one('music', [130, 60, 1140, 700]),
  settings: one('settings', [280, 60, 900, 680], { section: 'appearance' }),
  setdock:  one('settings', [280, 60, 900, 680], { section: 'dock' }),
  setwall:  one('settings', [280, 60, 900, 680], { section: 'wallpaper' }),
  mail:     one('mail', [130, 60, 1180, 700]),
  messages: one('messages', [200, 60, 1000, 660]),
  /* Tiles arrive over the network, so this one waits longer than the rest. */
  maps: async (p) => {
    await p.evaluate(() => __only('maps', {}, [160, 60, 1080, 680]));
    await p.waitForTimeout(3600);
  },
  mapsearch: async (p) => {
    await p.evaluate(() => __only('maps', {}, [160, 60, 1080, 680]));
    await p.waitForTimeout(1400);
    await p.locator('[data-msearch]').fill('Golden Gate Bridge');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(3000);
  },
  mapsgo: async (p) => {
    await p.evaluate(() => __only('maps', {}, [160, 60, 1080, 680]));
    await p.waitForTimeout(1400);
    await p.locator('[data-msearch]').fill('Golden Gate Bridge');
    await p.keyboard.press('Enter');
    await p.waitForTimeout(2600);
    await p.locator('.maps .results button').first().click();
    await p.waitForTimeout(3800);
  },
  photos:   one('photos', [140, 60, 1120, 680]),
  reminders:one('reminders', [280, 60, 860, 620]),
  weather:  one('weather', [560, 60, 500, 700]),
  stocks:   one('stocks', [200, 60, 1000, 640]),
  clock:    one('clock', [480, 90, 620, 480]),
  contacts: one('contacts', [280, 60, 900, 620]),
  freeform: one('freeform', [200, 60, 1000, 660]),
  podcasts: one('podcasts', [180, 60, 1040, 680]),
  tv:       one('tv', [180, 60, 1040, 680]),
  books:    one('books', [180, 60, 1040, 680]),
  appstore: one('appstore', [180, 60, 1040, 680]),
  facetime: one('facetime', [280, 60, 900, 640]),
  about:    one('about', [560, 90, 520, 560]),
  preview:  one('preview', [400, 60, 800, 640]),
  textedit: one('textedit', [400, 60, 760, 620]),

  dark: async (p) => {
    await p.evaluate(() => { Theme.set('dark'); Wall.set('night'); });
    await p.waitForTimeout(1600);
    await p.evaluate(() => {
      __only('music', {}, [110, 70, 900, 560]);
      __add('finder', {}, [600, 260, 780, 480]);
      __add('terminal', {}, [200, 420, 640, 380]);
    });
    await p.waitForTimeout(900);
  },
  darkdock: async (p) => {
    await p.evaluate(() => { Theme.set('dark'); Wall.set('night'); });
    await p.waitForTimeout(1600);
  },
  darkwgt:  async (p) => { await p.evaluate(() => { Theme.set('dark'); Wall.set('night'); }); await p.waitForTimeout(1600); },
  darkmaps: async (p) => {
    await p.evaluate(() => { Theme.set('dark'); Wall.set('night'); });
    await p.waitForTimeout(1400);
    await p.evaluate(() => __only('maps', {}, [160, 60, 1080, 680]));
    await p.waitForTimeout(700);
  },
  darktray: async (p) => { await p.evaluate(() => { Theme.set('dark'); Wall.set('night'); }); await p.waitForTimeout(1600); },

  zoomed: async (p) => {
    await p.evaluate(() => { __only('safari', {}, [200, 90, 900, 560]); WM.zoom(__w.id); });
    await p.waitForTimeout(700);
  },
};

/* Headed on purpose. Headless Chromium rasterises in software and silently drops
   blur() inside backdrop-filter, so every vibrancy surface — menu bar, dock,
   sidebars, Notification Centre — screenshots flat and sharp. Only the real
   compositor tells the truth about glass. `headless=1` opts back out. */
const browser = await chromium.launch({
  headless: flags.headless === '1',
  args: [
    /* Headed, but parked far off the desktop so it never flashes over your work.
       Occlusion backgrounding is disabled below, so being off-screen costs nothing. */
    '--hide-scrollbars', '--window-position=-4000,-4000',
    // A headed window behind other windows counts as occluded, and Chromium then
    // freezes animations — which parks anything mid-transition off-screen.
    '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
});
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 }, deviceScaleFactor: dpr });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
page.on('pageerror', e => errors.push('[pageerror] ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));

const unknown = names.filter(n => !SCENARIOS[n]);
if (unknown.length) { console.log('unknown:', unknown.join(' '), '\nknown:', Object.keys(SCENARIOS).join(' ')); await browser.close(); process.exit(1); }

for (const name of names) {
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(names.length > 1 ? 1700 : 2600);
  await page.addScriptTag({ content: helpers });
  await SCENARIOS[name](page);
  if (extra) { await page.evaluate(extra); await page.waitForTimeout(700); }
  const file = (flags.out || name) + '.png';
  await page.screenshot({ path: path.join(dir, 'shots', file), clip: adhoc || CLIPS[name] });
  console.log('shot →', 'shots/' + file);
}
if (errors.length) { console.log('--- ERRORS (' + errors.length + ') ---\n' + [...new Set(errors)].join('\n')); }
else console.log('no console errors');
await browser.close();
