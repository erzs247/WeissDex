// Diagnostic : montre la structure HTML des pages produits officielles (pour écrire import-sealed.mjs).
const ua = { 'user-agent': 'Mozilla/5.0 (WeissDex, projet perso non commercial)' };
const get = async (u) => { const r = await fetch(u, { headers: ua }); const t = await r.text(); console.log(`\n##### ${r.status} ${u} (${t.length} car.)`); return t; };
const strip = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/\s+/g, ' ');
const list = strip(await get('https://en.ws-tcg.com/products/'));
const i = list.indexOf('bp-rz3');
console.log('--- autour de bp-rz3 ---\n' + list.slice(Math.max(0, i - 2500), i + 1500));
console.log('--- liens produits ---\n' + [...new Set([...list.matchAll(/href="(https:\/\/en\.ws-tcg\.com\/products\/[^"]+)"/g)].map((m) => m[1]))].slice(0, 30).join('\n'));
console.log('--- pagination ---\n' + [...new Set([...list.matchAll(/href="([^"]*\/page\/\d+[^"]*)"/g)].map((m) => m[1]))].join('\n'));
const d = strip(await get('https://en.ws-tcg.com/products/bp-rz3/'));
const j = d.indexOf('<main');
console.log('--- page produit ---\n' + d.slice(j, j + 6000));
