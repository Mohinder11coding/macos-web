/* Turns the raw Commons dump into the library the app ships: drops anything that
   doesn't belong in someone's photo roll, tidies filename-shaped titles into
   captions, and derives a place from the words that are already there. */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = JSON.parse(readFileSync(path.join(root, 'photos.json'), 'utf8'));

const DROP = [
  /model rosie/i, /girl with swimming/i, /destroyed/i, /IR Spitzer/i,
  /^Common foxes in the snow$/i, /balconies/i, /Focus Stack/i, /marsstation/i,
];

/* Filenames carry camera and edit debris. None of it belongs in a caption. */
const tidy = t => {
  let s = t
    .replace(/\s*--\s*\d{4}\s*--\s*\d+\s*$/, '')
    .replace(/\s*-\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\s*edit\d*\s*$/i, '')
    .replace(/\s*Photo by .*$/i, '')
    .replace(/[,\s]*\d{4}-\d{2}-\d{2}\s*$/, '')
    .replace(/\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*$/i, '')
    .replace(/\s+(SG\d+|BLS|HDR|edit\d*)\s*$/i, '')
    .replace(/^\d{3}\s+/, '')
    .replace(/\s+\d{1,3}\s*$/, '')
    .replace(/\s*\(\s*\)\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/[,\s]+$/, '')
    .trim();
  /* Long comma-strings are filenames listing a location three ways over. The place
     field already carries that, so keep the subject and drop the trail. */
  if ((s.match(/,/g) || []).length >= 3) s = s.split(',').slice(0, 2).join(',').trim();
  return s.replace(/[,\s]+$/, '');
};

/* Places worth naming, matched against the title so the label is never invented. */
const PLACES = [
  [/nepal|chola/i, 'Solukhumbu, Nepal'], [/caucas/i, 'Western Caucasus'],
  [/lienz/i, 'Lienz, Austria'], [/tilisuna/i, 'Montafon, Austria'],
  [/montriond/i, 'Haute-Savoie, France'], [/new york/i, 'New York City'],
  [/qu[eé]bec/i, 'Québec City, Canada'], [/san francisco|golden gate/i, 'San Francisco, California'],
  [/port campbell|peterborough \(au\)/i, 'Victoria, Australia'], [/sydney/i, 'Sydney, Australia'],
  [/gaztelugache|bermeo/i, 'Bermeo, Basque Country'], [/havelock|andaman/i, 'Havelock Island, Andamans'],
  [/thau|s[eè]te/i, 'Sète, France'], [/finnish|finland/i, 'Finland'],
  [/d[üu]lmen|b[öo]rnste/i, 'Dülmen, Germany'], [/tennfjorden|raftsundet|hinn[øo]ya/i, 'Lofoten, Norway'],
  [/sossusvlei|namib/i, 'Sossusvlei, Namibia'], [/ginkaku-ji|kinkaku-ji|kyoto/i, 'Kyoto, Japan'],
  [/venice|venezia|san marco|canal grande|salute/i, 'Venice, Italy'],
  [/palo alto/i, 'Palo Alto, California'], [/iceland|m[ýy]vatn/i, 'Iceland'],
  [/storfjorden|lyngen/i, 'Troms, Norway'], [/bontecou/i, 'Hudson Valley, New York'],
  [/perseid/i, 'Under the Perseids'],
];

const out = [];
for (const p of raw) {
  const t = tidy(p.t);
  if (!t || t.length < 4) continue;
  if (DROP.some(re => re.test(p.t))) continue;
  if (!p.when || +p.when.slice(0, 4) < 1990) continue;
  const place = (PLACES.find(([re]) => re.test(p.t)) || [])[1] || '';
  out.push({ t, place, by: p.by, album: p.album, when: p.when, th: p.th, full: p.full });
}

/* Newest first, the way a photo library opens. */
out.sort((a, b) => b.when.localeCompare(a.when));

const esc = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const lines = out.map(p =>
  `  { t: '${esc(p.t)}', place: '${esc(p.place)}', by: '${esc(p.by)}', album: '${p.album}', when: '${p.when}',\n` +
  `    th: '${p.th}' },`);
console.log(lines.join('\n'));
process.stderr.write(`${out.length} photos kept\n`);
process.stderr.write(out.map(p => `${p.when}  ${p.album.padEnd(11)} ${p.t}${p.place ? '  — ' + p.place : '  — (no place)'}`).join('\n') + '\n');
