// Fabrique l'index du scanner : une « empreinte » de 9 × 12 points de couleur pour chaque image de carte,
// un fichier par édition (data/scan/en.json, ja.json) téléchargé par l'appli seulement à l'ouverture du scanner.
// Le calcul (moyenne par case sur une image ramenée à 90 × 120) est le même que dans app.js (scanFeature).
// Incrémental et limité : au plus --limit nouvelles images par passage (vignettes de 200 px via wsrv.nl, sinon l'image
// officielle), pour ne pas surcharger les serveurs ; la suite est faite aux passages suivants (chaque lundi).
// Usage : node scripts/make-scan-index.mjs [--limit 3000]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const GW = 9, GH = 12, RW = 90, RH = 120;
export const raw90 = (input) => sharp(input).flatten({ background: '#101014' }).resize(RW, RH, { fit: 'fill' }).raw().toBuffer();
export function boxFeature(px, ch, x = 0, y = 0, w = RW, h = RH) {
  const out = new Uint8Array(GW * GH * 3);
  for (let gy = 0; gy < GH; gy++) for (let gx = 0; gx < GW; gx++) {
    const x0 = Math.floor(x + (gx * w) / GW), x1 = Math.max(x0 + 1, Math.floor(x + ((gx + 1) * w) / GW));
    const y0 = Math.floor(y + (gy * h) / GH), y1 = Math.max(y0 + 1, Math.floor(y + ((gy + 1) * h) / GH));
    const s = [0, 0, 0]; let n = 0;
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { const i = (yy * RW + xx) * ch; s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n++; }
    const o = (gy * GW + gx) * 3; out[o] = s[0] / n; out[o + 1] = s[1] / n; out[o + 2] = s[2] / n;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const limit = Number(args[args.indexOf('--limit') + 1]) || 3000;
  const catalog = JSON.parse(readFileSync(join(root, 'data/catalog.json'), 'utf8'));
  const config = JSON.parse(readFileSync(join(root, 'data/config.json'), 'utf8'));
  const sets = new Map(catalog.sets.map((s) => [s.code, s]));
  // même adresse que officialImage() dans app.js
  const imageOf = (c) => {
    if (c.noimg) return null;
    if (c.im?.startsWith('http')) return c.im;
    const s = sets.get(c.set);
    if (!s?.ib) return null;
    const f = c.id.replace(/-/g, '_');
    return `${s.ib}${c.im ?? (s.languages[0] === 'ja' ? f.toLowerCase() : f)}${c.im && /\.\w{3,4}$/.test(c.im) ? '' : '.png'}`;
  };
  const thumb = config.images?.thumb ?? 'https://wsrv.nl/?url={url}&w={w}&output=webp&q=80';
  mkdirSync(join(root, 'data/scan'), { recursive: true });
  let fetched = 0;
  for (const lang of catalog.split ?? ['en', 'ja']) {
    const cards = JSON.parse(readFileSync(join(root, `data/cards-${lang}.json`), 'utf8')).cards;
    const path = join(root, `data/scan/${lang}.json`);
    const old = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { items: [] };
    const have = new Map(old.items);
    // cartes les plus récentes d'abord (on les scanne plus souvent)
    const todo = cards.filter((c) => !have.has(c.id) && imageOf(c)).sort((a, b) => (sets.get(b.set)?.order ?? 0) - (sets.get(a.set)?.order ?? 0));
    let i = 0;
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (i < todo.length && fetched < limit) {
        const c = todo[i++];
        const u = imageOf(c);
        for (const url of [thumb ? thumb.replace('{url}', encodeURIComponent(u.replace(/^https?:\/\//, ''))).replace('{w}', 200) : null, u].filter(Boolean)) {
          try {
            const r = await fetch(url, { headers: { 'user-agent': 'WeissDex scanner index (collection tracker)' } });
            if (!r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            have.set(c.id, Buffer.from(boxFeature(await raw90(buf), 3)).toString('base64'));
            fetched++;
            break;
          } catch { /* image indisponible : réessayée la prochaine fois */ }
        }
      }
    }));
    const ids = new Set(cards.map((c) => c.id));
    const items = [...have].filter(([id]) => ids.has(id));
    writeFileSync(path, JSON.stringify({ w: GW, h: GH, generatedAt: new Date().toISOString(), items }));
    console.log(`Scanner ${lang} : ${items.length} empreintes (${Math.max(0, todo.length - i)} images restent à traiter).`);
  }
}
