// Complète la base ouverte (WS Lounge) avec les extensions anglaises qui lui manquent, d'après la liste officielle
// de Bushiroad (en.ws-tcg.com/cardlist). Projet personnel, non commercial : seules les extensions absentes de WS Lounge
// sont lues, avec une pause entre les pages, et le résultat est gardé (data/official-en.json) pour ne pas les relire.
//
// Usage : node scripts/fetch-official.mjs [--src ./ws_lounge_db] [--minutes 20] [--recheck]
//   --src      copie locale de WS Lounge (sinon : codes des cartes de data/cards-en.json)
//   --recheck  relit aussi les extensions déjà complétées (cartes ajoutées après coup)
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const stopAt = Date.now() + (Number(opt('minutes')) || 20) * 60000;
const RECHECK = args.includes('--recheck');
const BASE = 'https://en.ws-tcg.com';
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; WeissDex personal collection tracker, non-commercial)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(path) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${BASE}${path}`, { headers: UA, signal: AbortSignal.timeout(30000) });
      if (r.ok) { await sleep(400); return await r.text(); }
      if (r.status === 404) return null;
    } catch { /* nouvel essai */ }
    await sleep(2000 * (i + 1));
  }
  return null;
}
const decode = (s) => String(s ?? '').replace(/<br\s*\/?>/g, ' ').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/\s+/g, ' ').trim();
const dd = (block, label) => block.match(new RegExp(`<dt>${label}</dt>\\s*<dd>([\\s\\S]*?)</dd>`))?.[1] ?? '';
const gifs = (html) => [...html.matchAll(/partimages\/([a-z_]+)\.gif/g)].map((m) => m[1]);
const num = (s) => { const t = decode(s); return /^\d+$/.test(t) ? Number(t) : null; };

// une page de résultats → cartes au format de WS Lounge
function parsePage(html, expansion) {
  const out = [];
  const items = html.split(/<li>\s*<a href="\/cardlist\/\?cardno=/).slice(1);
  for (const it of items) {
    const code = decode(it.match(/<p class="number">([^<]*)</)?.[1]);
    if (!code || !code.includes('/')) continue;
    const img = it.match(/<div class="image"><img src="([^"]+)"/)?.[1];
    const type = decode(dd(it, 'Card Type'));
    const side = gifs(dd(it, 'Side'))[0];
    const color = gifs(dd(it, 'Color'))[0];
    const soul = gifs(dd(it, 'Soul')).filter((g) => g === 'soul').length;
    const trig = gifs(dd(it, 'Trigger')).map((g) => g.toUpperCase());
    const expId = code.slice(0, code.lastIndexOf('-'));
    out.push({
      code, name: decode(it.match(/<p class="ttl[^"]*">([\s\S]*?)<\/p>/)?.[1]), locale: 'EN',
      set: code.split('/')[0], side: side === 's' ? 'S' : side === 'w' ? 'W' : '', release: expId.split('/')[1] ?? '',
      sid: code.slice(code.lastIndexOf('-') + 1), expansion_id: expId, expansion,
      color: (color ?? '').toUpperCase(), level: num(dd(it, 'Level')), cost: num(dd(it, 'Cost')), power: num(dd(it, 'Power')), soul,
      rarity: decode(dd(it, 'Rarity')), type: ['Character', 'Event', 'Climax'].includes(type) ? type : '',
      attributes: [], trigger: trig, image_url: img ? new URL(img, BASE).href : null, source: 'en.ws-tcg.com',
    });
  }
  return out;
}

// codes des cartes déjà dans WS Lounge (pour ne lire que ce qui manque)
const have = new Set();
const src = opt('src');
if (src && existsSync(join(src, 'cards'))) {
  for (const f of readdirSync(join(src, 'cards'))) for (const c of JSON.parse(readFileSync(join(src, 'cards', f), 'utf8'))) if (c.locale === 'EN') have.add(c.code);
} else if (existsSync(join(root, 'data/cards-en.json'))) {
  for (const c of JSON.parse(readFileSync(join(root, 'data/cards-en.json'), 'utf8')).cards) if (!c.src) have.add(c.id.replace('_', '/'));
}
const path = join(root, 'data/official-en.json');
const state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
state.covered ??= {};   // extension officielle → « wsl » (déjà dans WS Lounge) ou « official » (lue ici)
state.cards ??= {};     // code → carte lue sur le site officiel
state.names ??= {};     // code d'extension (ex. GBS/S63) → nom officiel (corrige les noms de WS Lounge)
console.log(`WS Lounge : ${have.size} cartes anglaises. Déjà complétées : ${Object.values(state.covered).filter((v) => v === 'official').length} extensions.`);

const home = await get('/cardlist/');
if (!home) { console.log('Liste officielle indisponible : rien à compléter cette fois.'); process.exit(0); }
const sel = home.match(/<select[^>]*name="expansion"[\s\S]*?<\/select>/)?.[0] ?? home;
const ids = [...new Set([...sel.matchAll(/<option[^>]*value="(\d+)"/g)].map((m) => m[1]))].sort((a, b) => b - a);
console.log(`${ids.length} extensions sur le site officiel.`);
let added = 0, read = 0;
for (const id of ids) {
  if (Date.now() > stopAt) { console.log('Temps écoulé : la suite au prochain passage.'); break; }
  if ((state.covered[id] === 'wsl' && state.named?.includes(id)) || (state.covered[id] === 'official' && !RECHECK)) continue;
  const first = await get(`/cardlist/searchresults/?expansion=${id}&view=text&sort=no`);
  if (!first) continue;
  read++;
  const expansion = decode(first.match(/<h2 class="c-search__results-ttl">([\s\S]*?)<\/h2>/)?.[1]);
  const total = Number(first.match(/Search Results<span>(\d+)<\/span>/)?.[1] ?? 0);
  const page1 = parsePage(first, expansion);
  if (!page1.length) continue;
  // nom officiel de chaque code d'extension (le booster plutôt que son deck de démarrage)
  for (const c of page1) {
    const cur = state.names[c.expansion_id];
    if (!cur || (/^\[TD\]|Trial Deck/i.test(cur) && !/^\[TD\]|Trial Deck/i.test(expansion))) state.names[c.expansion_id] = expansion;
  }
  state.named = [...new Set([...(state.named ?? []), id])];
  const known = page1.filter((c) => have.has(c.code)).length;
  if (known >= page1.length * 0.6) { state.covered[id] = 'wsl'; continue; } // déjà dans la base ouverte
  const cards = [...page1];
  const pages = Math.ceil(total / page1.length);
  for (let p = 2; p <= pages && Date.now() < stopAt; p++) {
    const h = await get(`/cardlist/searchresults/?expansion=${id}&view=text&sort=no&page=${p}`);
    if (h) cards.push(...parsePage(h, expansion));
  }
  let n = 0;
  for (const c of cards) if (!have.has(c.code)) { if (!state.cards[c.code]) n++; state.cards[c.code] = c; }
  added += n;
  if (cards.length >= total) state.covered[id] = 'official';
  console.log(`  + ${id} « ${expansion} » : ${cards.length}/${total} cartes (${n} nouvelles)`);
}
state.updatedAt = new Date().toISOString();
writeFileSync(path, JSON.stringify(state));
const msg = `${read} extensions officielles lues, ${added} cartes ajoutées (${Object.keys(state.cards).length} au total depuis le site officiel).`;
console.log(msg);
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### Compléments du site officiel\n- ${msg}\n`, { flag: 'a' });
