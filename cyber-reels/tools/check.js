// Checks cyber-reels.html after an edit: no em or en dashes, the inline script parses,
// and every Study day, Feed deck and Python lesson has a valid shape.
// Usage: node cyber-reels/tools/check.js   (exit code 0 = pass, 1 = problems found)
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "..", "cyber-reels.html");
const html = fs.readFileSync(file, "utf8");
const problems = [];

const em = (html.match(/—/g) || []).length, en = (html.match(/–/g) || []).length;
if (em || en) {
  html.split("\n").forEach((line, i) => { if (/[—–]/.test(line)) problems.push(`Line ${i + 1}: em or en dash: ${line.trim().slice(0, 100)}`); });
}

const open = html.indexOf("<script>"), close = html.lastIndexOf("</script>");
if (open < 0 || close < 0) problems.push("Couldn't find the inline <script> block.");
const js = html.slice(open + 8, close);
try { new Function(js); } catch (e) { problems.push(`Script syntax error: ${e.message}`); }

let data = null;
try {
  const marker = "/* ==========================================================================\n   APP";
  data = new Function(js.split(marker)[0] + ";return {DAYS, FEED_DECKS, FEED_EXTRA_Q, PY_LESSONS};")();
} catch (e) { problems.push(`Couldn't load the content arrays: ${e.message}`); }

const checkQ = (q, where) => {
  if (!q || typeof q.q !== "string") return problems.push(`${where}: question text missing`);
  if (!Array.isArray(q.o) || q.o.length < 2) problems.push(`${where}: needs at least 2 options`);
  else if (!(Number.isInteger(q.k) && q.k >= 0 && q.k < q.o.length)) problems.push(`${where}: k must point at one of the options`);
  if (!q.w) problems.push(`${where}: explanation (w) missing`);
};

if (data) {
  const KINDS = ["owasp", "incident", "e8", "cloud", "law", "triage", "interview", "kql", "quick"];
  data.DAYS.forEach((d, i) => {
    if (!d.t || !Array.isArray(d.learn) || !Array.isArray(d.quiz) || !Array.isArray(d.recap)) problems.push(`Day ${i + 1}: missing t, learn, quiz or recap`);
    (d.quiz || []).forEach((q, j) => checkQ(q, `Day ${i + 1} quiz ${j + 1}`));
  });
  data.PY_LESSONS.forEach((d, i) => (d.quiz || []).forEach((q, j) => checkQ(q, `Python lesson ${i + 1} quiz ${j + 1}`)));
  const ids = new Set();
  data.FEED_DECKS.forEach((d, i) => {
    const where = `Feed deck ${d.id || "#" + (i + 1)}`;
    if (!d.id) problems.push(`${where}: id missing`);
    else if (ids.has(d.id)) problems.push(`${where}: duplicate id`);
    ids.add(d.id);
    if (!KINDS.includes(d.kind)) problems.push(`${where}: unknown kind "${d.kind}" (use one of ${KINDS.join(", ")})`);
    if (!d.title) problems.push(`${where}: title missing`);
    if (d.added && !/^\d{4}-\d{2}-\d{2}$/.test(d.added)) problems.push(`${where}: added must be YYYY-MM-DD`);
    if (d.kind === "interview") { if (!d.answer) problems.push(`${where}: interview deck needs answer`); return; }
    if (!Array.isArray(d.cards) || !d.cards.length) problems.push(`${where}: needs at least one card`);
    else d.cards.forEach((c, j) => { if (!Array.isArray(c) || c.length < 2 || !c[0] || !c[1]) problems.push(`${where} card ${j + 1}: needs [heading, text]`); });
    if (d.kind !== "quick" && !d.q && !d.qs) problems.push(`${where}: needs a check question (q)`);
    if (d.q) checkQ(d.q, `${where} check`);
    (d.qs || []).forEach((q, j) => checkQ(q, `${where} check ${j + 1}`));
  });
  Object.entries(data.FEED_EXTRA_Q || {}).forEach(([id, list]) => {
    if (!ids.has(id)) problems.push(`Extra questions for unknown deck "${id}"`);
    list.forEach((q, j) => checkQ(q, `Extra question ${id} ${j + 1}`));
  });
  if (!problems.length) console.log(`OK: ${data.DAYS.length} days, ${data.FEED_DECKS.length} Feed decks, ${data.PY_LESSONS.length} Python lessons, no dashes, script parses.`);
}

if (problems.length) {
  console.log(`${problems.length} problem${problems.length === 1 ? "" : "s"} found:`);
  problems.forEach(p => console.log("- " + p));
  process.exit(1);
}
