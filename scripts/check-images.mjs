// Vérifie que les images officielles des cartes existent (requête HEAD, très légère).
// Usage : node scripts/check-images.mjs                      séries jamais vérifiées + cartes déjà sans image (chaque lundi)
//         node scripts/check-images.mjs --sets Ffp            seulement les séries dont le code commence par « Ffp »
//         node scripts/check-images.mjs --minutes 20          temps maximal (la suite au passage suivant)
// Écrit data/image-check.json (séries vérifiées, cartes sans image) et marque ces cartes « noimg » dans data/cards-*.json :
// l'appli leur affiche directement l'image de secours (autre édition, puis visuel généré).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const prefix = opt('sets');
const stopAt = Date.now() + (Number(opt('minutes')) || 20) * 60000;
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const catalog = read('data/catalog.json');
const sets = new Map(catalog.sets.map((s) => [s.code, s]));
const checkPath = join(root, 'data/image-check.json');
const state = existsSync(checkPath) ? JSON.parse(readFileSync(checkPath, 'utf8')) : {};
state.sets ??= []; state.bad ??= {};
const checkedSets = new Set(state.sets);
// adresse de l'image officielle, sans tenir compte d'un « noimg » déjà posé (on la re-teste)
const imageOf = (c) => {
  if (c.im?.startsWith('http')) return c.im;
  const s = sets.get(c.set);
  if (!s?.ib) return null;
  const f = c.id.replace(/-/g, '_');
  return `${s.ib}${c.im ?? (s.languages[0] === 'ja' ? f.toLowerCase() : f)}${c.im && /\.\w{3,4}$/.test(c.im) ? '' : '.png'}`;
};
const files = (catalog.split ?? ['en', 'ja']).map((l) => [l, read(`data/cards-${l}.json`)]);
const all = files.flatMap(([, f]) => f.cards);
const todo = prefix
  ? all.filter((c) => c.set.replace(/^J-/, '').toLowerCase().startsWith(prefix.toLowerCase()))
  : all.filter((c) => state.bad[c.id] || !checkedSets.has(c.set)).sort((a, b) => (sets.get(b.set)?.order ?? 0) - (sets.get(a.set)?.order ?? 0));
const status = async (u) => {
  for (const method of ['HEAD', 'GET']) {
    try {
      const r = await fetch(u, { method, headers: { 'user-agent': 'WeissDex image check' }, signal: AbortSignal.timeout(20000) });
      if (method === 'GET') await r.arrayBuffer();
      if (r.status === 405 && method === 'HEAD') continue;
      return { ok: r.ok && /^image\//.test(r.headers.get('content-type') ?? ''), st: r.status };
    } catch (e) { if (method === 'GET') return { ok: null, st: `ERR ${e.cause?.code ?? e.message}` }; }
  }
  return { ok: null, st: '?' };
};
const done = new Map(); // set → cartes vérifiées
let i = 0, nBad = 0, nFixed = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (i < todo.length && Date.now() < stopAt) {
    const c = todo[i++];
    const u = imageOf(c);
    const r = u ? await status(u) : { ok: false, st: 'pas d\'adresse' };
    if (r.ok === null) continue; // erreur réseau : on ne conclut rien
    if (r.ok) { if (state.bad[c.id]) nFixed++; delete state.bad[c.id]; } else { state.bad[c.id] = r.st; nBad++; }
    done.set(c.set, (done.get(c.set) ?? 0) + 1);
  }
}));
// une série est « vérifiée » quand toutes ses cartes l'ont été
const perSet = new Map();
for (const c of all) perSet.set(c.set, (perSet.get(c.set) ?? 0) + 1);
for (const [s, n] of done) if (n >= (todo.filter((c) => c.set === s).length)) checkedSets.add(s);
state.sets = [...checkedSets].sort();
state.checkedAt = new Date().toISOString();
writeFileSync(checkPath, JSON.stringify(state));
// cartes sans image : « noimg » dans les fichiers de cartes
for (const [l, f] of files) {
  let changed = false;
  for (const c of f.cards) {
    const bad = !!state.bad[c.id];
    if (bad && !c.noimg) { c.noimg = 1; changed = true; } else if (!bad && c.noimg) { delete c.noimg; changed = true; }
  }
  if (changed) writeFileSync(join(root, `data/cards-${l}.json`), JSON.stringify(f));
}
for (const [id, st] of Object.entries(state.bad).slice(0, 40)) console.log(`  ✗ ${id} (${st})`);
const msg = `${i}/${todo.length} cartes vérifiées : ${nBad} sans image, ${nFixed} retrouvées. Total sans image : ${Object.keys(state.bad).length}. Séries vérifiées : ${state.sets.length}/${perSet.size}.`;
console.log(msg);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Images\n- ${msg}\n`, { flag: 'a' });
