// Relève les prix Cardmarket du jour (guide des prix public publié chaque nuit ; Weiss Schwarz = jeu n° 10).
// Chaque carte anglaise est rattachée à son produit Cardmarket par import-ws.mjs (idProduct). Les cartes japonaises
// ne sont presque pas vendues sur Cardmarket : elles n'ont en général pas de cote.
//
// Usage :
//   node scripts/update-prices.mjs              télécharge le guide et met à jour data/prices.json + data/history/
//   node scripts/update-prices.mjs --dir ./cm   utilise un price_guide_6.json déjà téléchargé
//
// Fichiers écrits :
//  - data/prices.json : prix du jour de chaque carte (tendance, minimum, moyennes 1/7/30 j, reverse)
//  - data/history/<série>.json : historique des prix tendance, une série par fichier (chargé à la demande par l'appli)
// Une exécution par jour = un point de plus sur chaque courbe (la GitHub Action le fait toute seule).
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const config = readJson('data/config.json');
const idGame = config.cardmarket.idGame;
const dir = opt('dir');

async function loadGuide() {
  if (dir) {
    const f = readdirSync(dir).find((n) => n.startsWith('price_guide') && n.endsWith('.json'));
    if (!f) throw new Error(`price_guide_*.json introuvable dans ${dir}`);
    return JSON.parse(readFileSync(join(dir, f), 'utf8'));
  }
  const url = config.cardmarket.priceGuideUrl.replace('{idGame}', idGame);
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? Math.round(v * 100) / 100 : null);
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
// version foil : « -foil » dans le guide Cardmarket
const rev = (g, k) => num(g[`${k}-foil`]) ?? num(g[`${k}-holo`]);

const catalog = readJson('data/catalog.json');
// cartes : un fichier par édition (data/cards-en.json, data/cards-ja.json)
const files = (catalog.split ?? []).map((l) => [l, readJson(`data/cards-${l}.json`)]);
const allCards = files.flatMap(([, f]) => f.cards);
let guide = null;
try {
  const file = await loadGuide();
  guide = new Map(file.priceGuides.map((g) => [g.idProduct, g]));
  console.log(`Cardmarket : ${file.priceGuides.length} prix (guide du ${file.createdAt}).`);
} catch (e) {
  console.warn(`Guide Cardmarket indisponible (${e.message}) : pas de nouveaux prix aujourd'hui.`);
  process.exit(0);
}

// Extension Cardmarket de chaque carte (liste des produits) : le bouton Cardmarket ouvre la série filtrée sur la carte
try {
  const r = dir ? null : await fetch(config.cardmarket.productsUrl.replace('{idGame}', idGame));
  const products = r?.ok ? (await r.json()).products : [];
  const expOf = new Map(products.map((p) => [p.idProduct, p.idExpansion]));
  let n = 0;
  for (const [l, f] of files) {
    let k = 0;
    for (const c of f.cards) {
      const e = expOf.get(c.cardmarket?.idProduct);
      if (e && c.cardmarket.idExpansion !== e) { c.cardmarket.idExpansion = e; k++; }
    }
    if (k) writeFileSync(join(root, `data/cards-${l}.json`), JSON.stringify(f));
    n += k;
  }
  if (n) console.log(`${n} cartes rattachées à leur extension Cardmarket.`);
} catch (e) { console.warn(`Liste des produits Cardmarket indisponible (${e.message}).`); }

const histDir = join(root, 'data/history');
mkdirSync(histDir, { recursive: true });
const histories = new Map();
const histOf = (set) => {
  if (!histories.has(set)) {
    const p = join(histDir, `${set}.json`);
    histories.set(set, existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {});
  }
  return histories.get(set);
};

const prices = {};
let priced = 0;
for (const c of allCards) {
  const g = guide?.get(c.cardmarket?.idProduct);
  if (!g) continue;
  const holoOnly = !num(g.trend) && !num(g.avg) && !!rev(g, 'trend');
  const f = (k) => (holoOnly ? rev(g, k) : num(g[k]));
  const trend = f('trend') ?? f('avg') ?? f('low');
  if (trend == null) continue;
  priced++;
  const p = { trend, low: f('low'), avg: f('avg'), avg1: f('avg1'), avg7: f('avg7'), avg30: f('avg30') };
  if (holoOnly) p.foil = true; else if (rev(g, 'trend')) p.trendFoil = rev(g, 'trend');
  for (const k of Object.keys(p)) if (p[k] == null) delete p[k];
  const hs = histOf(c.set);
  let h = hs[c.id] ?? [];
  if (!h.length) {
    if (p.avg30) h.push([daysAgo(30), p.avg30]);
    if (p.avg7) h.push([daysAgo(7), p.avg7]);
    if (p.avg1) h.push([daysAgo(1), p.avg1]);
  }
  // le premier mois, la courbe commence par les moyennes 30 j / 7 j / 1 j de Cardmarket (note sous le graphique)
  if (h.length < 34) p.seeded = true;
  h = h.filter(([d]) => d !== today);
  h.push([today, trend]);
  hs[c.id] = h;
  prices[c.id] = p;
}
for (const [set, hs] of histories) writeFileSync(join(histDir, `${set}.json`), JSON.stringify(hs));
writeFileSync(join(root, 'data/prices.json'), JSON.stringify({ demo: false, source: 'Cardmarket', currency: 'EUR', updatedAt: today, split: true, prices }));
console.log(`${priced}/${allCards.length} cartes avec un prix au ${today}.`);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Prix Cardmarket\n- ${priced} cartes avec un prix au ${today}\n`, { flag: 'a' });
