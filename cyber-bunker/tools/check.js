// Checks the app after any change. Run from anywhere: node tools/check.js
// - every content file is valid JSON with the right shape (days, decks, lessons, questions)
// - no em or en dashes in content, page or scripts
// - index.html's inline script, app.js and sw.js all parse
// - sw.js VERSION matches content/version.json (run tools/bump-version.js after content changes)
// Exit code 0 = pass, 1 = problems found.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");
const problems = [];

// Dashes, anywhere a reader could see them.
for (const f of ["index.html", "app.js", "sw.js", "content/study.json", "content/feed.json", "content/python.json", "content/version.json"]) {
  let text; try { text = read(f); } catch (e) { problems.push(`${f}: missing`); continue; }
  text.split("\n").forEach((line, i) => { if (/[\u2014\u2013]/.test(line)) problems.push(`${f} line ${i + 1}: em or en dash: ${line.trim().slice(0, 100)}`); });
}

// Scripts parse.
try {
  const html = read("index.html");
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].forEach((m, i) => { try { new Function(m[1]); } catch (e) { problems.push(`index.html inline script ${i + 1}: ${e.message}`); } });
} catch (e) {}
for (const f of ["app.js", "sw.js"]) { try { new Function(read(f)); } catch (e) { problems.push(`${f}: syntax error: ${e.message}`); } }

// Content JSON.
const json = f => { try { return JSON.parse(read(f)); } catch (e) { problems.push(`${f}: invalid JSON: ${e.message}`); return null; } };
const study = json("content/study.json"), feed = json("content/feed.json"), py = json("content/python.json"), ver = json("content/version.json");

const checkQ = (q, where) => {
  if (!q || typeof q.q !== "string") return problems.push(`${where}: question text missing`);
  if (!Array.isArray(q.o) || q.o.length < 2) problems.push(`${where}: needs at least 2 options`);
  else if (!(Number.isInteger(q.k) && q.k >= 0 && q.k < q.o.length)) problems.push(`${where}: k must point at one of the options`);
  if (!q.w) problems.push(`${where}: explanation (w) missing`);
};
if (study) {
  if (!Array.isArray(study.weeks) || !Array.isArray(study.days)) problems.push("study.json: needs weeks and days");
  else study.days.forEach((d, i) => {
    if (!d.t || !Array.isArray(d.learn) || !Array.isArray(d.quiz) || !Array.isArray(d.recap)) problems.push(`Day ${i + 1}: missing t, learn, quiz or recap`);
    (d.quiz || []).forEach((q, j) => checkQ(q, `Day ${i + 1} quiz ${j + 1}`));
  });
}
// Shapes the app relies on at start-up: a day or lesson outside its week or level stops the app loading.
if (study && Array.isArray(study.weeks) && Array.isArray(study.days) && study.days.length > study.weeks.length * 7)
  problems.push(`study.json: ${study.days.length} days but only ${study.weeks.length} weeks (7 days each). Add a week to "weeks".`);
if (py) {
  if (!Array.isArray(py.levels) || !Array.isArray(py.lessons)) problems.push("python.json: needs levels and lessons");
  else py.lessons.forEach((d, i) => {
    if (!d.t || !Array.isArray(d.learn) || !Array.isArray(d.quiz) || !Array.isArray(d.recap)) problems.push(`Python lesson ${i + 1}: missing t, learn, quiz or recap`);
    if (!py.levels.some(l => i >= l.from && i < l.to)) problems.push(`Python lesson ${i + 1}: not inside any level's from/to range`);
    const ch = d.challenge;
    if (!ch || !ch.p || !ch.hint || !ch.solution) problems.push(`Python lesson ${i + 1}: challenge needs p, hint and solution`);
    else if (!ch.think && (typeof ch.start !== "string" || typeof ch.expect !== "string")) problems.push(`Python lesson ${i + 1}: challenge needs start and expect (or think: true)`);
    if (d.play && typeof d.play.code !== "string") problems.push(`Python lesson ${i + 1}: play needs code`);
    (d.quiz || []).forEach((q, j) => checkQ(q, `Python lesson ${i + 1} quiz ${j + 1}`));
  });
}
const ids = new Set();
if (feed) {
  const KINDS = ["owasp", "incident", "e8", "cloud", "law", "triage", "interview", "kql", "spl", "quick"];
  (feed.decks || []).forEach((d, i) => {
    const where = `Feed deck ${d.id || "#" + (i + 1)}`;
    if (!d.id) problems.push(`${where}: id missing`);
    else if (ids.has(d.id)) problems.push(`${where}: duplicate id`);
    ids.add(d.id);
    if (!KINDS.includes(d.kind)) problems.push(`${where}: unknown kind "${d.kind}" (use one of ${KINDS.join(", ")})`);
    if (!d.title) problems.push(`${where}: title missing`);
    if (d.added && !/^\d{4}-\d{2}-\d{2}$/.test(d.added)) problems.push(`${where}: added must be YYYY-MM-DD`);
    if (d.kind === "interview") { if (!d.answer) problems.push(`${where}: interview deck needs answer`); return; }
    if (d.kind === "incident") {
      if (!/^\d{4}-\d{2}$/.test(d.date || "")) problems.push(`${where}: date must be YYYY-MM`);
      if (!["breached", "verified", "developing"].includes(d.status)) problems.push(`${where}: status must be breached, verified or developing`);
      ["entry", "impact", "lesson", "source"].forEach(k => { if (!d[k]) problems.push(`${where}: ${k} missing (incident record card)`); });
    }
    if (d.region && !["NZ", "AU", "NZ/AU"].includes(d.region)) problems.push(`${where}: region must be NZ, AU or NZ/AU`);
    if (!Array.isArray(d.cards) || !d.cards.length) problems.push(`${where}: needs at least one card`);
    else d.cards.forEach((c, j) => { if (!Array.isArray(c) || c.length < 2 || !c[0] || !c[1]) problems.push(`${where} card ${j + 1}: needs [heading, text]`); });
    if (d.kind !== "quick" && !d.q && !d.qs) problems.push(`${where}: needs a check question (q)`);
    if (d.q) checkQ(d.q, `${where} check`);
    (d.qs || []).forEach((q, j) => checkQ(q, `${where} check ${j + 1}`));
  });
  Object.entries(feed.extraQuestions || {}).forEach(([id, list]) => {
    if (!ids.has(id)) problems.push(`Extra questions for unknown deck "${id}"`);
    list.forEach((q, j) => checkQ(q, `Extra question ${id} ${j + 1}`));
  });
}

