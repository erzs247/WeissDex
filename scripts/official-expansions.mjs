// Liste des extensions du site officiel anglais (en.ws-tcg.com), pour repérer les séries absentes de la base ouverte.
// Diagnostic seulement : n'écrit rien dans les données de l'appli. Usage : node scripts/official-expansions.mjs [--id 289]
import { readFileSync } from 'node:fs';
const args = process.argv.slice(2);
const id = args.includes('--id') ? args[args.indexOf('--id') + 1] : null;
const ua = { 'user-agent': 'Mozilla/5.0 (WeissDex set check)' };
const get = async (u) => { const r = await fetch(u, { headers: ua }); console.log(`${r.status} ${u}`); return r.text(); };
const html = await get('https://en.ws-tcg.com/cardlist/');
const opts = [...html.matchAll(/<option[^>]*value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map((m) => [m[1], m[2].trim()]).filter(([v, n]) => v && n);
console.log(`${opts.length} options trouvées`);
for (const [v, n] of opts) console.log(`OPT ${v} | ${n}`);
if (id) {
  const p = await get(`https://en.ws-tcg.com/cardlist/searchresults/?expansion=${id}`);
  const codes = [...new Set([...p.matchAll(/[A-Za-z0-9]+\/[A-Z]*\d+-[A-Z]*\d+[A-Za-z]*/g)].map((m) => m[0]))];
  const title = p.match(/<title>([^<]*)/)?.[1];
  const total = p.match(/(\d[\d,]*)\s*(results|件|cards)/i)?.[0];
  console.log(`expansion ${id} : ${title} · ${total ?? '?'} · ${codes.length} codes : ${codes.slice(0, 15).join(' ')}`);
}
// séries anglaises de WeissDex
const cat = JSON.parse(readFileSync(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const en = cat.sets.filter((s) => s.languages[0] === 'en');
console.log(`WeissDex : ${en.length} séries anglaises`);
for (const s of en) console.log(`OURS ${s.print} | ${s.name} | ${s.total}`);
