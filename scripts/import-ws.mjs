// Importe les séries et cartes Weiss Schwarz depuis la base ouverte WS Lounge
// (https://github.com/gabrielcpws-ctrl/ws_lounge_db, licence CC0 1.0 : domaine public, réutilisation libre).
// Deux éditions : anglaise (en, cartes « E001 ») et japonaise (ja). Chaque édition a ses propres séries et cartes.
// Les images ne sont pas copiées : l'appli les affiche depuis les listes officielles de Bushiroad (ws-tcg.com / en.ws-tcg.com).
//
// Chaque carte anglaise est ensuite rattachée à son produit Cardmarket (Weiss Schwarz = jeu n° 10) d'après la liste publique
// des produits : même nom dans la bonne extension Cardmarket, et les versions (normale, SP, SSP…) dans l'ordre de leur numéro.
//
// Usage :
//   node scripts/import-ws.mjs                    télécharge la base (git clone) et réécrit data/catalog.json + data/cards-*.json
//   node scripts/import-ws.mjs --src ./ws_lounge  utilise une copie locale de la base
//   node scripts/import-ws.mjs --cm ./cm          utilise un products_singles_10.json déjà téléchargé
// Derrière un proxy : NODE_USE_ENV_PROXY=1 node scripts/import-ws.mjs
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const config = JSON.parse(readFileSync(join(root, 'data/config.json'), 'utf8'));
const SOURCE = config.source?.repo ?? 'https://github.com/gabrielcpws-ctrl/ws_lounge_db';

// ---------- 1. Base de cartes ----------
let src = opt('src'), tmp = null;
if (!src) {
  tmp = mkdtempSync(join(tmpdir(), 'wsdb-'));
  src = join(tmp, 'db');
  console.log(`Téléchargement de ${SOURCE}…`);
  execFileSync('git', ['clone', '--quiet', '--depth', '1', SOURCE, src], { stdio: 'inherit' });
}
let sourceRev = null;
try { sourceRev = execFileSync('git', ['-C', src, 'log', '-1', '--format=%H %cI'], { encoding: 'utf8' }).trim(); } catch { /* copie sans git */ }
const raw = [];
for (const f of readdirSync(join(src, 'cards')).filter((n) => n.endsWith('.json'))) raw.push(...JSON.parse(readFileSync(join(src, 'cards', f), 'utf8')));
const expIndex = new Map(JSON.parse(readFileSync(join(src, 'expansions.json'), 'utf8')).map((e) => [e.expansion_id, e]));
if (tmp) rmSync(tmp, { recursive: true, force: true });
console.log(`${raw.length} cartes dans la base.`);

const LANG = { EN: 'en', JP: 'ja' };
const COLOR = { YELLOW: 'Yellow', GREEN: 'Green', RED: 'Red', BLUE: 'Blue', PURPLE: 'Purple' };
const TRIG = { SOUL: 'soul', DRAW: 'draw', SHOT: 'shot', BOUNCE: 'return', RETURN: 'return', COMEBACK: 'door', DOOR: 'door', POOL: 'pool', TREASURE: 'gold', GOLDBAR: 'gold', GATE: 'gate', CHOICE: 'choice', STANDBY: 'standby', BOOK: 'book' };
const safe = (s) => String(s).replace(/\//g, '_');                       // pas de « / » dans les identifiants (documents Firestore, URL)
const setCodeOf = (lang, exp) => (lang === 'ja' ? `J-${safe(exp)}` : safe(exp));
const num = (v) => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? undefined : Number(v));

