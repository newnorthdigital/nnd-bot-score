// Generates the IPv4 integer-range literals bundled into the NND Bot Score
// sGTM variable template (template.tpl).
//
// Fetches the providers' OFFICIAL published IP ranges, converts each CIDR to a
// [startInt, endInt] pair (plain JS numbers — max 2^32 is within Number's safe
// integer range), sorts + merges touching ranges, and prints two `const` lines
// to splice between the // <ranges> markers in template.tpl.
//
// The sandboxed detector has no bitwise ops and can't parse CIDRs at runtime,
// so all of that work happens here, ahead of time.
//
// Run:  node build-ranges.mjs           (live fetch; falls back to seeds on error)
//       node build-ranges.mjs > out.txt 2> log.txt
//
// CDN/edge ranges (CloudFront, Global Accelerator) are deliberately EXCLUDED
// from the datacenter set: they sit IN FRONT of containers, so a visitor whose
// request transits them would false-positive if X-Forwarded-For/ip_override
// weren't populated. Bots originate from compute ranges (EC2, GCE, Azure VMs),
// which we keep.

// --- datacenter / hosting sources -------------------------------------------
const DATACENTER_SOURCES = [
  {
    name: 'AWS',
    url: 'https://ip-ranges.amazonaws.com/ip-ranges.json',
    extract: (j) =>
      (j.prefixes || [])
        .filter((p) => p.service !== 'CLOUDFRONT' && p.service !== 'GLOBALACCELERATOR')
        .map((p) => p.ip_prefix)
        .filter(Boolean),
  },
  {
    name: 'GCP',
    url: 'https://www.gstatic.com/ipranges/cloud.json',
    extract: (j) => (j.prefixes || []).map((p) => p.ipv4Prefix).filter(Boolean),
  },
];

// Hosters without a stable machine-readable feed — kept as a manual seed and
// merged with the fetched ranges. Azure owns most of these /8-/10 super-blocks;
// the rest are DigitalOcean / Hetzner / OVH / Linode / Vultr representatives.
const DATACENTER_SEED = [
  // Azure (ServiceTags download URL rotates weekly — seeded super-blocks)
  '13.64.0.0/11', '20.0.0.0/8', '40.64.0.0/10', '52.224.0.0/11',
  // DigitalOcean
  '104.131.0.0/16', '138.197.0.0/16', '159.65.0.0/16', '165.227.0.0/16',
  '167.99.0.0/16', '178.62.0.0/16', '46.101.0.0/16',
  // Hetzner
  '5.9.0.0/16', '65.108.0.0/16', '88.99.0.0/16', '95.216.0.0/16',
  '116.202.0.0/16', '135.181.0.0/16',
  // OVH
  '51.38.0.0/16', '51.68.0.0/16', '51.75.0.0/16', '54.36.0.0/16',
  '137.74.0.0/16', '145.239.0.0/16', '167.114.0.0/16',
  // Linode / Akamai
  '45.33.0.0/16', '45.79.0.0/16', '139.144.0.0/16', '172.104.0.0/15', '173.255.192.0/18',
  // Vultr
  '45.32.0.0/16', '45.63.0.0/16', '45.76.0.0/16', '66.42.0.0/16',
  '108.61.0.0/16', '149.28.0.0/16',
];

// --- verified AI-crawler sources (whitelist override) -----------------------
const oaiExtract = (j) => (j.prefixes || []).map((p) => p.ipv4Prefix).filter(Boolean);
const AI_CRAWLER_SOURCES = [
  { name: 'OpenAI GPTBot', url: 'https://openai.com/gptbot.json', extract: oaiExtract },
  { name: 'OpenAI ChatGPT-User', url: 'https://openai.com/chatgpt-user.json', extract: oaiExtract },
  { name: 'OpenAI SearchBot', url: 'https://openai.com/searchbot.json', extract: oaiExtract },
  { name: 'Googlebot', url: 'https://developers.google.com/static/search/apis/ipranges/googlebot.json', extract: oaiExtract },
  { name: 'Google special-crawlers', url: 'https://developers.google.com/static/search/apis/ipranges/special-crawlers.json', extract: oaiExtract },
];

function cidrToRange(cidr) {
  const [ip, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const o = ip.split('.').map(Number);
  if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  const ipInt = o[0] * 16777216 + o[1] * 65536 + o[2] * 256 + o[3];
  const size = Math.pow(2, 32 - bits);
  const start = ipInt - (ipInt % size);
  return [start, start + size - 1];
}

function toSortedMerged(cidrs) {
  const ranges = cidrs.map(cidrToRange).filter(Boolean).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  return merged;
}

async function gather(sources, seed = []) {
  const cidrs = [...seed];
  for (const s of sources) {
    try {
      const res = await fetch(s.url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const got = s.extract(await res.json());
      cidrs.push(...got);
      console.error(`# ${s.name}: ${got.length} IPv4 prefixes`);
    } catch (e) {
      console.error(`# ${s.name}: FAILED (${e.message}) — skipped`);
    }
  }
  return cidrs;
}

const dc = toSortedMerged(await gather(DATACENTER_SOURCES, DATACENTER_SEED));
const ai = toSortedMerged(await gather(AI_CRAWLER_SOURCES));

const fmt = (name, ranges) =>
  `const ${name} = [${ranges.map((r) => `[${r[0]},${r[1]}]`).join(',')}];`;

console.log(fmt('DATACENTER_RANGES', dc));
console.log(fmt('AI_CRAWLER_RANGES', ai));
console.error(`# TOTAL datacenter: ${dc.length} merged ranges, ai-crawler: ${ai.length} merged ranges`);
