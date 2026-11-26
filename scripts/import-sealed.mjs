// Produits scellés (édition anglaise) → data/sealed.json
//  - liste et prix : produits non-cartes de Cardmarket (Weiss Schwarz = jeu n° 10) : boosters, boîtes, decks de démarrage, coffrets
//  - image, date de sortie et lien : pages produits officielles de Bushiroad (en.ws-tcg.com/products), lues une seule fois
//    chacune et gardées dans data/official-products.json (projet personnel, non commercial)
// Usage : node scripts/import-sealed.mjs [--minutes 15]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const stopAt = Date.now() + (Number(args[args.indexOf('--minutes') + 1]) || 15) * 60000;
const read = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const config = read('data/config.json');
const BASE = 'https://en.ws-tcg.com';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; WeissDex personal collection tracker, non-commercial)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) { await sleep(400); return await r.text(); }
      if (r.status === 404) return null;
    } catch { /* nouvel essai */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}
const decode = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;|&rsquo;/g, '’').replace(/&#8220;|&#8221;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// ---------- 1. Pages produits officielles (nouvelles seulement) ----------
const offPath = join(root, 'data/official-products.json');
const off = existsSync(offPath) ? JSON.parse(readFileSync(offPath, 'utf8')) : { products: {} };
const slugs = new Set();
for (const start of [`${BASE}/products/`, `${BASE}/products/products-archive/`]) {
  for (let p = 1; p <= 60 && Date.now() < stopAt; p++) {
    const html = await get(p === 1 ? start : `${start}page/${p}/`);
    if (!html) break;
    const before = slugs.size;
    for (const m of html.matchAll(/href="https:\/\/en\.ws-tcg\.com\/products\/([a-z0-9-]+)\/"/g)) if (!['products-archive', 'page'].includes(m[1])) slugs.add(m[1]);
    if (slugs.size === before) break; // plus de nouveaux produits : fin de la pagination
  }
}
let fresh = 0;
for (const slug of slugs) {
  if (off.products[slug] || Date.now() > stopAt) continue;
  const html = await get(`${BASE}/products/${slug}/`);
  if (!html) continue;
  const main = html.slice(html.indexOf('<main'));
  const img = main.match(/p-products__item-thumbnail[\s\S]*?<img[^>]+src="([^"]+)"/)?.[1];
  const date = decode(main.match(/<dt>Release<\/dt>\s*<dd>([\s\S]*?)<\/dd>/)?.[1]);
  const prefixes = [...new Set([...main.matchAll(/「([A-Za-z0-9]+)\/」/g)].map((m) => m[1]))];
  off.products[slug] = {
    slug, title: decode(main.match(/<p class="p-products__ttl">([\s\S]*?)<\/p>/)?.[1]),
    category: decode(main.match(/<p class="p-products__category">([\s\S]*?)<\/p>/)?.[1]),
    image: img ? new URL(img, BASE).href : null, release: Date.parse(date) ? new Date(Date.parse(date) + 12 * 3600e3).toISOString().slice(0, 10) : null, prefixes,
  };
  fresh++;
}
off.updatedAt = new Date().toISOString();
writeFileSync(offPath, JSON.stringify(off));
console.log(`Site officiel : ${slugs.size} produits listés, ${fresh} nouvelles pages lues, ${Object.keys(off.products).length} connus.`);

// ---------- 2. Produits Cardmarket ----------
let products = [];
try {
  const r = await fetch(config.cardmarket.productsUrl.replace('products_singles_', 'products_nonsingles_').replace('{idGame}', config.cardmarket.idGame));
  products = (await r.json()).products;
} catch (e) { console.warn(`Liste Cardmarket indisponible (${e.message}) : scellé inchangé.`); process.exit(0); }
const CAT = { 'Weiβ Schwarz Booster': 'booster', 'Weiβ Schwarz Booster Boxes': 'box', 'Weiβ Schwarz Trial Decks': 'deck', 'Weiβ Schwarz Meister Sets': 'kit', 'Weiß Schwarz Supply Set': 'kit' };
products = products.filter((p) => CAT[p.categoryName]);