// Bunker Radio: rules must compile and point at real lessons; wire.json (if present) must be well formed.
try {
  const rules = JSON.parse(read("content/wire-rules.json"));
  new RegExp(rules.skip, "i");
  rules.tags.forEach(t => new RegExp(t.match, "i"));
  rules.related.forEach((r, i) => {
    new RegExp(r.match, "i");
    const [kind, id] = String(r.to).split(":");
    const ok = kind === "study" ? study && study.days[+id - 1] : kind === "py" ? py && py.lessons[+id - 1] : kind === "deck" ? ids.has(id) : false;
    if (!ok) problems.push(`wire-rules.json related ${i + 1}: "${r.to}" doesn't match a day, lesson or deck`);
  });
} catch (e) { problems.push(`content/wire-rules.json: ${e.message}`); }
if (fs.existsSync(path.join(root, "content/wire.json"))) {
  const w = json("content/wire.json");
  if (w && !Array.isArray(w.items)) problems.push("wire.json: items missing");
  (w && w.items || []).forEach((it, i) => { if (!it.title || !/^https?:\/\//.test(it.link || "") || !it.source || !it.date) problems.push(`wire.json item ${i + 1}: needs title, link, source and date`); });
}

// Certification readiness: every exam has its source details, and every mapping points at real content.
try {
  const certs = JSON.parse(read("content/certs.json"));
  if (!Array.isArray(certs.exams) || !certs.exams.length) problems.push("certs.json: exams must be a non-empty list");
  const KIND_SET = new Set((feed && feed.decks || []).map(d => d.kind));
  (certs.exams || []).forEach(e => {
    ["id", "name", "code", "status", "verified", "source", "checked", "url"].forEach(k => { if (!e[k]) problems.push(`certs.json ${e.code || e.id}: ${k} missing`); });
    if (!/^[a-z0-9]+$/.test(e.id || "")) problems.push(`certs.json ${e.code}: id must be lower-case letters and digits`);
    if (!Array.isArray(e.domains) || !e.domains.length) problems.push(`certs.json ${e.code}: domains must be a non-empty list`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.checked || "")) problems.push(`certs.json ${e.code}: checked must be YYYY-MM-DD`);
    if (!/^https:\/\//.test(e.url || "")) problems.push(`certs.json ${e.code}: url must be https`);
    (e.domains || []).forEach(d => {
      if (!d.name || !d.weight) problems.push(`certs.json ${e.code}: a domain needs name and weight`);
      (d.s || []).forEach(n => { if (!study || !study.days[n - 1]) problems.push(`certs.json ${e.code} ${d.name}: no Training day ${n}`); });
      (d.p || []).forEach(n => { if (!py || !py.lessons[n - 1]) problems.push(`certs.json ${e.code} ${d.name}: no Terminal lesson ${n}`); });
      (d.decks || []).forEach(id => { if (!ids.has(id)) problems.push(`certs.json ${e.code} ${d.name}: no deck ${id}`); });
      (d.kinds || []).forEach(k => { if (!KIND_SET.has(k)) problems.push(`certs.json ${e.code} ${d.name}: no decks of kind ${k}`); });
    });
  });
} catch (e) { problems.push(`content/certs.json: ${e.message}`); }

// Versions agree.
try {
  const m = read("sw.js").match(/const VERSION = (\d+);/);
  if (!m) problems.push("sw.js: const VERSION not found");
  else if (ver && Number(m[1]) !== Number(ver.version)) problems.push(`Version mismatch: sw.js has ${m[1]}, content/version.json has ${ver.version}. Run: node tools/bump-version.js`);
} catch (e) {}

// The service worker caches the same Pyodide version the app loads.
try {
  const a = read("app.js").match(/PYODIDE_VERSION = "([\d.]+)"/), s = read("sw.js").match(/PYODIDE_VERSION = "([\d.]+)"/);
  if (!a || !s || a[1] !== s[1]) problems.push(`Pyodide version differs: app.js ${a && a[1]}, sw.js ${s && s[1]}`);
} catch (e) {}

if (problems.length) {
  console.log(`${problems.length} problem${problems.length === 1 ? "" : "s"} found:`);
  problems.forEach(p => console.log("- " + p));
  process.exit(1);
}
console.log(`OK: ${study.days.length} days, ${feed.decks.length} Feed decks, ${py.lessons.length} Python lessons, content version ${ver.version}, no dashes, scripts parse.`);
