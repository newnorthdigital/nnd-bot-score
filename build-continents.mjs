// Builds a compact lowercase ISO-3166 country -> 2-letter continent map literal
// for the bot-score template. Source: annexare/Countries (continent codes
// AF/AN/AS/EU/NA/OC/SA per country).
const URLS = [
  'https://raw.githubusercontent.com/annexare/Countries/master/dist/countries.min.json',
  'https://raw.githubusercontent.com/annexare/Countries/master/data/countries.json',
];
let data = null;
for (const u of URLS) {
  try {
    const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
    if (r.ok) { data = await r.json(); console.error('# source: ' + u); break; }
  } catch (e) { console.error('# ' + u + ' failed: ' + e.message); }
}
if (!data) { console.error('# ALL SOURCES FAILED'); process.exit(1); }
const map = {};
for (const cc of Object.keys(data)) {
  const cont = data[cc].continent;
  if (cont) map[cc.toLowerCase()] = String(cont).toLowerCase();
}
const keys = Object.keys(map).sort();
const body = keys.map((k) => `${k}:'${map[k]}'`).join(',');
console.log(`const CONTINENT = {${body}};`);
console.error(`# ${keys.length} countries mapped`);