// ---------- 3. Rapprochement : nom Cardmarket ↔ titre officiel, extension Cardmarket ↔ série WeissDex ----------
const STOP = new Set(['booster', 'pack', 'box', 'boxes', 'trial', 'deck', 'premium', 'extra', 'set', 'the', 'tv', 'anime', 'of', 'a', 'and', 'meister', 'supply', 'ex', 'td', 'bp', 'display', 'english', 'edition', 'vol', 'weiss', 'schwarz']);
const words = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w && !STOP.has(w));
const sim = (a, b) => { const A = new Set(words(a)), B = new Set(words(b)); if (!A.size || !B.size) return 0; let n = 0; for (const w of A) if (B.has(w)) n++; return (2 * n) / (A.size + B.size); };
// « Vol.2 » / « 2 » doivent correspondre (sinon Vol.2 et Vol.3 se confondent)
const vol = (s) => (String(s).match(/vol\.?\s*(\d+)|\s(\d)\b(?!\d)/i)?.slice(1).find(Boolean) ?? '1');
const kindOf = (cat) => (/trial|deck/i.test(cat) ? 'deck' : /booster/i.test(cat) ? 'booster' : 'kit');
const offList = Object.values(off.products).filter((o) => o.title);
function bestOfficial(p, cat) {
  const want = cat === 'box' ? 'booster' : cat;
  let best = null, score = 0.55;
  for (const o of offList) {
    if (kindOf(o.category + ' ' + o.title) !== want) continue;
    if (vol(o.title) !== vol(p.name)) continue;
    const s = sim(p.name, o.title);
    if (s > score) { score = s; best = o; }
  }
  return best;
}
const cards = read('data/cards-en.json').cards;
const catalog = read('data/catalog.json');
const setsByCode = new Map(catalog.sets.map((s) => [s.code, s]));
const setOfExp = new Map();
{
  const count = new Map();
  for (const c of cards) { const e = c.cardmarket?.idExpansion; if (!e) continue; const k = `${e}|${c.set}`; count.set(k, (count.get(k) ?? 0) + 1); }
  for (const [k, n] of count) { const [e, s] = k.split('|'); if (!setOfExp.has(e) || setOfExp.get(e)[1] < n) setOfExp.set(e, [s, n]); }
}
const used = new Set();
const items = [];
for (const p of products) {
  const cat = CAT[p.categoryName];
  const o = bestOfficial(p, cat);
  if (o) used.add(o.slug);
  const set = setOfExp.get(String(p.idExpansion))?.[0] ?? null;
  items.push({
    id: `sealed-${p.idProduct}`, kind: 'sealed', name: p.name.replace(/""/g, '"'), category: cat, languages: ['en'],
    ...(set ? { set, print: setsByCode.get(set)?.print } : {}),
    image: o?.image ?? null, official: o ? `${BASE}/products/${o.slug}/` : undefined, release: o?.release ?? p.dateAdded?.slice(0, 10),
    cardmarket: { idProduct: p.idProduct, idExpansion: p.idExpansion },
  });
}
// produits officiels absents de Cardmarket (sorties récentes) : affichés sans prix
for (const o of offList) {
  if (used.has(o.slug) || !o.image) continue;
  const cat = kindOf(o.category + ' ' + o.title);
  const set = catalog.sets.filter((s) => s.languages[0] === 'en' && o.prefixes.includes(s.print.split('/')[0])).sort((a, b) => b.order - a.order)[0];
  items.push({ id: `sealed-off-${o.slug}`, kind: 'sealed', name: o.title, category: cat === 'kit' ? 'kit' : cat, languages: ['en'], ...(set ? { set: set.code, print: set.print } : {}), image: o.image, official: `${BASE}/products/${o.slug}/`, release: o.release });
}
items.sort((a, b) => String(b.release ?? '').localeCompare(String(a.release ?? '')));
items.forEach((it, i) => { it.order = i + 1; if (!it.official) delete it.official; });
writeFileSync(join(root, 'data/sealed.json'), JSON.stringify({ generatedAt: new Date().toISOString(), items }));
const withImg = items.filter((i) => i.image).length;
const msg = `Scellé : ${items.length} produits (${withImg} avec image officielle).`;
console.log(msg);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Scellé\n- ${msg}\n`, { flag: 'a' });
