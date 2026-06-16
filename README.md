# NND Bot Score — server-side GTM variable

A **server-side (sGTM) Custom Variable** template that returns a **0–100 bot score** (or a boolean) for the current request, computed entirely from signals readable inside the server container. Use it as a **blocking-trigger exception** on your GA4 server tag to keep bot traffic out of GA4.

It scores the *measurement request*, not site access — it can't stop a crawler from reading the site (that's robots.txt / WAF territory), only decide whether the hit is counted.

## Why

GA4 already drops known IAB bots. What it misses is **headless browsers, scraping libraries, and fake-UA traffic from datacenters**. This variable targets exactly that gap, server-side, with no external API call (fully synchronous, so it works as a blocking-trigger condition) and no dependency beyond the bundled IP ranges.

## Signals & weights

| Signal | Weight | Notes |
| --- | --- | --- |
| Client IP in a datacenter / hosting range | 70 | Primary, region-agnostic. Matched against bundled, official cloud ranges (AWS, GCP, Azure, DO, Hetzner, OVH, Linode, Vultr). |
| Headless / automation / empty UA | 40 | `HeadlessChrome`, `python-requests`, `Go-http-client`, Puppeteer, Playwright, curl, … Precise but spoofable. |
| Modern-Chromium UA with no `sec-ch-ua` | 25 | Gated on a Chromium UA claim — Safari/Firefox are never penalised. |
| `sec-ch-ua-platform` contradicts the UA OS | 25 | e.g. UA says Windows, hint says Linux. |
| `sec-ch-ua-mobile` contradicts the UA | 20 | Desktop UA with a mobile hint, or vice-versa. |
| Forged `sec-ch-ua` brand list | 20 | Hint present but contains no real Chromium/brand token. |
| Browser UA with no `accept-language` | 15 | |
| Browser UA with no `accept-encoding` | 15 | Real browsers always send `gzip`/`br`. |
| Implausibly old Chromium major version | 10 | Real fleets auto-update. |
| Datacenter IP outside the client's market | 10 | Score-only nudge, never blocks. |
| Country on a high-risk list | 10 | Score-only nudge, never blocks. |

The score is capped at 100. A clean residential browser scores **0**; a residential IP must fail several integrity checks at once to cross 70, so the datacenter signal stays the decisive lever.

**Verified AI crawlers are whitelisted by default** (score 0). "Verified" means the UA matches a known crawler **and** the IP is in that crawler's published range (GPTBot, ChatGPT-User, OAI-SearchBot, Googlebot, Google special crawlers are bundled), so a spoofed `GPTBot` UA from a random host is still scored normally. Flip **Count verified AI crawlers as bots** on if you want clean human-only analytics.

## Installation

### Community Template Gallery
GTM server container → **Templates** → **Variables** → **Search Gallery** → "NND Bot Score" → **Add to workspace**.

### Manual
Download `template.tpl`, then GTM → **Templates** → **New** → ⋮ → **Import**, and select the file.

## Setup

1. Create a **Variable** of type *NND Bot Score*. Leave **Output** on `Score`.
2. **Shadow mode first.** Add the variable as a GA4 event parameter (e.g. `debug_bot_score`) or just watch it in Preview, and observe the distribution on real traffic for a few days. A false positive here is a *lost real conversion*, so don't block on day one.
3. When a threshold looks safe, add a **blocking trigger** to your GA4 server tag: *Block when* `NND Bot Score` *is greater than* your threshold (70 is the default — a datacenter IP alone).

## Fields

| Field | Default | Purpose |
| --- | --- | --- |
| **Output** | `Score` | `Score` (0–100 integer), `Boolean` (true when score ≥ threshold), `Reasons` (comma-separated reason string, `clean` when none), or `Classification` (`human` / `suspect` / `bot` — `human` at 0, `bot` at/above threshold, `suspect` in between). |
| **Block threshold** | `70` | Cut-off used in boolean mode; the recommended trigger cut-off in score mode. |
| **Count verified AI crawlers as bots** | off | Off = whitelist verified crawlers to 0. On = score them above threshold. |
| **Country header override** | _(auto)_ | Header carrying a 2-letter country code. Empty = auto-detect `cf-ipcountry`, `x-vercel-ip-country`, `cloudfront-viewer-country`, `x-appengine-country`, `x-geo-country`, `x-country-code`. |
| **In-market countries / regions** | _(none)_ | 2-letter country codes (`NL`, `BE`) and/or continent codes (`EU`, `NA`, `AS`, `AF`, `SA`, `OC`). Datacenter IPs geolocating outside these get a small nudge; in-market traffic is never penalised. |
| **High-risk countries / regions** | _(none)_ | Same country/continent syntax — a score-only nudge for the listed places. |

## IP & header availability

`getRemoteAddress()` returns the socket peer, which is your CDN/proxy if one fronts the container. The variable reads the GA4 client's `ip_override` and the first `X-Forwarded-For` hop first, to recover the real client IP. CloudFront / Global Accelerator ranges are deliberately **excluded** from the datacenter set so a visitor transiting them isn't mistaken for a bot. IPv6 clients aren't range-matched in this version (they fall through to the header/UA signals).

## Permissions

- `read_request` — client IP + request headers.
- `read_event_data` — `ip_override`, `user_agent`.
- `logging` — debug logging in Preview only.

## Maintaining the IP ranges

`DATACENTER_RANGES` and `AI_CRAWLER_RANGES` in `template.tpl` are generated from the providers' official published lists. Refresh them periodically:

```bash
node build-ranges.mjs   # prints two const lines
```

Paste the output between the `// <ranges>` markers in `template.tpl`. Anthropic ClaudeBot and PerplexityBot publish no stable machine-readable range list, so they're matched by UA only (not IP-verifiable) for now.

## Author

[New North Digital](https://newnorth.nl) — analytics implementation (GTM, sGTM, GA4, Google Ads, Meta).

## License

Apache 2.0 — see [LICENSE](./LICENSE).
