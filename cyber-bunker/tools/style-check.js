#!/usr/bin/env node
/* Measurable checks from content/STYLE.md. Usage:
     node tools/style-check.js                 all content
     node tools/style-check.js study 2-7       Training Bunker days 2 to 7
     node tools/style-check.js python 1-12     Terminal lessons 1 to 12
     node tools/style-check.js feed owasp      Archive decks of one kind (or a deck id)
   Prints problems and the average sentence length. Exit code 1 if there are problems. */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const J = f => JSON.parse(fs.readFileSync(path.join(root, "content", f), "utf8"));
const [what = "all", sel = ""] = process.argv.slice(2);
const items = [];
const range = s => { const m = /^(\d+)(?:-(\d+))?$/.exec(s); return m ? [+m[1], +(m[2] || m[1])] : null; };
if (what === "all" || what === "study"){ const r = range(sel); J("study.json").days.forEach((d, i) => { if (!r || (i + 1 >= r[0] && i + 1 <= r[1])) items.push(["Day " + (i + 1), d]); }); }
if (what === "all" || what === "python"){ const r = range(sel); J("python.json").lessons.forEach((d, i) => { if (!r || (i + 1 >= r[0] && i + 1 <= r[1])) items.push(["Lesson " + (i + 1), d]); }); }
if (what === "all" || what === "feed"){ const f = J("feed.json"); f.decks.forEach(d => { if (!sel || d.kind === sel || d.id === sel || sel.split(",").includes(d.id)) items.push([d.id, d, f.extraQuestions && f.extraQuestions[d.id]]); }); }
const SKIP = new Set(["code", "id", "kind", "tag", "date", "status", "region", "attack", "maps", "added", "source", "d", "k", "run", "expect", "start", "solution", "after", "all", "a"]);
const problems = [], lens = [];
const strip = t => String(t).replace(/`[^`]*`/g, "x").replace(/\*\*/g, "");
const sentences = t => strip(t).split(/(?<=[.!?])\s+|\n/).map(x => x.trim()).filter(x => x.split(/\s+/).length >= 3);
const words = t => strip(t).split(/\s+/).filter(Boolean).length;
function walk(name, o, where){
  if (typeof o === "string"){
    if (/[—–]/.test(o)) problems.push(`${name} ${where}: em or en dash`);
    if (/\*\*/.test(o)) problems.push(`${name} ${where}: asterisks (no bold)`);
    sentences(o).forEach(s => { const n = s.split(/\s+/).length; lens.push(n); if (n > 25) problems.push(`${name} ${where}: ${n}-word sentence: "${s.slice(0, 90)}..."`); });
    return;
  }
  if (Array.isArray(o)) return o.forEach((x, i) => walk(name, x, where + "[" + i + "]"));
  if (o && typeof o === "object") Object.entries(o).forEach(([k, v]) => { if (!SKIP.has(k)) walk(name, v, where + "." + k); });
}
function checkQ(name, q, where){
  if (!q || !Array.isArray(q.o)) return;
  if (/all of the above/i.test(q.o.join(" "))) problems.push(`${name} ${where}: "All of the above"`);
  if (/\b(not|except)\b/.test(q.q) && !/\b(NOT|EXCEPT)\b/.test(q.q) && /\bwhich\b.*\b(not|except)\b/i.test(q.q)) problems.push(`${name} ${where}: lower-case NOT/EXCEPT in question`);
  const L = q.o.map(o => strip(o).length), right = L[q.k], others = L.filter((_, i) => i !== q.k);
  if (others.length && right > Math.max(...others) * 1.25 && right - Math.max(...others) > 8) problems.push(`${name} ${where}: correct option is clearly the longest`);
  if (q.w && words(q.w) > 50) problems.push(`${name} ${where}: explanation is ${words(q.w)} words (aim for about 45)`);
}
items.forEach(([name, d, extra]) => {
  walk(name, d, "");
  (d.learn || []).forEach((c, i) => { if (c[0] !== "Key terms" && words(c[1]) > 60) problems.push(`${name} learn[${i}] "${c[0]}": ${words(c[1])} words (max 60)`); });
  (d.cards || []).forEach((c, i) => { if (c[0] !== "Key terms" && words(c[1]) > 60) problems.push(`${name} card[${i}] "${c[0]}": ${words(c[1])} words (max 60)`); });
  (d.quiz || []).forEach((q, i) => checkQ(name, q, `quiz[${i}]`));
  if (d.q) checkQ(name, d.q, "q");
  (d.qs || []).forEach((q, i) => checkQ(name, q, `qs[${i}]`));
  (extra || []).forEach((q, i) => checkQ(name, q, `extra[${i}]`));
});
const avg = lens.length ? (lens.reduce((a, b) => a + b, 0) / lens.length).toFixed(1) : "0";
console.log(`${items.length} item(s), ${lens.length} sentences, average ${avg} words, longest ${Math.max(0, ...lens)}.`);
problems.forEach(p => console.log("  " + p));
console.log(problems.length ? `${problems.length} problem(s).` : "No style problems.");
process.exit(problems.length ? 1 : 0);