// nom du personnage : « Titre, Prénom Nom » en anglais ; « Titre Prénom Nom » ou « “Titre”Nom » en japonais
function charOf(name, lang) {
  let n = String(name ?? '').trim();
  if (lang === 'en') {
    n = n.replace(/^["“][^"”]*["”]\s*/, '');
    const i = n.lastIndexOf(', ');
    return (i >= 0 ? n.slice(i + 2) : n).trim() || null;
  }
  n = n.replace(/^[“"「『【][^”"」』】]*[”"」』】]\s*/, '');
  const parts = n.split(/[\s　]+/).filter(Boolean);
  if (parts.length >= 3) return parts.slice(1).join(' ');
  if (parts.length === 2 && parts[0].length >= 5) return parts[1];
  return parts.join(' ') || null;
}

const sets = new Map();
const cards = [];
const seen = new Set();
for (const r of raw) {
  const lang = LANG[r.locale];
  if (!lang || !r.code || !r.expansion_id) continue;
  const id = safe(r.code);
  if (seen.has(id)) continue;
  seen.add(id);
  const code = setCodeOf(lang, r.expansion_id);
  let s = sets.get(code);
  if (!s) {
    const e = expIndex.get(r.expansion_id) ?? {};
    s = { code, print: r.expansion_id, name: e.expansion_name || r.expansion || r.expansion_id, block: r.set || e.series_code || 'misc', side: e.side ?? r.side ?? '', lang, urls: [] };
    sets.set(code, s);
  }
  const c = { id, set: code, number: r.sid || r.code.split('-').pop(), name: r.name };
  if (r.rarity) c.rarity = r.rarity;
  if (r.type) c.type = r.type;
  if (COLOR[r.color]) c.color = COLOR[r.color];
  for (const [k, v] of [['level', r.level], ['cost', r.cost], ['power', r.power], ['soul', r.soul]]) { const x = num(v); if (x !== undefined && !(k === 'level' && r.type === 'Climax')) c[k] = x; }
  const trig = (r.trigger ?? []).map((t) => TRIG[String(t).toUpperCase()] ?? String(t).toLowerCase()).filter(Boolean);
  if (trig.length) c.trig = trig;
  const traits = (r.attributes ?? []).map((t) => String(t).trim()).filter((t) => t && t !== '-');
  if (traits.length) c.traits = traits;
  if (r.type === 'Character') { const ch = charOf(r.name, lang); if (ch) c.ch = ch; }
  c._img = r.image_url ?? null;
  c._code = r.code;
  cards.push(c);
}

// ---------- 2. Images : dossier le plus courant de la série, nom de fichier seulement s'il ne se déduit pas du code ----------
const bySet = new Map();
for (const c of cards) { if (!bySet.has(c.set)) bySet.set(c.set, []); bySet.get(c.set).push(c); }
// nom de fichier attendu : code de la carte, « / » et « - » remplacés par « _ » (en minuscules pour le site japonais)
const defaultFile = (c, lang) => { const f = c._code.replace(/[/-]/g, '_'); return lang === 'ja' ? f.toLowerCase() : f; };
const dirOf = (u) => u.slice(0, u.lastIndexOf('/') + 1);
for (const [code, list] of bySet) {
  const s = sets.get(code);
  const dirs = new Map();
  for (const c of list) if (c._img) dirs.set(dirOf(c._img), (dirs.get(dirOf(c._img)) ?? 0) + 1);
  if (!dirs.size) { for (const c of list) c.noimg = 1; continue; }
  const ib = [...dirs].sort((a, b) => b[1] - a[1])[0][0];
  s.ib = ib;
  for (const c of list) {
    if (!c._img) { c.noimg = 1; continue; }
    // dans le dossier de la série : chemin relatif (sans « .png ») ; ailleurs : adresse complète
    const rest = c._img.startsWith(ib) ? c._img.slice(ib.length) : c._img;
    if (rest === `${defaultFile(c, s.lang)}.png`) continue;
    c.im = rest.endsWith('.png') && !rest.startsWith('http') ? rest.slice(0, -4) : rest;
  }
}

// images absentes du site officiel (relevées par check-images.mjs) : l'appli affiche directement l'image de secours
const checkPath = join(root, 'data/image-check.json');
const imgBad = existsSync(checkPath) ? JSON.parse(readFileSync(checkPath, 'utf8')).bad ?? {} : {};
for (const c of cards) if (imgBad[c.id]) c.noimg = 1;

// ---------- 3. Cardmarket : liste publique des produits Weiss Schwarz ----------
const idGame = config.cardmarket.idGame;
let products = [];
try {
  const cmDir = opt('cm');
  if (cmDir) {
    const f = readdirSync(cmDir).find((n) => n.startsWith('products_singles') && n.endsWith('.json'));
    products = JSON.parse(readFileSync(join(cmDir, f), 'utf8')).products;
  } else {
    const url = config.cardmarket.productsUrl.replace('{idGame}', idGame);
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
    products = (await r.json()).products;
  }
  console.log(`Cardmarket : ${products.length} produits Weiss Schwarz.`);
} catch (e) { console.warn(`Liste des produits Cardmarket indisponible (${e.message}) : liens Cardmarket inchangés.`); }

const oldCards = new Map();
for (const l of ['en', 'ja']) {
  const p = join(root, `data/cards-${l}.json`);
  if (existsSync(p)) for (const c of JSON.parse(readFileSync(p, 'utf8')).cards ?? []) oldCards.set(c.id, c);
}

const norm = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
let linked = 0;
const dateOfSet = new Map();
if (products.length) {
  const byExp = new Map();
  for (const p of products) {
    if (!byExp.has(p.idExpansion)) byExp.set(p.idExpansion, new Map());
    const m = byExp.get(p.idExpansion), k = norm(p.name);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(p);
  }
  for (const m of byExp.values()) for (const l of m.values()) l.sort((a, b) => a.idProduct - b.idProduct);
  // extensions Cardmarket candidates pour chaque série anglaise, de la plus ressemblante à la moins ressemblante
  const plans = [];
  for (const [code, list] of bySet) {
    if (sets.get(code).lang !== 'en') continue;
    const names = new Set(list.map((c) => norm(c.name)));
    const ranked = [...byExp].map(([e, m]) => [e, [...names].filter((n) => m.has(n)).length]).filter(([, n]) => n >= Math.max(2, 0.2 * names.size)).sort((a, b) => b[1] - a[1]);
    if (ranked.length) plans.push({ code, list, ranked, score: ranked[0][1] / names.size });
  }
  plans.sort((a, b) => b.score - a.score);
  const used = new Set();
  for (const { code, list, ranked } of plans) {
    const groups = new Map();
    for (const c of list) { const k = norm(c.name); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
    let first = null;
    for (const [k, group] of groups) {
      const e = ranked.find(([x]) => byExp.get(x).has(k))?.[0];
      if (e === undefined) continue;
      const prods = byExp.get(e).get(k).filter((p) => !used.has(p.idProduct));
      if (!prods.length) continue;
      group.sort((a, b) => a.number.localeCompare(b.number, 'en', { numeric: true }));
      // autant de produits que de versions (ou plus) : dans l'ordre ; sinon seule la version de base est rattachée
      const pairs = prods.length >= group.length ? group.map((c, i) => [c, prods[i]]) : [[group[0], prods[0]]];
      for (const [c, p] of pairs) {
        c.cardmarket = { idProduct: p.idProduct, idExpansion: p.idExpansion };
        used.add(p.idProduct); linked++;
        const d = String(p.dateAdded ?? '').slice(0, 10);
        if (d && (!first || d < first)) first = d;
      }
    }
    if (first) dateOfSet.set(code, first);
  }
} else {
  // sans la liste Cardmarket : on garde les liens de l'import précédent
  for (const c of cards) { const o = oldCards.get(c.id); if (o?.cardmarket) { c.cardmarket = o.cardmarket; linked++; } }
  const old = existsSync(join(root, 'data/catalog.json')) ? JSON.parse(readFileSync(join(root, 'data/catalog.json'), 'utf8')) : { sets: [] };
  for (const s of old.sets ?? []) if (s.releaseDate) dateOfSet.set(s.code, s.releaseDate);
}

// ---------- 4. Ordre des séries (les plus récentes en tête dans l'appli) ----------
// Date connue : arrivée de la série sur Cardmarket (anglais). Sinon : estimée d'après le numéro de sortie (W/S… partagent
// une même numérotation chez Bushiroad), puis d'après les autres séries de la même licence.
const relNum = (s) => { const m = String(s.print).split('/')[1]?.match(/^([A-Z]+)-?(\d+)/i); return m ? { fam: /^(W|S|WS)$/i.test(m[1].replace(/^EN-?/i, '')) ? 'main' : m[1].toUpperCase(), n: Number(m[2]) } : null; };
const day = (d) => Date.parse(`${d}T00:00:00Z`) / 864e5;
const known = [];
for (const s of sets.values()) {
  s.releaseDate = dateOfSet.get(s.code) ?? null;
  const r = relNum(s);
  if (s.releaseDate && r?.fam === 'main' && r.n < 1000) known.push([r.n, day(s.releaseDate)]);
}
known.sort((a, b) => a[0] - b[0]);
// date la plus ancienne connue pour chaque numéro (les rééditions anglaises arrivent souvent plus tard)
const calib = [];
for (const [n, d] of known) { if (calib.length && calib[calib.length - 1][0] === n) calib[calib.length - 1][1] = Math.min(calib[calib.length - 1][1], d); else calib.push([n, d]); }
// dates croissantes avec le numéro (une réédition tardive ne doit pas faire reculer les suivantes)
for (let i = calib.length - 2; i >= 0; i--) calib[i][1] = Math.min(calib[i][1], calib[i + 1][1]);
function interp(n) {
  if (!calib.length) return n;
  if (calib.length === 1) return calib[0][1] + (n - calib[0][0]) * 25;
  let i = calib.findIndex(([x]) => x >= n);
  if (i === 0) i = 1; else if (i < 0) i = calib.length - 1;
  const [x0, y0] = calib[i - 1], [x1, y1] = calib[i];
  return x1 === x0 ? y0 : y0 + ((n - x0) * (y1 - y0)) / (x1 - x0);
}
for (const s of sets.values()) {
  const r = relNum(s);
  if (s.releaseDate) s.t = day(s.releaseDate);
  else if (r?.n >= 1990 && r.n <= 2100) s.t = day(`${r.n}-01-01`);            // promos datées (BCS2023…)
  else if (r?.fam === 'main') s.t = interp(r.n);
}
// sinon : à côté des autres séries de la même licence (de la même édition d'abord)
const byBlock = new Map();
const push = (k, t) => { if (!byBlock.has(k)) byBlock.set(k, []); byBlock.get(k).push(t); };
for (const s of sets.values()) if (s.t != null) { push(`${s.lang}|${s.block}`, s.t); push(s.block, s.t); }
for (const s of sets.values()) if (s.t == null) { const l = byBlock.get(`${s.lang}|${s.block}`) ?? byBlock.get(s.block); s.t = l ? Math.max(...l) : 0; }

// ---------- 5. Écriture ----------
const allSets = [...sets.values()].sort((a, b) => a.t - b.t || (relNum(a)?.n ?? 0) - (relNum(b)?.n ?? 0) || a.code.localeCompare(b.code));
const licences = new Map();
allSets.forEach((s, i) => {
  s.order = i + 1;
  s.total = bySet.get(s.code)?.length ?? 0;
  s.languages = [s.lang];
  if (!licences.has(s.block)) licences.set(s.block, new Map());
  const m = licences.get(s.block); m.set(s.name, (m.get(s.name) ?? 0) + s.total);
  delete s.t; delete s.urls; delete s.lang;
  if (!s.side) delete s.side;
});
// nom de chaque licence : le nom de série le plus courant (en nombre de cartes)
// (les séries sans nom dans la base portent leur code : on prend alors celui d'une autre série de la licence)
const prints = new Set(allSets.map((x) => x.print));
const named = (n) => !prints.has(n);
// nom d'animé sans les mots de produit (« Booster Pack TV Anime “DANDADAN” » → « DANDADAN »)
const animeName = (n) => {
  let x = String(n).trim();
  for (let i = 0; i < 3; i++) x = x.replace(/^\[[^\]]*\]\s*/, '').replace(/^(Premium |Extra |Meta |Power-?up )?(Booster|Trial Deck\+?|Starter Deck)( Pack| Set)?\s+/i, '').replace(/^(TV Anime|Anime|Movie|Theatrical Version|Theatrical Edition)\s+/i, '').trim();
  x = x.replace(/^[“"「『](.+)[”"」』]$/, '$1').replace(/\s+(Vol\.?\s*\d+|Specials?)$/i, '').trim();
  return x || String(n);
};
const series = [...licences].map(([id, m]) => ({ id, name: animeName([...m].sort((a, b) => named(b[0]) - named(a[0]) || b[1] - a[1] || a[0].length - b[0].length)[0][0]) }));
const licName = new Map([...licences].map(([id, m]) => [id, [...m].sort((a, b) => named(b[0]) - named(a[0]) || b[1] - a[1])[0][0]]));
for (const s of allSets) if (!named(s.name) && named(licName.get(s.block) ?? '')) s.name = licName.get(s.block);
const clean = (c) => { const { _img, _code, ...rest } = c; return rest; };
const generatedAt = new Date().toISOString();
writeFileSync(join(root, 'data/catalog.json'), JSON.stringify({ demo: false, source: 'WS Lounge (CC0)', sourceRev, generatedAt, split: ['en', 'ja'], series, sets: allSets }));
for (const l of ['en', 'ja']) {
  const list = cards.filter((c) => sets.get(c.set).languages[0] === l).map(clean);
  writeFileSync(join(root, `data/cards-${l}.json`), JSON.stringify({ lang: l, generatedAt, cards: list }));
}
const count = (l) => cards.filter((c) => sets.get(c.set).languages[0] === l).length;
const oldN = oldCards.size;
const summary = `Séries : ${allSets.length} (EN ${allSets.filter((s) => s.languages[0] === 'en').length}, JP ${allSets.filter((s) => s.languages[0] === 'ja').length}). Cartes : ${oldN} → ${cards.length} (EN ${count('en')}, JP ${count('ja')}). Rattachées à Cardmarket : ${linked}.`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Import WS Lounge\n- ${summary}\n- Base : ${sourceRev ?? '?'}\n`, { flag: 'a' });
