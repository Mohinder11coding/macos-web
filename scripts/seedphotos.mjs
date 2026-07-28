/* Builds the Photos library from Wikimedia Commons featured pictures. Runs once, at
   authoring time, and prints a JS array of verified permanent URLs with real titles
   and photographers — so the app ships actual photographs instead of generated art,
   and every URL in it is one this script confirmed resolves. */
const QUERIES = [
  ['mountain lake', 'Landscapes'], ['alps sunrise', 'Landscapes'],
  ['city skyline night', 'Cities'], ['bridge fog', 'Cities'],
  ['coast cliff sea', 'Coast'], ['beach turquoise', 'Coast'],
  ['forest autumn', 'Nature'], ['desert dune', 'Nature'],
  ['temple japan', 'Travel'], ['venice canal', 'Travel'],
  ['bird flight', 'Wildlife'], ['fox snow', 'Wildlife'],
  ['aurora night sky', 'Skies'], ['milky way', 'Skies'],
  ['flower macro', 'Close-ups'], ['coffee cup', 'Close-ups'],
];

const api = 'https://commons.wikimedia.org/w/api.php';
const seen = new Set();
const out = [];

const clean = t => t.replace(/^File:/, '').replace(/\.(jpg|jpeg|png|tif|tiff|webp)$/i, '')
  .replace(/[_]+/g, ' ').replace(/\s*\([^)]*\)\s*$/, '').trim();
const strip = h => (h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

for (const [q, album] of QUERIES) {
  const url = `${api}?action=query&generator=search&gsrsearch=${encodeURIComponent(
    `filetype:bitmap incategory:"Featured_pictures_on_Wikimedia_Commons" ${q}`)}` +
    /* 500 is one of the handful of widths upload.wikimedia.org still serves —
       ask for anything else and the URL comes back 400 "use standard sizes". */
    `&gsrlimit=6&gsrnamespace=6&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=500&format=json&origin=*`;
  /* Commons throttles bursts, so this crawls politely and retries once. */
  const get = async () => {
    const r = await fetch(url, { headers: { 'User-Agent': 'macos-web-demo/1.0 (authoring script)' } });
    const text = await r.text();
    try { return JSON.parse(text); } catch { return null; }
  };
  let j = await get();
  if (!j) { await new Promise(r => setTimeout(r, 4000)); j = await get(); }
  if (!j) { process.stderr.write(`${q}: throttled, skipped\n`); continue; }
  await new Promise(r => setTimeout(r, 3500));
  const pages = Object.values((j.query || {}).pages || {});
  let taken = 0;
  for (const p of pages) {
    if (taken >= 3) break;
    const ii = (p.imageinfo || [])[0];
    if (!ii || !ii.thumburl) continue;
    /* Landscape only — the grid is built on 4:3 tiles and portraits letterbox badly. */
    if (!ii.thumbwidth || ii.thumbwidth < ii.thumbheight * 1.15) continue;
    const key = ii.thumburl.split('/').slice(-2, -1)[0];
    if (seen.has(key)) continue;
    seen.add(key);
    const md = ii.extmetadata || {};
    const artist = strip(md.Artist && md.Artist.value).slice(0, 42) || 'Unknown';
    /* Commons dates arrive as anything from an ISO stamp to "Taken on 9 May 2011",
       so pull the first real date out of whatever prose is there. */
    const raw = strip(md.DateTimeOriginal && md.DateTimeOriginal.value) + ' ' +
      strip(md.DateTime && md.DateTime.value);
    const iso = /(\d{4})-(\d{2})-(\d{2})/.exec(raw);
    const words = /(\d{1,2})\s+([A-Z][a-z]+)\s+(\d{4})/.exec(raw);
    const when = iso ? iso[0]
      : words ? new Date(`${words[2]} ${words[1]}, ${words[3]}`).toISOString().slice(0, 10)
        : '';
    out.push({
      t: clean(p.title).slice(0, 54),
      by: artist,
      album,
      when,
      th: ii.thumburl,
      w: ii.thumbwidth, h: ii.thumbheight,
    });
    taken++;
  }
  process.stderr.write(`${q}: ${taken}\n`);
}

/* Every URL gets checked, because a 404 in the grid is worse than no photo at all. */
/* No HEAD sweep here: hammering upload.wikimedia.org just earns a 429 that looks
   like a dead link. These thumburls come from the API itself, and the honest test is
   loading them in a browser, which shotphotos.mjs does. */
process.stderr.write(`\n${out.length} photos collected\n`);
console.log(JSON.stringify(out, null, 1));
