// Diagnostic : montre la structure HTML des pages de la liste officielle (pour écrire import-official.mjs).
const ua = { 'user-agent': 'Mozilla/5.0 (WeissDex, projet perso non commercial)' };
const get = async (u) => { const r = await fetch(u, { headers: ua }); const t = await r.text(); console.log(`\n##### ${r.status} ${u} (${t.length} car.)`); return t; };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/\s+/g, ' ');
const list = strip(await get('https://en.ws-tcg.com/cardlist/searchresults/?expansion=289'));
const i = list.indexOf('RZ/S116-E001');
console.log('--- autour de la 1re carte ---\n' + list.slice(Math.max(0, i - 2500), i + 2500));
console.log('--- pagination ---\n' + [...list.matchAll(/<a[^>]+href="([^"]*(?:page|paged)[^"]*)"[^>]*>/g)].map((m) => m[1]).slice(0, 20).join('\n'));
console.log('--- liens de cartes ---\n' + [...new Set([...list.matchAll(/href="([^"]*cardno[^"]*)"/g)].map((m) => m[1]))].slice(0, 5).join('\n'));
const link = list.match(/href="([^"]*cardno[^"]*)"/)?.[1];
if (link) {
  const d = strip(await get(new URL(link.replace(/&amp;/g, '&'), 'https://en.ws-tcg.com/').href));
  const j = d.indexOf('RZ/S116');
  console.log('--- fiche carte ---\n' + d.slice(Math.max(0, j - 1500), j + 5000));
}
const p2 = strip(await get('https://en.ws-tcg.com/cardlist/searchresults/?expansion=289&page=2'));
console.log('page 2 codes : ' + [...new Set([...p2.matchAll(/RZ\/S116-[A-Z]*\d+[A-Za-z]*/g)].map((m) => m[0]))].slice(0, 10).join(' '));
