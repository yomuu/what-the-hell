#!/usr/bin/env node
/* Bunker Radio: fetches security news feeds and writes content/wire.json.
   Run by .github/workflows/wire.yml every 6 hours. Keeps only each item's title, the feed's own short
   description (trimmed to about 200 characters), link, source name, date (NZ time), tags and one related lesson.
   No full articles and no images.

   Usage: node tools/fetch-wire.js            fetch live feeds
          WIRE_FIXTURES=dir node tools/fetch-wire.js   read <dir>/<source id>.xml instead (for testing)
   Exit code 0 always, unless every source fails (exit 2), so one broken feed never stops the others. */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "content", "wire.json");
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, "content", "wire-rules.json"), "utf8"));
const KEEP = 60, PER_SOURCE = 15, SUMMARY = 200, TZ = "Pacific/Auckland";
const NOW = new Date();

// Each source lists feed addresses to try in order, then pages to search for a feed link if none work.
const SOURCES = [
  {id: "bleepingcomputer", name: "BleepingComputer", feeds: ["https://www.bleepingcomputer.com/feed/"]},
  {id: "therecord", name: "The Record", feeds: ["https://therecord.media/feed/", "https://therecord.media/feed"]},
  {id: "sans-isc", name: "SANS ISC", feeds: ["https://isc.sans.edu/rssfeed.xml", "https://isc.sans.edu/rssfeed_full.xml"]},
  {id: "itnews", name: "iTnews", securityOnly: true,
   feeds: ["https://www.itnews.com.au/RSS/rss.ashx?type=Category&ID=6", "https://www.itnews.com.au/RSS/rss.ashx"],
   discover: ["https://www.itnews.com.au/tag/it-security", "https://www.itnews.com.au/news/security", "https://www.itnews.com.au/"]},
  {id: "ncsc-nz", name: "NCSC NZ", region: true,
   feeds: ["https://www.ncsc.govt.nz/alerts/rss", "https://www.ncsc.govt.nz/rss", "https://www.ncsc.govt.nz/news/rss", "https://www.ncsc.govt.nz/feed"],
   discover: ["https://www.ncsc.govt.nz/alerts/", "https://www.ncsc.govt.nz/newsroom", "https://www.ncsc.govt.nz/"]},
  {id: "acsc", name: "ACSC", region: true,
   feeds: ["https://www.cyber.gov.au/rss/alerts", "https://www.cyber.gov.au/rss/advisories"],
   discover: ["https://www.cyber.gov.au/about-us/view-all-content/alerts-and-advisories"]},
  {id: "cisa", name: "CISA", skipLink: /\/ics-(medical-)?advisories\//i, feeds: ["https://www.cisa.gov/cybersecurity-advisories/all.xml", "https://www.cisa.gov/cybersecurity-advisories/cybersecurity-advisories.xml"]}
];

const UA = "Mozilla/5.0 (compatible; BunkerRadio/1.0; personal news reader)";
async function get(url){
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
  try {
    const res = await fetch(url, {headers: {"User-Agent": UA, "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.8"}, signal: ctl.signal, redirect: "follow"});
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

// ---- Tiny RSS/Atom reader (feeds are simple enough that this beats adding a dependency) ----
const ENT = {amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", hellip: "…", mdash: ", ", ndash: "-", rsquo: "'", lsquo: "'", rdquo: "\"", ldquo: "\""};
function decode(s){
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === "#") { const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n === 0x2014 || n === 0x2013 ? ", " : String.fromCodePoint(n); }
    return ENT[e.toLowerCase()] !== undefined ? ENT[e.toLowerCase()] : m;
  });
}
const unCdata = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
function text(s){
  // Strip tags (twice, for escaped HTML inside descriptions), decode entities, tidy spaces. Dashes become commas.
  let t = decode(unCdata(s || "")).replace(/<[^>]*>/g, " ");
  t = decode(t).replace(/<[^>]*>/g, " ");
  return t.replace(/\s*[\u2014\u2013]\s*/g, ", ").replace(/\s+/g, " ").replace(/\s+([,.;:!?])/g, "$1").replace(/,\s*,/g, ",").trim();
}
function tag(block, names){
  for (const n of names){
    const m = block.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)</${n}>`, "i"));
    if (m) return m[1];
  }
  return "";
}
function atomLink(block){
  const links = [...block.matchAll(/<link\b([^>]*?)\/?>/gi)].map(m => m[1]);
  const pick = links.find(a => /rel=["']alternate["']/i.test(a)) || links.find(a => !/rel=/i.test(a)) || links[0] || "";
  const h = pick.match(/href=["']([^"']+)["']/i);
  return h ? decode(h[1]) : "";
}
function parseFeed(xml){
  const items = [];
  const blocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  const atom = !blocks.length;
  (atom ? [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map(m => m[0]) : blocks).forEach(b => {
    const title = text(tag(b, ["title"]));
    const link = (atom ? atomLink(b) : text(tag(b, ["link"]))) || text(tag(b, ["guid"]));
    // Only the feed's short description or summary; never content:encoded (the full article).
    const desc = text(tag(b, atom ? ["summary"] : ["description", "summary"]));
    const date = text(tag(b, ["pubDate", "published", "updated", "dc:date", "date"]));
    const author = text(tag(b, ["dc:creator", "author"]));
    if (title && /^https?:\/\//.test(link)) items.push({title, link, desc, date, author});
  });
  return items;
}
function discoverFeeds(html, base){
  return [...html.matchAll(/<link\b[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*>/gi)]
    .map(m => (m[0].match(/href=["']([^"']+)["']/i) || [])[1]).filter(Boolean)
    .map(h => new URL(decode(h), base).href);
}

// ---- Cleaning, filtering, tagging ----
function normLink(u){
  try {
    const x = new URL(u); x.hash = "";
    [...x.searchParams.keys()].filter(k => /^utm_|^(ref|source|mc_cid|mc_eid)$/i.test(k)).forEach(k => x.searchParams.delete(k));
    x.hostname = x.hostname.toLowerCase();
    let s = x.href; if (s.endsWith("/") && x.pathname !== "/") s = s.slice(0, -1);
    return s;
  } catch (e) { return u; }
}
function trim(s, n){
  if (s.length <= n) return s;
  const cut = s.slice(0, n), sp = cut.lastIndexOf(" ");
  return cut.slice(0, sp > n * 0.6 ? sp : n).replace(/[\s,.;:]+$/, "") + "…";
}
function nzTime(raw){
  const d = new Date(raw);
  if (isNaN(d)) return null;
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-NZ", {timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"}).formatToParts(d).map(x => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  const off = Math.round((local - Math.floor(d.getTime() / 1000) * 1000) / 60000), sign = off >= 0 ? "+" : "-", a = Math.abs(off);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}
const skip = new RegExp(RULES.skip, "i"), securityRe = new RegExp(RULES.security, "i");
// One test for new and stored items alike, so rule changes also clean up what's already on the wire.
const skipDesc = new RegExp(RULES.skipDesc, "i");
function keep(src, title, desc, link, author){
  if (skip.test(title) || skipDesc.test(desc) || skipDesc.test(author || "")) return false;
  if (src.skipLink && src.skipLink.test(link)) return false;
  if (src.securityOnly && !securityRe.test(title + " " + desc)) return false;
  return true;
}
const tagRules = RULES.tags.map(t => ({tag: t.tag, re: new RegExp(t.match, "i")}));
const relRules = RULES.related.map(r => ({re: new RegExp(r.match, "i"), to: r.to, label: r.label}));
// Tags and the related lesson are matched on the stored (trimmed) text, so every run, and the reader,
// sees the same reason for a match. Stored items are not trimmed twice.
function enrich(item, src, stored){
  const title = stored ? item.title : trim(item.title, 160);
  let summary = stored ? item.desc : trim(item.desc, SUMMARY);
  if (summary.length < 25 || summary.split(" ").length < 4) summary = "";
  const hay = title + " " + summary;
  const tags = tagRules.filter(t => t.re.test(hay)).map(t => t.tag);
  if (src.region && !tags.includes("NZ/AU")) tags.push("NZ/AU");
  const rel = relRules.find(r => r.re.test(hay));
  return {
    title, summary, link: normLink(item.link),
    // Dates in the future (a feed's clock or time zone mistake) are capped at now.
    source: src.name, date: stored ? item.date : (isNaN(new Date(item.date)) ? null : nzTime(new Date(Math.min(new Date(item.date), NOW)).toISOString())), tags,
    related: rel ? {to: rel.to, label: rel.label} : null
  };
}

async function readSource(src){
  if (process.env.WIRE_FIXTURES){
    const f = path.join(process.env.WIRE_FIXTURES, src.id + ".xml");
    if (!fs.existsSync(f)) return {status: "no fixture", items: []};
    return {status: "ok (fixture)", url: f, items: parseFeed(fs.readFileSync(f, "utf8"))};
  }
  const tried = [];
  const attempt = async url => {
    try { const items = parseFeed(await get(url)); if (items.length) return {status: "ok", url, items}; tried.push(url + ": no items"); }
    catch (e) { tried.push(url + ": " + (e.name === "AbortError" ? "timed out" : e.message)); }
    return null;
  };
  for (const u of src.feeds){ const r = await attempt(u); if (r) return r; }
  for (const page of src.discover || []){
    try {
      for (const u of discoverFeeds(await get(page), page)){ if (!src.feeds.includes(u)){ const r = await attempt(u); if (r) return {...r, status: "ok (found on " + page + ")"}; } }
      tried.push(page + ": no feed link");
    } catch (e) { tried.push(page + ": " + e.message); }
  }
  return {status: "failed", tried, items: []};
}

(async () => {
  const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {items: []};
  const fresh = [], sources = [];
  let working = 0;
  for (const src of SOURCES){
    const r = await readSource(src);
    let kept = 0, dropped = 0;
    r.items.forEach(it => {
      if (!keep(src, it.title, it.desc, it.link, it.author)) { dropped++; return; }
      const e = enrich(it, src);
      if (!e.date) { dropped++; return; }
      fresh.push(e); kept++;
    });
    if (r.status.startsWith("ok")) working++;
    sources.push({name: src.name, status: r.status, url: r.url || null, kept});
    console.log(`${src.name}: ${r.status}${r.url ? " " + r.url : ""}, ${kept} kept, ${dropped} filtered out`);
    (r.tried || []).forEach(t => console.log("   tried " + t));
  }
  if (!working){ console.log("No source worked; wire.json left unchanged."); process.exit(2); }

  // Merge with what we already had, de-duplicate by link, newest first, at most 15 per source, keep 60.
  // "seen" is when the wire first picked an item up; the app marks items NEW by it, not by publish date.
  const runAt = nzTime(NOW.toISOString());
  const stored = (old.items || []).map(it => {
    const src = SOURCES.find(x => x.name === it.source);
    if (!src || !keep(src, it.title, it.summary || "", it.link)) return null;
    const date = new Date(it.date) > NOW ? runAt : it.date;
    return {...enrich({title: it.title, desc: it.summary || "", link: it.link, date}, src, true), seen: it.seen || old.updated || runAt};
  }).filter(Boolean);
  const storedSeen = new Map(stored.map(it => [normLink(it.link), it.seen]));
  const byLink = new Map();
  [...fresh.map(it => ({...it, seen: storedSeen.get(normLink(it.link)) || runAt})), ...stored].forEach(it => { const k = normLink(it.link); if (!byLink.has(k)) byLink.set(k, it); });
  const perSource = {};
  const items = [...byLink.values()].sort((a, b) => new Date(b.date) - new Date(a.date))
    .filter(it => (perSource[it.source] = (perSource[it.source] || 0) + 1) <= PER_SOURCE).slice(0, KEEP);

  // Only write (and so only commit) when the items or the source list changed.
  const sameItems = JSON.stringify(items) === JSON.stringify(old.items || []);
  const sameSources = JSON.stringify(sources.map(s => [s.name, s.status.startsWith("ok")])) === JSON.stringify((old.sources || []).map(s => [s.name, String(s.status).startsWith("ok")]));
  if (sameItems && sameSources){ console.log("No change."); return; }
  const out = {updated: nzTime(new Date().toISOString()), note: "Headlines and short feed descriptions only, each credited to its publisher (who owns the text) with a link to the full article. Written by tools/fetch-wire.js.", sources, items};
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`Wrote ${items.length} items to content/wire.json`);
})();
