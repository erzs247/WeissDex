// Vérifie que les images des cartes répondent (image officielle, et vignette wsrv.nl).
// Usage : node scripts/check-images.mjs --sets Ffp            séries dont le code commence par « Ffp » (EN et JP)
//         node scripts/check-images.mjs --sample 20            20 cartes au hasard par série (toute la base)
// Écrit data/image-check.json : cartes dont l'image officielle ne répond pas (utilisé par import-ws.mjs pour les sauter).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const prefix = opt('sets') ?? '';
const sample = Number(opt('sample')) || 0;
const catalog = JSON.parse(readFileSync(join(root, 'data/catalog.json'), 'utf8'));
const config = JSON.parse(readFileSync(join(root, 'data/config.json'), 'utf8'));
const sets = new Map(catalog.sets.map((s) => [s.code, s]));
const imageOf = (c) => {
  if (c.noimg) return null;
  if (c.im?.startsWith('http')) return c.im;
  const s = sets.get(c.set);
  if (!s?.ib) return null;
  const f = c.id.replace(/-/g, '_');
  return `${s.ib}${c.im ?? (s.languages[0] === 'ja' ? f.toLowerCase() : f)}${c.im && /\.\w{3,4}$/.test(c.im) ? '' : '.png'}`;
};
const thumb = (u) => config.images.thumb.replace('{url}', encodeURIComponent(u.replace(/^https?:\/\//, ''))).replace('{w}', 300);
let cards = (catalog.split ?? ['en', 'ja']).flatMap((l) => JSON.parse(readFileSync(join(root, `data/cards-${l}.json`), 'utf8')).cards);
if (prefix) cards = cards.filter((c) => c.set.replace(/^J-/, '').toLowerCase().startsWith(prefix.toLowerCase()));
if (sample) {
  const by = new Map();
  for (const c of cards) { if (!by.has(c.set)) by.set(c.set, []); by.get(c.set).push(c); }
  cards = [...by.values()].flatMap((l) => l.sort(() => Math.random() - 0.5).slice(0, sample));
}
const head = async (u) => {
  try { const r = await fetch(u, { method: 'GET', headers: { 'user-agent': 'WeissDex image check' }, signal: AbortSignal.timeout(20000) }); const n = (await r.arrayBuffer()).byteLength; return `${r.status} ${r.headers.get('content-type') ?? ''} ${n}`; }
  catch (e) { return `ERR ${e.cause?.code ?? e.message}`; }
};
const bad = [], perSet = new Map();
let i = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < cards.length) {
    const c = cards[i++];
    const u = imageOf(c);
    const st = u ? await head(u) : 'NO URL';
    const ok = /^200 image\//.test(st);
    const ps = perSet.get(c.set) ?? { ok: 0, bad: 0 }; ps[ok ? 'ok' : 'bad']++; perSet.set(c.set, ps);
    if (!ok) bad.push({ id: c.id, set: c.set, url: u, status: st, thumb: u ? await head(thumb(u)) : '' });
  }
}));
for (const [s, v] of [...perSet].sort()) if (v.bad || prefix) console.log(`${s}: ${v.ok} ok, ${v.bad} sans image`);
for (const b of bad.slice(0, 60)) console.log(`  ✗ ${b.id} ${b.status} | vignette ${b.thumb} | ${b.url}`);
console.log(`${cards.length} cartes testées, ${bad.length} sans image officielle.`);
const path = join(root, 'data/image-check.json');
const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { bad: {} };
for (const c of cards) delete old.bad[c.id];
for (const b of bad) old.bad[b.id] = b.status;
writeFileSync(path, JSON.stringify({ checkedAt: new Date().toISOString(), bad: old.bad }));
