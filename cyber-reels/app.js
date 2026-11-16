/* Cyber Scroll app engine. index.html loads the content JSON into globals, then this file. */
document.getElementById("v-study").innerHTML = "";
document.body.classList.remove("booting");
/* ==========================================================================
   APP
   ========================================================================== */
const initialHash = location.hash; // read before any tab renders and rewrites it
// Load the fonts without blocking the first paint; system fonts show until they arrive (or if offline).
(() => { const l = document.createElement("link"); l.rel = "stylesheet"; l.crossOrigin = "anonymous";
  l.href = "https://fonts.googleapis.com/css2?family=Archivo:wght@600;800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500&display=swap";
  document.head.appendChild(l); })();
const store = {
  ok: (() => { try { localStorage.setItem("cr2-test", "1"); localStorage.removeItem("cr2-test"); return true; } catch(e){ return false; } })(),
  get(k, d){ try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} },
  del(k){ try { localStorage.removeItem(k); } catch(e){} }
};
const asObj = v => (v && typeof v === "object" && !Array.isArray(v)) ? v : {};

/* ---------- Spaced repetition and the daily streak ----------
   Every answered question gets a Leitner box. Right moves it up a box (back in 3, 7, 16, then 35 days);
   wrong drops it to box 1 (back tomorrow). Due questions come back as Review decks in the Feed.
   Answering DAILY_GOAL questions in a day, in any tab, keeps the streak going. */
const DAILY_GOAL = 5;
const INTERVALS = [1, 3, 7, 16, 35];
const DECK_COLOUR = {owasp:"var(--t-feed)", incident:"var(--w4)", review:"var(--w3)", e8:"var(--k-e8)", cloud:"var(--k-cloud)", law:"var(--k-law)", triage:"var(--k-triage)", interview:"var(--k-int)", kql:"var(--k-kql)", quick:"var(--k-quick)"};
// Each deck gets a list of checks: its main one plus any extras. Interview decks have none.
FEED_DECKS.forEach(d => { if (d.kind !== "interview") d.qs = (d.qs || (d.q ? [d.q] : [])).concat(FEED_EXTRA_Q[d.id] || []); });
// Decks added by the weekly content run carry added:"YYYY-MM-DD" and count as new for seven days.
const isNew = d => !!d.added && dayNum() - dayNum(new Date(d.added + "T00:00:00")) < 7;
const checkKey = (d, n) => n ? `f:${d.id}#${n}` : `f:${d.id}`;
function deckBadge(d){ return {owasp:"OWASP " + d.tag, incident:"Incident " + d.tag + (d.region ? " · " + d.region : ""), quick:"Quick-fire", e8:"Essential Eight", cloud:"Cloud", law:"Law " + d.tag, triage:"Triage", interview:"Interview", kql:"KQL"}[d.kind] || d.tag; }
function deckName(d){ return d.kind === "owasp" ? d.tag + " " + d.title : d.kind === "incident" ? d.title + " " + d.tag : d.kind === "interview" ? "Interview practice" : d.title; }
function dayNum(d){ d = d || new Date(); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
const srs = asObj(store.get("cr2-srs", {}));
const saveSrs = () => store.set("cr2-srs", srs);
const daily = (() => { const s = asObj(store.get("cr2-daily", {})); return {day:+s.day || 0, qs:+s.qs || 0, keys:Array.isArray(s.keys) ? s.keys : [], streak:+s.streak || 0, best:+s.best || 0, lastDone:+s.lastDone || 0}; })();
const saveDaily = () => store.set("cr2-daily", daily);
function today(){ const t = dayNum(); if (daily.day !== t){ daily.day = t; daily.qs = 0; daily.keys = []; } return daily; }
function currentStreak(){ return daily.lastDone >= dayNum() - 1 ? daily.streak : 0; }
function srsItem(key){
  const pre = key.slice(0, 2), rest = key.slice(2);
  if (pre === "f:"){
    const [id, n] = rest.split("#"), d = FEED_DECKS.find(x => x.id === id), q = d && d.qs && d.qs[+n || 0];
    if (!q) return null;
    // Triage questions only make sense next to their evidence, so review shows the log with them.
    const withEvidence = d.kind === "triage" && !q.code && d.cards[0] && d.cards[0][2] ? Object.assign({}, q, {code:d.cards[0][2]}) : q;
    return {q:withEvidence, src:d.kind === "owasp" ? "OWASP " + d.tag : d.title, deck:d};
  }
  if (pre === "i:"){ const d = FEED_DECKS.find(x => x.id === rest && x.kind === "interview"); return d ? {interview:d, src:"Interview"} : null; }
  const [dn, qi] = rest.split(".").map(Number);
  const list = pre === "s:" ? DAYS : pre === "p:" ? PY_LESSONS : null;
  const q = list && list[dn-1] && list[dn-1].quiz[qi];
  return q ? {q, src:(pre === "s:" ? "Day " : "Lesson ") + dn, tab:pre === "s:" ? "study" : "py", dn} : null;
}
function dueKeys(){
  const t = dayNum();
  // Surprises (confidently wrong) first, then the most overdue, then the weakest.
  return Object.keys(srs).filter(k => srs[k].due <= t && srsItem(k))
    .sort((a, b) => (srs[b].flag ? 1 : 0) - (srs[a].flag ? 1 : 0) || srs[a].due - srs[b].due || srs[a].box - srs[b].box);
}
// Missed on three different days and still not mastered.
const isSlipping = e => !!e && (e.lapses || 0) >= 3 && e.box <= 2;
function srsRecord(key, correct, sure){
  if (sure === undefined) sure = true;
  const t = dayNum(), e = srs[key] || {box:1, due:t, last:0, n:0};
  if (!correct){
    // A miss drops to box 1. Being sure and wrong is a "surprise": those come back first.
    if (e.last !== t) e.lapses = (e.lapses || 0) + 1;
    e.box = 1;
    if (sure) e.flag = "surprise"; else delete e.flag;
  } else if (sure){
    // At most one step up per day, so retrying a question straight away can't fast-track it.
    if (e.last !== t) e.box = Math.min(5, e.box + 1);
    delete e.flag;
  }
  // A lucky guess keeps its box and comes back tomorrow.
  e.due = t + (correct && !sure ? 1 : INTERVALS[e.box - 1]); e.last = t; e.n = (e.n || 0) + 1;
  srs[key] = e; saveSrs();
  if (!srsRecord.asked && navigator.storage && navigator.storage.persist){ srsRecord.asked = true; navigator.storage.persist().catch(() => {}); }
  // Each question counts once a day towards the goal, so retrying one can't fill it.
  const d = today();
  if (d.keys.includes(key)){ saveDaily(); refreshDaily(); return; }
  d.keys.push(key); d.qs++;
  if (d.qs === DAILY_GOAL){
    daily.streak = daily.lastDone === t - 1 ? daily.streak + 1 : daily.lastDone === t ? daily.streak : 1;
    daily.lastDone = t; daily.best = Math.max(daily.best, daily.streak);
    toast(`Daily goal done · ${daily.streak}-day streak`);
  }
  saveDaily(); refreshDaily();
}
// Questions answered before this feature existed: wrong ones are due now, right ones in 3 days.
if (!store.get("cr2-srs-seeded", false)){
  const t = dayNum();
  [["s:", "cr2-answers"], ["p:", "cr2-py-answers"]].forEach(([pre, key]) => {
    Object.entries(asObj(store.get(key, {}))).forEach(([k, pick]) => {
      const it = srsItem(pre + k);
      if (!it || srs[pre + k] || !Number.isInteger(pick)) return;
      srs[pre + k] = it.q.k === pick ? {box:2, due:t + 3, last:0, n:1} : {box:1, due:t, last:0, n:1};
    });
  });
  saveSrs(); store.set("cr2-srs-seeded", true);
}

const LEVEL = {1:"Easy", 2:"Medium", 3:"Hard"};
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
function el(tag, cls, html){ const e = document.createElement(tag); if(cls) e.className = cls; if(html !== undefined) e.innerHTML = html; return e; }
function esc(s){ return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmt(s){ return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>"); }
function codeHtml(src){ return src.split("\n").map(l => `<span style="--i:${l.match(/^ */)[0].length}"${/^\s*#/.test(l) ? ' class="c"' : ""}>${esc(l)}</span>`).join(""); }
function codeBlock(src, where, copy){
  return `<div class="code">${copy || where ? `<div class="ch"><span class="where">${esc(where || "")}</span>${copy ? `<button class="cp" type="button">Copy</button>` : ""}</div>` : ""}<pre><code>${codeHtml(src)}</code></pre></div>`;
}
function wireCopy(scope, text){
  const cp = scope.querySelector(".cp");
  if (!cp) return;
  let timer = null;
  const show = (label, said) => { clearTimeout(timer); cp.textContent = label; live.textContent = said; timer = setTimeout(() => cp.textContent = "Copy", 1600); };
  cp.addEventListener("click", () => {
    const pre = cp.closest(".code").querySelector("pre");
    const fallback = () => {
      // Clipboard blocked: select the code so a long-press can copy it.
      try { const r = document.createRange(); r.selectNodeContents(pre); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } catch(e){}
      show("Selected", "Code selected. Long-press to copy.");
    };
    try { navigator.clipboard.writeText(text).then(() => show("Copied", "Code copied"), fallback); }
    catch(e){ fallback(); }
  });
}
// Two taps to confirm, inside the page (some hosts block confirm() dialogs).
function twoTap(btn, armedText, action){
  const label = btn.textContent; let armed = null;
  btn.addEventListener("click", () => {
    if (!armed){ btn.textContent = armedText; armed = setTimeout(() => { armed = null; btn.textContent = label; }, 4000); return; }
    clearTimeout(armed); armed = null; action();
    btn.textContent = "Done"; setTimeout(() => btn.textContent = label, 1800);
  });
}

// Stable option shuffle per question, so the right answer isn't always in the same spot.
function seedOf(s){ let h = 2166136261; for (let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function order(n, seed){
  const a = [...Array(n).keys()]; let x = seed || 1;
  for (let i = n - 1; i > 0; i--){ x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; const j = x % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------- Tabs and their feeds ---------- */
const TABS = {
  study:{el:document.getElementById("v-study"), cards:[], current:0, accent:"var(--t-study)"},
  feed: {el:document.getElementById("v-feed"),  cards:[], current:0, accent:"var(--t-feed)"},
  py:   {el:document.getElementById("v-py"),    cards:[], current:0, accent:"var(--t-py)"}
};
let active = "study";

window.addCard = addCard;
function addCard(tab, {c, id, label, group, html, extra, at}){
  const T = TABS[tab];
  const s = el("section","card");
  s.style.setProperty("--c", c);
  if (id) s.id = id;
  s.innerHTML = `<div class="in">${html}</div>`;
  const card = Object.assign({el:s, label, group, tab}, extra || {});
  if (at !== undefined && at < T.cards.length){
    T.el.insertBefore(s, T.cards[at].el); T.cards.splice(at, 0, card);
    if (at <= T.current) T.current++;
  } else { T.el.appendChild(s); T.cards.push(card); }
  s.addEventListener("scroll", () => { if (tab === active && T.cards[T.current] === card) updateMore(); }, {passive:true});
  if (T.io) T.io.observe(s);
  return s;
}

/* A quiz card. persist: {obj, key, save} to remember the answer, or null for the feed. */
function typedAnswers(q){
  // Exact short answers (numbers, addresses, acronyms) can be typed from memory. A question can also list its own in `a`.
  if (q.a) return q.a.map(normAns);
  const right = q.o[q.k];
  return /^[0-9./:\- ]{1,16}$/.test(right) || /^[A-Z0-9]{2,6}$/.test(right) ? [normAns(right)] : null;
}
function normAns(x){ return String(x).toLowerCase().replace(/[\s`'"]/g, ""); }
function buildQuiz(card, q, persist, onChange){
  const btns = [...card.querySelectorAll(".opt")], why = card.querySelector(".why"), retry = card.querySelector(".retry");
  const confBtns = [...card.querySelectorAll(".conf button")], opts = card.querySelector(".opts");
  let forcedGuess = false;
  const sure = () => !forcedGuess && confBtns.length ? confBtns[0].getAttribute("aria-pressed") === "true" : !forcedGuess;
  const setSure = v => confBtns.forEach((b, i) => b.setAttribute("aria-pressed", (i === 0) === v ? "true" : "false"));
  confBtns.forEach((b, i) => b.addEventListener("click", () => setSure(i === 0)));
  // Recall first: options stay hidden until you've tried to answer from memory.
  const recall = card.querySelector(".recall");
  const showOpts = () => { if (recall) recall.hidden = true; opts.hidden = false; card.querySelector(".conf").hidden = false; };
  if (recall){
    const input = recall.querySelector("input"), msg = recall.querySelector(".recallMsg"), answers = typedAnswers(q);
    recall.querySelector(".showOpts").addEventListener("click", () => { showOpts(); btns[0].focus({preventScroll:true}); });
    const check = recall.querySelector(".checkTyped");
    if (check) {
      const run = () => {
        if (!input.value.trim()){ msg.textContent = "Type an answer, or tap Show options."; return; }
        if (answers.includes(normAns(input.value))){ showOpts(); setSure(true); btns.find(b => +b.dataset.j === q.k).click(); }
        else { forcedGuess = true; showOpts(); setSure(false); confBtns.forEach(x => x.disabled = true); msg.textContent = ""; why.innerHTML = "<strong>Not quite.</strong> Pick from the options. This one will count as a guess."; why.classList.add("show"); }
      };
      check.addEventListener("click", run);
      input.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); run(); } });
    }
  }
  const reveal = (pick, fromUser) => {
    btns.forEach(b => {
      const j = +b.dataset.j, mk = b.querySelector(".mk"), st = b.querySelector(".st");
      b.setAttribute("aria-disabled", "true");
      if (j === q.k){ b.classList.add("right"); mk.textContent = "✓"; st.textContent = j === pick ? " (your answer, correct)" : " (correct answer)"; }
      else if (j === pick){ b.classList.add("wrong"); mk.textContent = "✗"; st.textContent = " (your answer)"; }
    });
    why.innerHTML = `<strong>${pick === q.k ? "Correct." : "Not quite."}</strong> ${fmt(q.w)}`;
    why.classList.add("show");
    if (retry) retry.classList.add("show");
    if (fromUser){ why.focus({preventScroll:true}); why.scrollIntoView({block:"nearest", behavior: reduceMotion() ? "auto" : "smooth"}); }
  };
  const clear = () => {
    btns.forEach(b => { b.removeAttribute("aria-disabled"); b.classList.remove("right","wrong"); b.querySelector(".mk").textContent = ""; b.querySelector(".st").textContent = ""; });
    why.classList.remove("show"); why.innerHTML = ""; if (retry) retry.classList.remove("show");
  };
  btns.forEach(b => b.addEventListener("click", () => {
    if (b.getAttribute("aria-disabled") === "true") return;
    const pick = +b.dataset.j;
    if (persist){ persist.obj[persist.key] = pick; persist.save(); }
    reveal(pick, true);
    confBtns.forEach(x => x.disabled = true);
    onChange(pick, sure());
  }));
  if (retry) retry.addEventListener("click", () => {
    if (persist){ delete persist.obj[persist.key]; persist.save(); }
    clear(); confBtns.forEach(x => x.disabled = false); setSure(true); onChange(null);
    btns[0].focus({preventScroll:true});
    card.scrollTo({top:0, behavior: reduceMotion() ? "auto" : "smooth"});
  });
  // A saved answer doesn't record how sure you were, so neither button shows as chosen.
  if (persist && Number.isInteger(persist.obj[persist.key])){ reveal(persist.obj[persist.key], false); confBtns.forEach(x => { x.disabled = true; x.setAttribute("aria-pressed", "false"); }); }
  return () => { clear(); confBtns.forEach(x => x.disabled = false); setSure(true); };
}
function quizHtml(q, tagHtml, withRetry, seed, recall){
  const ord = order(q.o.length, seed || seedOf(q.q + (q.code || "")));
  const typed = recall && typedAnswers(q);
  return `${tagHtml}
    ${q.d ? `<div class="lvl">${LEVEL[q.d]}</div>` : ""}
    <h2 class="q">${fmt(q.q)}</h2>
    ${q.code ? codeBlock(q.code, "", false) : ""}
    ${recall ? `<div class="recall">
      <p class="small">${typed ? "Type the answer from memory, or think it through first." : "Think of the answer before you look at the options."}</p>
      ${typed ? `<input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="done"${typed.every(a => /^[0-9.]+$/.test(a)) ? ' inputmode="decimal"' : ""} aria-label="Your answer"><div class="row"><button class="btn checkTyped" type="button">Check</button><button class="btn ghost showOpts" type="button">Show options</button></div>` : `<button class="btn ghost showOpts" type="button">Show options</button>`}
      <p class="small recallMsg" aria-live="polite"></p></div>` : ""}
    <div class="conf" role="group" aria-label="How sure are you?"${recall ? " hidden" : ""}>How sure? <button type="button" aria-pressed="true">Sure</button><button type="button" aria-pressed="false">Guessing</button></div>
    <div class="opts${q.code ? " out" : ""}" role="group" aria-label="Answers"${recall ? " hidden" : ""}>${ord.map(j=>`<button class="opt" data-j="${j}"><span class="mk" aria-hidden="true"></span><span>${fmt(q.o[j])}<span class="sr st"></span></span></button>`).join("")}</div>
    <div class="why" tabindex="-1"></div>
    ${withRetry ? `<button class="btn ghost retry" type="button">Try again</button>` : ""}`;
}

/* ---------- Study and Python tracks (same card engine) ---------- */
function makeTrack(tab, items, cfg){
  const answers = asObj(store.get(cfg.answersKey, {}));
  const save = () => store.set(cfg.answersKey, answers);
  const T = TABS[tab];
  Object.assign(T, {items, cfg, answers, recapScores:{}, resetters:{}});
  T.cardCount = d => 2 + d.learn.length + (d.real ? 1 : 0) + (d.myth ? 1 : 0) + (d.tryit ? 1 : 0) + (d.review ? d.review.length : 0) + d.quiz.length;

  items.forEach((d, i) => {
    const g = cfg.groupOf(i), dn = i + 1, c = g.c;
    let n = 0;
    const make = (label, html) => { const id = cfg.id(dn, n); n++; return addCard(tab, {c, id, label, group:i, html}); };
    const tag = (kind, extra) => `<div class="tag"><span>${kind}</span>${cfg.word} ${dn}${extra ? " · " + extra : ""}</div>`;

    make("Topic", `<div class="tag"><span>${cfg.word} ${dn}</span>${esc(g.label)}</div><h1>${fmt(d.t)}</h1>
      ${d.sub ? `<p>${fmt(d.sub)}</p>` : ""}
      <div class="hint">${T.cardCount(d)} cards · ${d.quiz.length} questions · swipe up ↑</div>`);

    d.learn.forEach(([h, p, code], j) => {
      const s = make("Learn " + (j+1) + "/" + d.learn.length,
        `${tag("Learn", (j+1) + " of " + d.learn.length)}<h2>${fmt(h)}</h2><p>${fmt(p)}</p>${code ? codeBlock(code, cfg.codeLabel || "", true) : ""}`);
      if (code) wireCopy(s, code);
    });

    if (d.real) make(cfg.realLabel, `${tag(cfg.realLabel)}<h2>${fmt(d.real[0])}</h2><p>${fmt(d.real[1])}</p>`);

    if (d.myth) make("Myth vs fact", `${tag("Myth vs fact")}<h2>Don't fall for it</h2>
      <div class="mf"><div class="m"><b>Myth</b>${fmt(d.myth[0])}</div><div class="f"><b>Fact</b>${fmt(d.myth[1])}</div></div>`);

    if (d.tryit){
      const t = d.tryit;
      const s = make("Try it", `${tag("Try it")}<h2>${fmt(t.h)}</h2>${t.where && !t.code ? `<div class="where">${esc(t.where)}</div>` : ""}<p>${fmt(t.p)}</p>
        ${t.code ? codeBlock(t.code, t.where, true) : ""}`);
      if (t.code) wireCopy(s, t.code);
    }

    (d.review || []).forEach(([h, p], j) => make("Review " + (j+1) + "/" + d.review.length,
      `${tag("Review", (j+1) + " of " + d.review.length)}<h2>${fmt(h)}</h2><p>${fmt(p)}</p>`));

    T.resetters[dn] = [];
    d.quiz.forEach((q, qi) => {
      const s = make("Quiz " + (qi+1) + "/" + d.quiz.length, quizHtml(q, tag("Quiz", (qi+1) + " of " + d.quiz.length), true));
      T.resetters[dn].push(buildQuiz(s, q, {obj:answers, key:dn + "." + qi, save}, (pick, sure) => {
        if (pick !== null) srsRecord((tab === "study" ? "s:" : "p:") + dn + "." + qi, pick === q.k, sure);
        updateScore(tab, pick !== null);
      }));
    });

    const last = dn === items.length;
    const rc = make("Recap", `${tag("Recap")}<h2>${last ? cfg.lastRecap : cfg.word + " " + dn + " in a nutshell"}</h2>
      <ul class="recap">${d.recap.map(r => `<li>${fmt(r)}</li>`).join("")}</ul>
      <div class="dscore"></div>
      <div class="row"><button class="btn nx">${last ? "Finish" : "Start " + cfg.word + " " + (dn+1)}</button><button class="btn ghost redo" type="button">Redo this quiz</button></div>
      ${cfg.links && cfg.links[dn] ? `<button class="linkbtn" type="button">${esc(cfg.links[dn].text)} →</button>` : ""}`);
    T.recapScores[dn] = rc.querySelector(".dscore");
    const lb = rc.querySelector(".linkbtn");
    if (lb) lb.addEventListener("click", () => navigateTo(cfg.links[dn].tab, cfg.links[dn].n));
    rc.querySelector(".nx").addEventListener("click", () => last ? go(tab, Math.max(T.cards.findIndex(c => c.group <= -2), 0) || T.cards.length-1) : goGroup(tab, dn));
    rc.querySelector(".redo").addEventListener("click", () => {
      d.quiz.forEach((q, qi) => delete answers[dn + "." + qi]);
      save();
      T.resetters[dn].forEach(f => f());
      updateScore(tab, false);
      go(tab, T.cards.findIndex(c => c.group === i && c.label.startsWith("Quiz 1/")));
    });
  });
}
function trackStats(tab, dn){
  const T = TABS[tab], d = T.items[dn-1]; let done = 0, right = 0;
  d.quiz.forEach((q, qi) => { const a = T.answers[dn + "." + qi]; if (Number.isInteger(a)){ done++; if (a === q.k) right++; } });
  return {done, right, total: d.quiz.length};
}
function trackTotals(tab){
  const T = TABS[tab]; let done = 0, right = 0, total = 0;
  T.items.forEach((d, i) => { const s = trackStats(tab, i+1); done += s.done; right += s.right; total += s.total; });
  return {done, right, total};
}

/* ---------- Study tab ---------- */
const S = TABS.study;
const studyIntroCount = () => DAYS.reduce((s, d) => s + S.cardCount(d), 0);
addCard("study", {c:"var(--w1)", id:"start", label:"Start", group:-1, html:`
  <div class="tag"><span>Stages 1 and 2</span><i id="studyCount" style="font-style:normal"></i></div>
  <h1>Cyber Scroll</h1>
  <p>One idea per card: short lessons, a real incident, a lab task and a quiz each day. Swipe up ↑<span class="kb"> or press the down arrow</span>.</p>
  <div class="stats streakLine"></div>
  <div class="weeks">${WEEKS.map(w=>`<div style="--wc:${w.c}"><b>Week ${w.n}</b>${w.name}</div>`).join("")}</div>
  <button class="linkbtn" id="bkNudge" type="button" hidden>Back up your progress →</button>
  ${store.ok ? "" : `<p class="warn">This browser is blocking storage, so your answers and place won't be saved after you close the page.</p>`}
  <div class="row"><button class="btn" id="resume">Start Day 1</button><button class="btn ghost reviewNow" type="button" hidden></button></div>`});
makeTrack("study", DAYS, {
  answersKey:"cr2-answers", word:"Day", realLabel:"Real world", lastRecap:"Stage 2, wrapped",
  links:{9:{tab:"py", n:11, text:"Python Lesson 11: IPs and JSON"}, 11:{tab:"py", n:10, text:"Python Lesson 10: port checks"},
         18:{tab:"py", n:7, text:"Python Lesson 7: reading logs"}, 19:{tab:"py", n:9, text:"Python Lesson 9: hashing"},
         22:{tab:"py", n:10, text:"Python Lesson 10: port checker"}, 24:{tab:"py", n:14, text:"Python Lesson 14: detector"},
         28:{tab:"py", n:14, text:"Python Lesson 14: capstone"}},
  id:(dn, n) => n === 0 ? "day-" + dn : "d" + dn + "-" + n,
  groupOf:i => { const w = WEEKS[Math.floor(i/7)]; return {c:w.c, label:`Week ${w.n} · ${w.name}`}; }
});
const PORTFOLIO = [
  ["lab-ips", "Lab network with static IPs (Day 8)"],
  ["fw-rule", "Firewall rule allowing lab ping only (Day 14)"],
  ["perm-proof", "Permission test with a second user (Day 21)"],
  ["nmap", "Nmap scan of the Windows target (Day 22)"],
  ["wireshark", "Cleartext HTTP caught in Wireshark (Day 23)"],
  ["logons", "Failed logons found in the Security log (Day 24)"],
  ["scan-watch", "Scan and watch lab write-up (Day 25)"],
  ["playbook", "Phishing playbook (Day 26)"],
  ["repo", "GitHub homelab repo with a README (Day 28)"],
  ["py-detector", "Python brute-force detector (Python 14)"],
  ["py-s3", "Python S3 audit script (Python 13)"]
];
const portfolio = asObj(store.get("cr2-portfolio", {}));
const checkList = items => `<ul class="checks">${items.map(([id, t]) => `<li><label><input type="checkbox" data-id="${id}"${portfolio[id] ? " checked" : ""}>${esc(t)}</label></li>`).join("")}</ul>`;
const pfCards = [
  addCard("study", {c:"var(--w4)", id:"portfolio", label:"Portfolio", group:-3, html:`
    <div class="tag"><span>Portfolio</span>1 of 2 · lab write-ups</div>
    <h2>Labs you've written up</h2>${checkList(PORTFOLIO.slice(0, 8))}<div class="dscore pfScore"></div>`}),
  addCard("study", {c:"var(--w4)", id:"portfolio-2", label:"Portfolio", group:-3, html:`
    <div class="tag"><span>Portfolio</span>2 of 2 · projects</div>
    <h2>Projects to show</h2>${checkList(PORTFOLIO.slice(8))}<div class="dscore pfScore"></div>
    <p class="small">Each ticked item is a story you can tell in an interview. <b class="storyCount"></b></p>`})
];
const pfScore = () => { const n = PORTFOLIO.filter(([id]) => portfolio[id]).length; pfCards.forEach(c => c.querySelector(".pfScore").innerHTML = `<b>${n} of ${PORTFOLIO.length}</b> done`); return n; };
pfCards.forEach(pf => pf.querySelectorAll("input").forEach(cb => cb.addEventListener("change", () => { if (cb.checked) portfolio[cb.dataset.id] = true; else delete portfolio[cb.dataset.id]; store.set("cr2-portfolio", portfolio); pfScore(); })));
pfScore();
/* ---------- Interview story bank (STAR: situation, task, action, result) ---------- */
let stories = (() => { const v = store.get("cr2-stories", []); return Array.isArray(v) ? v.filter(x => x && typeof x === "object") : []; })();
const saveStories = () => store.set("cr2-stories", stories);
const storyCard = addCard("study", {c:"var(--good)", id:"stories", label:"Stories", group:-3, html:`
  <div class="tag"><span>Interview stories</span>STAR: situation, task, action, result</div>
  <h2>Your stories</h2>
  <p class="small">Interviewers want your examples, not textbook answers. Turn tickets and lab work into short stories, and link each one to the interview questions it answers.</p>
  <ul class="stories" id="storyList"></ul>
  <button class="btn" id="storyAdd" type="button">Add a story</button>`});
function renderStories(){
  const list = document.getElementById("storyList");
  list.innerHTML = stories.length ? stories.map((st, i) => `<li><button type="button" data-i="${i}">${esc(st.title || "Untitled story")}<small>${(st.links || []).length} interview question${(st.links || []).length === 1 ? "" : "s"} · tap to edit</small></button></li>`).join("")
    : `<li class="small">No stories yet. Start with a help desk ticket you're proud of.</li>`;
  list.querySelectorAll("button").forEach(b => b.addEventListener("click", e => openStory(+b.dataset.i, e)));
  document.querySelectorAll(".storyCount").forEach(x => x.textContent = `${stories.length} interview stor${stories.length === 1 ? "y" : "ies"} ready`);
}
const storySheet = document.getElementById("storySheet");
let editing = -1, storyOpener = null, deleteArmed = false, storySnap = "", discardArmed = false;
const storyFields = () => ["stTitle", "stS", "stA", "stR"].map(id => document.getElementById(id).value).join("\u0001") + [...document.querySelectorAll("#stLinks input:checked")].map(x => x.value).join(",");
const storyDirty = () => storySheet.classList.contains("open") && storyFields() !== storySnap;
function openStory(i, e){
  editing = i; deleteArmed = false; storyOpener = (e && e.currentTarget) || document.activeElement;
  const st = i >= 0 ? stories[i] : {title:"", s:"", a:"", r:"", links:[]};
  document.getElementById("stTitle").value = st.title || "";
  document.getElementById("stS").value = st.s || ""; document.getElementById("stA").value = st.a || ""; document.getElementById("stR").value = st.r || "";
  document.getElementById("stLinks").innerHTML = FEED_DECKS.filter(d => d.kind === "interview").map(d =>
    `<li><label><input type="checkbox" value="${d.id}"${(st.links || []).includes(d.id) ? " checked" : ""}>${esc(d.title)}</label></li>`).join("");
  document.getElementById("stDelete").hidden = i < 0; document.getElementById("stDelete").textContent = "Delete";
  document.getElementById("stMsg").textContent = "";
  storySnap = storyFields(); discardArmed = false;
  storySheet.classList.add("open");
  Object.values(TABS).forEach(T => T.el.inert = true); rail.inert = true; tabsBar.inert = true;
  history.pushState({story:1}, "");
  // New story: start typing straight away. Existing story: don't pop the keyboard over it.
  if (i < 0) document.getElementById("stTitle").focus();
  else { const h = document.getElementById("storyTitle"); h.tabIndex = -1; h.focus(); }
}
function hideStory(){
  storySheet.classList.remove("open");
  Object.entries(TABS).forEach(([k, T]) => T.el.inert = k !== active); rail.inert = false; tabsBar.inert = false;
  if (storyOpener && storyOpener.isConnected) storyOpener.focus({preventScroll:true});
  renderStories();
}
function closeStory(force){
  if (!force && storyDirty() && !discardArmed){
    discardArmed = true; document.getElementById("stMsg").textContent = "You have unsaved changes. Save, or tap Close again to discard them."; return;
  }
  storySnap = storyFields();
  if (history.state && history.state.story) history.back(); else hideStory();
}
document.getElementById("storyAdd").addEventListener("click", e => openStory(-1, e));
document.getElementById("storyClose").addEventListener("click", () => closeStory());
// A stray tap outside the sheet never throws work away.
storySheet.addEventListener("click", e => { if (e.target === storySheet && !storyDirty()) closeStory(); });
document.getElementById("stSave").addEventListener("click", () => {
  const st = {title:document.getElementById("stTitle").value.trim(), s:document.getElementById("stS").value.trim(),
    a:document.getElementById("stA").value.trim(), r:document.getElementById("stR").value.trim(),
    links:[...document.querySelectorAll("#stLinks input:checked")].map(x => x.value)};
  if (!st.title){ document.getElementById("stMsg").textContent = "Give the story a short title first."; document.getElementById("stTitle").focus(); return; }
  if (editing >= 0) stories[editing] = st; else stories.push(st);
  saveStories(); toast("Story saved"); closeStory(true);
});
document.getElementById("stDelete").addEventListener("click", () => {
  if (!deleteArmed){ deleteArmed = true; document.getElementById("stDelete").textContent = "Tap again to delete"; return; }
  stories.splice(editing, 1); saveStories(); toast("Story deleted"); closeStory(true);
});
document.getElementById("studyCount").textContent = `${DAYS.length} days · ${studyIntroCount()} cards · ${DAYS.reduce((s,d)=>s+d.quiz.length,0)} questions`;
addCard("study", {c:"var(--w4)", id:"finish", label:"Finished", group:-2, html:`<div class="tag"><span>Done</span>Stages 1 and 2 complete</div><h1>That's all ${DAYS.length} days</h1>
  <p class="endScore"></p><p class="small">Missed some? Open Days, pick a red one and use “Redo this quiz” on its recap card, or “Try again” on any question. Reset clears your Study quiz answers. Your review schedule and streak are kept.</p>
  <div class="row"><button class="btn toTop" type="button">Back to start</button><button class="btn ghost reset" type="button">Reset answers</button></div>`});

/* ---------- Python tab ---------- */
const P = TABS.py;
addCard("py", {c:"var(--t-py)", id:"py-start", label:"Start", group:-1, html:`
  <div class="tag"><span>Python</span>${PY_LESSONS.length} lessons · ${PY_LESSONS.reduce((s,d)=>s+d.quiz.length,0)} questions</div>
  <h1>Python for security</h1>
  <p>Short lessons that build up to real tools: log parsing, regex, hashing, port checks and a cloud audit script. Run the examples in Kali as you go.</p>
  <div class="weeks">${PY_LEVELS.map(l=>`<div style="--wc:var(--t-py)"><b>${esc(l.name)}</b>Lessons ${l.from+1} to ${l.to}</div>`).join("")}</div>
  <div class="stats streakLine"></div>
  <div class="row"><button class="btn" id="pyResume">Start Lesson 1</button><button class="btn ghost reviewNow" type="button" hidden></button></div>`});
makeTrack("py", PY_LESSONS, {
  answersKey:"cr2-py-answers", word:"Lesson", realLabel:"On the job", lastRecap:"Python track, wrapped", codeLabel:"Python",
  links:{7:{tab:"study", n:18, text:"Background: Study Day 18"}, 8:{tab:"study", n:24, text:"Background: Study Day 24"},
         9:{tab:"study", n:19, text:"Background: Study Day 19"}, 10:{tab:"study", n:22, text:"Background: Study Day 22"},
         11:{tab:"study", n:9, text:"Background: Study Day 9"}, 14:{tab:"study", n:25, text:"Try it in the Day 25 lab"}},
  id:(dn, n) => n === 0 ? "py-" + dn : "p" + dn + "-" + n,
  groupOf:i => { const l = PY_LEVELS.find(l => i >= l.from && i < l.to); return {c:"var(--t-py)", label:`Python · ${l.name}`}; }
});
addCard("py", {c:"var(--t-py)", id:"py-finish", label:"Finished", group:-2, html:`<div class="tag"><span>Done</span>Python track complete</div><h1>You can script it</h1>
  <p class="endScore"></p><p class="small">Turn the capstone into a GitHub project with a README and sample output. Reset clears your Python quiz answers. Your review schedule and streak are kept.</p>
  <div class="row"><button class="btn toTop" type="button">Back to start</button><button class="btn ghost reset" type="button">Reset answers</button></div>`});

/* ---------- Feed tab: endless, shuffled decks ---------- */
const F = TABS.feed;
const feedState = (() => {
  const s = asObj(store.get("cr2-feed", {}));
  return {seen:asObj(s.seen), scored:asObj(s.scored), recent:Array.isArray(s.recent) ? s.recent : [], decks:+s.decks || 0, answered:+s.answered || 0, right:+s.right || 0};
})();
const saveFeed = () => store.set("cr2-feed", feedState);
let feedSerial = 0, lastKind = null, decksAppended = 0;
// Missed checks first, then the easiest one not yet answered, then the one you know least well.
function pickCheck(d){
  const keys = d.qs.map((q, n) => checkKey(d, n)), idx = d.qs.map((q, n) => n);
  const missed = idx.filter(n => srs[keys[n]] && srs[keys[n]].box === 1);
  if (missed.length) return missed[0];
  const fresh = idx.filter(n => !srs[keys[n]]).sort((a, b) => (d.qs[a].d || 2) - (d.qs[b].d || 2));
  if (fresh.length) return fresh[0];
  return idx.sort((a, b) => srs[keys[a]].box - srs[keys[b]].box)[0];
}
function interviewHtml(d, tagHtml){
  return `${tagHtml}<h2 class="q">${fmt(d.title)}</h2>
    <p class="small">Answer out loud in about 30 seconds, as if you're in the interview. Then compare.</p>
    <button class="btn reveal" type="button">Reveal a model answer</button>
    <div class="model">${fmt(d.answer)}</div>
    <div class="yours"></div>
    <div class="rate" role="group" aria-label="How did you go?"><button type="button" data-r="nailed">Nailed it</button><button type="button" data-r="shaky">Shaky</button><button type="button" data-r="missed">Missed it</button></div>
    <p class="small rated" aria-live="polite"></p>`;
}
function wireInterview(card, d, onRated){
  const model = card.querySelector(".model"), rate = card.querySelector(".rate"), rated = card.querySelector(".rated");
  card.querySelector(".reveal").addEventListener("click", e => {
    model.classList.add("show"); rate.classList.add("show"); e.currentTarget.hidden = true;
    const mine = stories.filter(st => (st.links || []).includes(d.id));
    const yours = card.querySelector(".yours");
    if (mine.length){ yours.innerHTML = `<b>Your story</b>${mine.map(st => `<strong>${esc(st.title)}</strong>. ${fmt(st.r || st.a || "")}`).join("<br>")}`; yours.classList.add("show"); }
    model.tabIndex = -1; model.focus({preventScroll:true});
    model.scrollIntoView({block:"nearest", behavior: reduceMotion() ? "auto" : "smooth"});
  });
  const key = "i:" + d.id;
  let before; // the schedule as it was before this card's first rating
  rate.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
    rate.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    if (before === undefined) before = srs[key] ? Object.assign({}, srs[key]) : null;
    else { if (before) srs[key] = Object.assign({}, before); else delete srs[key]; }
    srsRecord(key, b.dataset.r === "nailed");
    if (onRated) onRated();
    const days = srs[key].due - dayNum();
    rated.textContent = days <= 1 ? "No problem. This one comes back tomorrow for another go." : `Great. This one comes back in ${days} days.`;
  }));
}
// Your goal tilts the Feed: SOC leans towards triage, queries and incidents; Cloud towards cloud and app security.
const TARGETS = {mixed:{}, soc:{triage:1.5, kql:1.5, incident:0.75, interview:0.5}, cloud:{cloud:2, owasp:0.75, e8:0.5, kql:0.5}};
let target = TARGETS[store.get("cr2-target", "mixed")] ? store.get("cr2-target", "mixed") : "mixed";
// Share of a kind's answered checks that are still weak (box 1 or 2). Weak kinds come up more often.
function weakShare(kind){
  const keys = Object.keys(srs).filter(k => k.startsWith("f:") && (FEED_DECKS.find(d => d.id === k.slice(2).split("#")[0]) || {}).kind === kind);
  return keys.length ? keys.filter(k => srs[k].box <= 2).length / keys.length : 0;
}
function pickDeck(){
  // Skip recently shown decks and the last kind, then pick at random, weighted by your goal,
  // by how weak you are on that kind, and towards decks you've seen least.
  const avoid = feedState.recent.slice(-Math.min(6, FEED_DECKS.length - 1));
  let pool = FEED_DECKS.filter(d => !avoid.includes(d.id));
  const other = pool.filter(d => d.kind !== lastKind);
  if (other.length) pool = other;
  const weak = {}, boost = TARGETS[target];
  const weights = pool.map(d => {
    if (!(d.kind in weak)) weak[d.kind] = weakShare(d.kind);
    return (1 + (boost[d.kind] || 0)) * (1 + weak[d.kind]) * (isNew(d) ? 3 : 1) / (1 + (feedState.seen[d.id] || 0));
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++){ r -= weights[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
function appendDeck(forced, at){
  const d = forced || pickDeck(); lastKind = d.kind;
  feedState.recent.push(d.id); feedState.recent = feedState.recent.slice(-30); saveFeed();
  const c = DECK_COLOUR[d.kind], badge = deckBadge(d), name = deckName(d), serial = ++feedSerial;
  let pos = at;
  const addCard = (tab, o) => window.addCard(tab, Object.assign(o, pos === undefined ? {} : {at:pos++}));
  if (d.kind === "interview"){
    const s = addCard("feed", {c, label:name, group:serial, extra:{deck:d.id, pos:0, total:1, first:true},
      html: interviewHtml(d, `<div class="tag"><span>Interview</span>Say it out loud</div>`)});
    wireInterview(s, d);
  } else {
    // Which checks to show: triage decks show all; others show one, the most useful right now.
    const show = d.all ? d.qs.map((q, n) => n) : d.qs.length ? [pickCheck(d)] : [];
    const after = d.after || [];
    const total = d.cards.length + show.length + after.length;
    const tag = (i, extra) => `<div class="tag"><span>${esc(badge)}</span>${isNew(d) ? `<span class="new">New this week</span>` : ""}${esc(d.title)} · ${extra || (i+1) + " of " + total}</div>`;
    const card = ([h, p, code], i, last, chips) => {
      const evidence = d.kind === "triage" && i === 0;
      const s = addCard("feed", {c, label:name, group:serial, extra:{deck:d.id, pos:i, total, first:i === 0},
        html:`${tag(i)}<h2>${fmt(h)}</h2><p>${fmt(p)}</p>${code ? codeBlock(code, evidence ? "Log" : "", !evidence) : ""}${chips && d.maps ? `<div class="chip"><b>Maps to</b>${fmt(d.maps)}</div>` : ""}${chips && d.attack ? `<div class="chip"><b>ATT&amp;CK</b>${d.attack.map(fmt).join("<br>")}</div>` : ""}`});
      if (code && !evidence) wireCopy(s, code);
    };
    // Labels that would give an answer away go after the questions on decks that ask about them.
    d.cards.forEach((x, i) => card(x, i, i === d.cards.length - 1, !d.all && i === d.cards.length - 1));
    show.forEach((n, j) => {
      const q = d.qs[n], key = checkKey(d, n);
      const s = addCard("feed", {c, label:name, group:serial, extra:{deck:d.id, pos:d.cards.length + j, total},
        html: quizHtml(q, tag(d.cards.length + j, show.length > 1 ? "Check " + (j+1) + " of " + show.length : "Check"), false, Math.random() * 4294967296 >>> 0)});
      buildQuiz(s, q, null, (pick, sure) => {
        if (pick === null) return;
        srsRecord(key, pick === q.k, sure);
        // Count each check once per day, so repeats don't inflate the score.
        const today = new Date().toLocaleDateString("en-CA");
        if (feedState.scored[key] === today) return;
        feedState.scored[key] = today; feedState.answered++; if (pick === q.k) feedState.right++;
        saveFeed(); updateScore("feed", true);
      });
    });
    after.forEach((x, i) => card(x, d.cards.length + show.length + i, false, d.all && i === 0));
  }
  // A natural pause every five decks, so the Feed isn't a bottomless scroll.
  if (at === undefined && ++decksAppended % 5 === 0){
    const pause = addCard("feed", {c:"var(--t-feed)", label:"Pause", group:serial, extra:{pause:true}, html:`
      <div class="tag"><span>Pause</span>${decksAppended} decks in this session</div>
      <h2>Nice run</h2>
      <p class="runScore"></p>
      <div class="conf target" role="group" aria-label="Your job goal">Goal: <button type="button" data-t="mixed">Mixed</button><button type="button" data-t="soc">SOC</button><button type="button" data-t="cloud">Cloud</button></div>
      <div class="row"><button class="btn keep" type="button">Keep going</button><button class="btn ghost toStudy" type="button">Switch to Study</button></div>`});
    wireTarget(pause);
    pause.querySelector(".keep").addEventListener("click", () => go("feed", F.cards.findIndex(c => c.el === pause) + 1));
    pause.querySelector(".toStudy").addEventListener("click", () => userSwitch("study"));
  }
}
// A Review deck: up to five due questions from any tab. Inserted at `at`, or appended.
let decksSinceReview = 99;
// A due question is "waiting" if an unanswered review card for it is still ahead of the reader.
const waitingAhead = k => F.cards.some((c, j) => j > F.current && c.rkey === k && !c.answered);
function appendReview(at){
  const keys = dueKeys().filter(k => !waitingAhead(k)).slice(0, 5);
  if (!keys.length) return false;
  decksSinceReview = 0;
  const c = DECK_COLOUR.review, serial = ++feedSerial, total = keys.length + 1;
  let pos = at;
  const put = o => addCard("feed", Object.assign(o, pos === undefined ? {} : {at:pos++}));
  put({c, label:"Review", group:serial, extra:{review:true, reviewStart:true, pos:0, total}, html:`
    <div class="tag"><span>Review</span>${keys.length} due</div>
    <h2>Time to review</h2>
    <p>Questions you've answered before. Get one right and it comes back later; miss it and it comes back tomorrow.</p>`});
  keys.forEach((k, i) => {
    const slipping = isSlipping(srs[k]);
    const it = srsItem(k), tagHtml = `<div class="tag"><span>Review</span>${esc(it.src)} · ${i + 1} of ${keys.length}${slipping ? ` · <span class="slip">Keeps slipping</span>` : ""}</div>`;
    if (it.interview){
      const s = put({c, label:"Review · Interview", group:serial, extra:{review:true, rkey:k, pos:i + 1, total}, html: interviewHtml(it.interview, tagHtml)});
      wireInterview(s, it.interview, () => { F.cards.find(x => x.el === s).answered = true; });
      return;
    }
    const rereadText = it.tab ? `Re-read ${it.tab === "study" ? "Day" : "Lesson"} ${it.dn}` : "See this deck again";
    const s = put({c, label:"Review · " + it.src, group:serial, extra:{review:true, rkey:k, pos:i + 1, total},
      html: quizHtml(it.q, tagHtml, false, Math.random() * 4294967296 >>> 0, true) + `<button class="linkbtn reread" type="button" hidden>${rereadText} →</button>`});
    const reread = s.querySelector(".reread");
    reread.addEventListener("click", () => {
      if (it.tab) navigateTo(it.tab, it.dn, true);
      else { const j = F.cards.findIndex(x => x.el === s); let e = j; while (F.cards[e+1] && F.cards[e+1].group === F.cards[j].group) e++; appendDeck(it.deck, e + 1); go("feed", e + 1); }
    });
    buildQuiz(s, it.q, null, (pick, sure) => {
      if (pick === null) return;
      F.cards.find(x => x.el === s).answered = true;
      srsRecord(k, pick === it.q.k, sure);
      reread.hidden = pick === it.q.k;
    });
  });
  return true;
}
// Each new stretch of feed: a Review deck when questions are due (at most every third deck), otherwise a fresh deck.
function appendNext(){
  if (decksSinceReview >= 3 && appendReview()) return;
  appendDeck(); decksSinceReview++;
}
function reviewNow(){
  if (active !== "feed") userSwitch("feed");
  let i = F.current; const g = F.cards[i].group;
  while (F.cards[i+1] && F.cards[i+1].group === g) i++;
  if (appendReview(i + 1)){ requestAnimationFrame(() => go("feed", i + 1)); return; }
  const queued = F.cards.findIndex((c, j) => j > F.current && c.reviewStart);
  if (queued > 0) go("feed", queued); else toast("Nothing due for review right now");
}
addCard("feed", {c:"var(--t-feed)", id:"feed-start", label:"Start", group:-1, html:`
  <div class="tag"><span>Feed</span>Never ends</div>
  <h1>Keep scrolling</h1>
  <p>Short decks, shuffled, with your due reviews mixed in.</p>
  <div class="conf target" role="group" aria-label="Your job goal">Goal: <button type="button" data-t="mixed">Mixed</button><button type="button" data-t="soc">SOC</button><button type="button" data-t="cloud">Cloud</button></div>
  <div class="legend">${[["OWASP","--t-feed"],["Incidents","--w4"],["Essential Eight","--k-e8"],["Cloud","--k-cloud"],["AU/NZ law","--k-law"],["Triage","--k-triage"],["KQL","--k-kql"],["Quick-fire","--k-quick"],["Interview","--k-int"],["Review","--w3"]].map(([t, v]) => `<span style="color:var(${v})">${t}</span>`).join("")}</div>
  <div class="stats streakLine"></div>`});
function wireTarget(root){
  root.querySelectorAll(".target button").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.t === target ? "true" : "false");
    b.addEventListener("click", () => {
      target = b.dataset.t; store.set("cr2-target", target);
      document.querySelectorAll(".target button").forEach(x => x.setAttribute("aria-pressed", x.dataset.t === target ? "true" : "false"));
      toast(target === "mixed" ? "From the next few decks: a mix of everything" : `From the next few decks: more ${target === "soc" ? "SOC analyst" : "cloud security"} topics`);
    });
  });
}
wireTarget(F.el);
for (let i = 0; i < 3; i++) appendNext();

// Keep the DOM small on long sessions: drop whole decks well above the reader,
// but only once scrolling has settled, so a fling isn't interrupted.
let trimTimer = null;
function scheduleTrim(){ clearTimeout(trimTimer); trimTimer = setTimeout(trimFeed, 900); }
F.el.addEventListener("scroll", () => { if (trimTimer){ clearTimeout(trimTimer); trimTimer = setTimeout(trimFeed, 900); } }, {passive:true});
function trimFeed(){
  trimTimer = null;
  if (F.cards.length < 90 || F.current < 50) return;
  // Decks are contiguous, so everything before the deck holding keepFrom is whole decks.
  // The start card (index 0) always stays, so the goal toggle is never lost.
  const keepFrom = F.current - 25, g = F.cards[keepFrom].group;
  const cut = F.cards.findIndex(c => c.group === g);
  if (cut <= 1) return;
  const removed = F.cards.splice(1, cut - 1);
  const h = removed.reduce((sum, c) => sum + c.el.offsetHeight, 0);
  removed.forEach(c => { F.io.unobserve(c.el); c.el.remove(); });
  F.el.scrollTop -= h;
  F.current -= cut - 1;
}

/* ---------- Streak, due count and toasts ---------- */
let toastTimer = null;
function toast(msg){
  const t = document.getElementById("toast");
  clearTimeout(toastTimer); t.textContent = msg; t.classList.add("show");
  toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
function refreshDaily(){
  const d = today(), streak = currentStreak(), due = dueKeys().length;
  count.textContent = d.qs >= DAILY_GOAL ? `Streak ${streak} · done` : `Streak ${streak} · ${d.qs}/${DAILY_GOAL}`;
  const badge = document.getElementById("dueBadge");
  badge.hidden = due === 0; badge.innerHTML = `${due > 99 ? "99+" : due}<span class="sr"> reviews due</span>`;
  document.querySelectorAll(".streakLine").forEach(l => l.innerHTML =
    `<span>Streak <b>${streak} day${streak === 1 ? "" : "s"}</b></span><span>Best <b>${daily.best}</b></span><span>Today <b>${Math.min(d.qs, DAILY_GOAL)}/${DAILY_GOAL}</b></span><span>Due <b>${due}</b></span>`);
  document.querySelectorAll(".reviewNow").forEach(b => { b.hidden = due === 0; b.textContent = `Review ${due} due`; });
  // Backup reminder: once there's real progress and no backup in the last 7 days.
  const last = +store.get("cr2-lastbackup", 0), age = last ? Math.floor((Date.now() - last) / 864e5) : null;
  const bkLast = document.getElementById("bkLast");
  if (bkLast) bkLast.textContent = last ? `Last backup: ${age === 0 ? "today" : age === 1 ? "yesterday" : age + " days ago"}.` : "Last backup: never.";
  const nudge = document.getElementById("bkNudge");
  if (nudge) nudge.hidden = !store.ok || Object.keys(srs).length < 10 || (last && age < 7);
  if (typeof renderReady === "function" && document.getElementById("skillList") && S.cards[S.current] && S.cards[S.current].el.id === "ready") renderReady();
}
document.querySelectorAll(".reviewNow").forEach(b => b.addEventListener("click", reviewNow));

/* ---------- Header, progress and the "more below" hint ---------- */
const prog = document.getElementById("prog"), where = document.getElementById("where"), count = document.getElementById("count");
const more = document.getElementById("more"), live = document.getElementById("live");
const sheet = document.getElementById("sheet");
const hasMore = c => c.scrollHeight - c.clientHeight - c.scrollTop > 6;
function updateMore(){ const c = TABS[active].cards[TABS[active].current]; more.classList.toggle("show", !!c && !sheet.classList.contains("open") && hasMore(c.el)); }

function setCurrent(tab, idx){
  const T = TABS[tab];
  if (idx < 0) return;
  T.current = idx;
  const c = T.cards[idx];
  if (tab === "feed"){
    if (c.first && !c.counted){ c.counted = true; feedState.seen[c.deck] = (feedState.seen[c.deck] || 0) + 1; feedState.decks++; saveFeed(); }
    if (idx >= T.cards.length - 4){ appendNext(); appendNext(); }
    if (c.first) scheduleTrim();
  } else if (c.group >= 0){
    if (c.el.id === "ready") renderReady();
    if (!T.detour){ store.set(tab === "study" ? "cr2-pos" : "cr2-py-pos", c.el.id); updateResume(tab); }
  }
  if (tab === active) render();
}
function render(){
  const T = TABS[active], c = T.cards[T.current];
  if (!c) return;
  let accent = T.accent;
  if (active === "feed"){
    accent = c.el.style.getPropertyValue("--c") || T.accent;
    prog.style.width = c.total ? ((c.pos + 1) / c.total * 100) + "%" : "0%";
    where.innerHTML = c.group >= 0 ? `<b>${esc(c.label)}</b>` : "<b>Feed</b>";
    if (location.hash !== "#feed") history.replaceState(history.state, "", "#feed");
  } else {
    prog.style.width = (T.current / (T.cards.length - 1) * 100) + "%";
    if (c.group >= 0){
      accent = c.el.style.getPropertyValue("--c") || T.accent;
      where.innerHTML = `<b>${T.cfg.word} ${c.group+1}</b> · ${esc(c.label)}`;
      // The hash names the exact card, so a reload or a restored tab comes back to the same place.
      if (location.hash !== "#" + c.el.id) history.replaceState(history.state, "", "#" + c.el.id);
    } else {
      where.textContent = c.group === -1 ? (active === "study" ? "Cyber Scroll" : "Python") : c.label;
      const h = c.group === -1 ? (active === "study" ? "#study" : "#python") : "#" + c.el.id;
      if (location.hash !== h) history.replaceState(history.state, "", h);
    }
  }
  document.documentElement.style.setProperty("--accent", accent);
  updateScore(active, false);
  updateMore();
}
function updateScore(tab, announce){
  if (tab === "feed"){
    if (active === "feed"){
      refreshDaily();
    }
    F.el.querySelectorAll(".runScore").forEach(r => r.textContent = feedState.answered ? `You've got ${feedState.right} of ${feedState.answered} checks right so far. Keep going, or switch to your Study plan.` : "Keep going, or switch to your Study plan.");
    if (announce) live.textContent = `${feedState.right} of ${feedState.answered} feed checks right`;
    return;
  }
  const T = TABS[tab];
  T.items.forEach((d, i) => {
    const s = trackStats(tab, i+1), r = T.recapScores[i+1];
    if (r) r.innerHTML = s.done ? `Quiz: <b>${s.right} of ${s.total}</b> right${s.done < s.total ? ` · ${s.total - s.done} unanswered` : ""}` : `Quiz: not answered yet`;
  });
  const t = trackTotals(tab);
  if (tab === active) refreshDaily();
  if (announce) live.textContent = `${t.right} of ${t.done} correct so far`;
  const es = T.el.querySelector(".endScore");
  if (es) es.textContent = t.done ? `You got ${t.right} of ${t.done} questions right${t.done < t.total ? `, with ${t.total - t.done} still to do` : ""}.` : "You haven't answered any questions yet.";
  if (sheet.classList.contains("open")) renderSheet();
}

Object.entries(TABS).forEach(([tab, T]) => {
  T.io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) setCurrent(tab, T.cards.findIndex(c => c.el === e.target)); }), {root:T.el, threshold:0.6});
  T.cards.forEach(c => T.io.observe(c.el));
});

/* ---------- Navigation ---------- */
function go(tab, idx){
  const T = TABS[tab];
  idx = Math.max(0, Math.min(T.cards.length-1, idx));
  // Smooth for a step or two; instant for long jumps so pickers don't scroll through hundreds of cards.
  const smooth = tab === active && Math.abs(idx - T.current) <= 2 && !reduceMotion();
  T.cards[idx].el.scrollIntoView({behavior: smooth ? "smooth" : "auto"});
}
function goGroup(tab, i){ go(tab, TABS[tab].cards.findIndex(c => c.group === i)); }
// Next and the down keys finish reading a tall card before moving on.
function next(){
  const T = TABS[active], c = T.cards[T.current].el;
  if (hasMore(c)) c.scrollBy({top: c.clientHeight * 0.8, behavior: reduceMotion() ? "auto" : "smooth"});
  else go(active, T.current + 1);
}
function prev(){
  const T = TABS[active], c = T.cards[T.current].el;
  if (c.scrollTop > 6) c.scrollBy({top: -c.clientHeight * 0.8, behavior: reduceMotion() ? "auto" : "smooth"});
  else go(active, T.current - 1);
}

function switchTab(tab, focusView){
  if (!TABS[tab]) tab = "study";
  active = tab;
  Object.entries(TABS).forEach(([k, T]) => {
    const on = k === tab;
    T.el.classList.toggle("off", !on);
    T.el.inert = !on;
    const b = document.getElementById("tab-" + k);
    b.setAttribute("aria-selected", on ? "true" : "false");
    b.tabIndex = on ? 0 : -1;
  });
  store.set("cr2-tab", tab);
  const pickWrap = document.getElementById("pickWrap");
  pickWrap.hidden = tab === "feed";
  document.getElementById("pickLabel").textContent = tab === "py" ? "Lessons" : "Days";
  const hp = document.getElementById("hdrPick");
  hp.hidden = tab === "feed"; hp.textContent = tab === "py" ? "Lessons" : "Days";
  hp.setAttribute("aria-label", tab === "py" ? "Choose a lesson" : "Choose a day");
  document.getElementById("openDays").setAttribute("aria-label", tab === "py" ? "Choose a lesson" : "Choose a day");
  render();
  if (focusView) TABS[tab].el.focus({preventScroll:true});
}
// Jump to a day or lesson in another tab. Going back to Study restores its old card from history first, so jump after that.
function navigateTo(tab, n, detour){
  const there = () => goGroup(tab, n - 1);
  if (detour){
    history.pushState({tab:1}, "", location.hash);
    TABS[tab].detour = true; switchTab(tab); there(); return;
  }
  if (tab === "study" && active !== "study" && history.state && history.state.tab){ pendingNav = there; userSwitch("study"); }
  else { userSwitch(tab); there(); }
}
// Leaving Study adds one history entry, so the phone's Back button returns to Study instead of closing the app.
function userSwitch(tab){
  if (tab === active){
    // Re-tapping the current tab: Study and Python go to their start card, the Feed skips to the next deck.
    if (tab === "feed"){ const i = F.cards.findIndex((c, j) => j > F.current && c.first); go("feed", i > 0 ? i : F.current + 1); }
    else go(tab, 0);
    return;
  }
  const onTabEntry = history.state && history.state.tab;
  if (tab === "study"){ if (onTabEntry){ history.back(); return; } switchTab("study"); return; }
  if (!onTabEntry) history.pushState({tab:1}, "", location.hash);
  switchTab(tab);
}
document.querySelectorAll(".tab").forEach(b => {
  b.addEventListener("click", () => userSwitch(b.dataset.tab));
  b.addEventListener("keydown", e => {
    const order = ["study","feed","py"], i = order.indexOf(b.dataset.tab);
    const target = {ArrowRight:order[(i + 1) % 3], ArrowLeft:order[(i + 2) % 3], Home:order[0], End:order[2]}[e.key];
    if (target){
      e.preventDefault(); e.stopPropagation();
      userSwitch(target); document.getElementById("tab-" + target).focus();
    }
  });
});

/* ---------- Day and lesson picker. Opening it adds a history entry, so Back closes it. ---------- */
const dayList = document.getElementById("dayList"), rail = document.getElementById("rail"), tabsBar = document.getElementById("tabs");
let opener = null, afterClose = null, ignoreHash = false, pendingNav = null;
function renderSheet(){
  const tab = active === "py" ? "py" : "study", T = TABS[tab];
  const cur = T.cards[T.current] ? T.cards[T.current].group + 1 : 0;
  const groups = tab === "study"
    ? WEEKS.map((w, wi) => ({title:`Week ${w.n} · ${w.name}`, c:w.c, from:wi*7, to:wi*7+7}))
    : PY_LEVELS.map(l => ({title:l.name, c:"var(--t-py)", from:l.from, to:l.to}));
  document.getElementById("sheetTitle").textContent = tab === "py" ? "Jump to a lesson" : "Jump to a day";
  const t = trackTotals(tab);
  // Mastery: share of a day's questions answered right on at least two separate days (box 3 or higher).
  const pre = tab === "study" ? "s:" : "p:";
  // Mastered = answered right on at least two separate days (box 3 or higher).
  const mastery = n => { const qs = T.items[n-1].quiz; return Math.round(qs.filter((q, qi) => ((srs[pre + n + "." + qi] || {}).box || 0) >= 3).length / qs.length * 100); };
  const missed = n => T.items[n-1].quiz.some((q, qi) => (srs[pre + n + "." + qi] || {}).box === 1);
  const started = T.items.map((d, i) => i + 1).filter(n => T.items[n-1].quiz.some((q, qi) => srs[pre + n + "." + qi]));
  const weakest = started.filter(missed).sort((a, b) => mastery(a) - mastery(b)).slice(0, 3);
  document.getElementById("score").innerHTML = `<div>Mastered means right on two separate days.</div>${t.done} of ${t.total} questions answered · ${t.right} correct${tab === "study" ? ` · portfolio ${pfScore()} of ${PORTFOLIO.length}` : ""}` +
    (weakest.length ? `<div class="weak">${weakest.map(n => `<button class="x weakBtn" type="button" data-n="${n}">Needs work: ${T.cfg.word} ${n}</button>`).join("")}</div>` : "");
  const mine = Object.keys(srs).filter(k => k.startsWith(pre));
  const surprises = mine.filter(k => srs[k].flag).length, slipping = mine.filter(k => isSlipping(srs[k]));
  if (surprises || slipping.length) document.getElementById("score").insertAdjacentHTML("beforeend",
    `<div>${surprises} surprise${surprises === 1 ? "" : "s"} (sure but wrong) · ${slipping.length} keep${slipping.length === 1 ? "s" : ""} slipping</div>` +
    (surprises ? `<div class="weak"><button class="x" type="button" id="reviewSurprises">Review surprises now</button></div>` : "") +
    (slipping.length ? `<div class="weak">${[...new Set(slipping.map(k => +k.slice(2).split(".")[0]))].slice(0, 4).map(n => `<button class="x weakBtn slip" type="button" data-n="${n}">Keeps slipping: ${T.cfg.word} ${n}</button>`).join("")}</div>` : ""));
  const slipDays = new Set(slipping.map(k => k.slice(2).split(".")[0]));
  document.querySelectorAll(".weakBtn:not(.slip)").forEach(b => { if (slipDays.has(b.dataset.n)) b.remove(); });
  const rs = document.getElementById("reviewSurprises");
  if (rs) rs.addEventListener("click", () => closeSheet(() => reviewNow()));
  document.querySelectorAll(".weakBtn").forEach(b => b.addEventListener("click", () => { const n = +b.dataset.n; closeSheet(() => { S.detour = false; goGroup(tab, n - 1); }); }));
  // 4. quick links to the cards after the last day
  if (tab === "study") document.getElementById("score").insertAdjacentHTML("beforeend",
    `<div class="weak">${[["portfolio","Portfolio"],["stories","Stories"],["ready","Readiness"]].map(([id, t]) => `<button class="x jump" type="button" data-id="${id}">${t}</button>`).join("")}</div>`);
  document.querySelectorAll(".jump").forEach(b => b.addEventListener("click", () => closeSheet(() => go("study", S.cards.findIndex(c => c.el.id === b.dataset.id)))));
  dayList.innerHTML = groups.map(g => `<div class="wk" style="color:${g.c}">${esc(g.title)}</div><div class="days">${
    T.items.slice(g.from, g.to).map((d, j) => { const n = g.from + j + 1, s = trackStats(tab, n);
      const st = s.done === 0 ? "" : s.right < s.done ? "miss" : s.done === s.total ? "ok" : "part";
      const label = s.done ? "first try " + s.right + "/" + s.total + (started.includes(n) ? " · " + mastery(n) + "% mastered" : "") : s.total + " questions";
      return `<button class="day ${st}" style="--dc:${g.c}" data-n="${n}"${n === cur ? ' aria-current="true"' : ""}><span class="n">${n}</span><span>${esc(d.t)}<small>${label}</small></span></button>`; }).join("")
  }</div>`).join("");
  dayList.querySelectorAll(".day").forEach(b => b.addEventListener("click", () => { const n = +b.dataset.n; closeSheet(() => { T.detour = false; goGroup(tab, n - 1); }); }));
}
function openSheet(e){
  if (active === "feed") return;
  opener = (e && e.currentTarget) || document.activeElement;
  renderSheet();
  sheet.classList.add("open");
  Object.values(TABS).forEach(T => T.el.inert = true); rail.inert = true; tabsBar.inert = true;
  more.classList.remove("show");
  history.pushState({sheet:1}, "");
  const cur = dayList.querySelector('[aria-current="true"]');
  if (cur) cur.scrollIntoView({block:"center"});
  document.getElementById("closeDays").focus();
}
function hideSheet(){
  sheet.classList.remove("open");
  Object.entries(TABS).forEach(([k, T]) => T.el.inert = k !== active); rail.inert = false; tabsBar.inert = false;
  if (opener && opener.isConnected && opener !== document.body) opener.focus({preventScroll:true}); else TABS[active].el.focus({preventScroll:true});
  const f = afterClose; afterClose = null;
  if (f) f();
  updateMore();
}
function closeSheet(then){
  if (!sheet.classList.contains("open")) return;
  afterClose = typeof then === "function" ? then : null;
  if (history.state && history.state.sheet){
    // Going back restores the URL from before the sheet opened; ignore the hashchange that follows.
    ignoreHash = true;
    history.back();
  } else hideSheet();
}
window.addEventListener("popstate", e => {
  if (storySheet.classList.contains("open")){
    // Back with unsaved changes: stay open once and warn; a second Back discards.
    if (storyDirty() && !discardArmed){ discardArmed = true; history.pushState({story:1}, ""); document.getElementById("stMsg").textContent = "You have unsaved changes. Save, or go back again to discard them."; return; }
    hideStory(); return;
  }
  if (sheet.classList.contains("open")){ ignoreHash = true; hideSheet(); setTimeout(() => { ignoreHash = false; }, 100); return; }
  // Back (or any history move) shows whatever the restored address points to; Study's entry holds a Study card.
  ignoreHash = true;
  if (!fromHash()) switchTab("study");
  if (pendingNav){ const f = pendingNav; pendingNav = null; requestAnimationFrame(f); }
  setTimeout(() => { ignoreHash = false; }, 100);
});
/* ---------- Backup and restore (copy and paste, since pages can't save files everywhere) ---------- */
function backupText(){
  const data = {};
  try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i); if (k.startsWith("cr2-") && k !== "cr2-test") data[k] = localStorage.getItem(k); } } catch(e){}
  return JSON.stringify({app:"cyber-scroll", v:1, at:new Date().toISOString(), data});
}
const bkText = document.getElementById("bkText"), bkMsg = document.getElementById("bkMsg"), bkApplyRow = document.getElementById("bkApplyRow");
if (!store.ok){
  document.getElementById("bkIntro").textContent = "This browser is blocking storage, so nothing is being saved and there's nothing to back up or restore here.";
  document.getElementById("bkCopy").disabled = true; document.getElementById("bkPaste").disabled = true;
}
document.getElementById("bkCopy").addEventListener("click", () => {
  const text = backupText();
  const shown = () => { bkText.hidden = false; bkText.value = text; bkText.select(); bkApplyRow.hidden = true; bkMsg.textContent = "Copying isn't allowed here, so the backup is selected above. Long-press to copy it."; };
  try { navigator.clipboard.writeText(text).then(() => { bkMsg.textContent = "Backup copied. Paste it into a note or email to yourself."; store.set("cr2-lastbackup", Date.now()); }, shown); }
  catch(e){ shown(); }
});
document.getElementById("bkPaste").addEventListener("click", () => {
  bkText.hidden = false; bkText.value = ""; bkApplyRow.hidden = false;
  bkMsg.textContent = "Paste your backup above, then tap Restore this backup. It replaces the progress on this device.";
  bkText.focus();
});
// Restoring replaces this device's progress, so it needs a second tap after a summary.
let bkArmed = null;
bkText.addEventListener("input", () => { bkArmed = null; document.getElementById("bkApply").textContent = "Restore this backup"; });
document.getElementById("bkApply").addEventListener("click", () => {
  let b; try { b = JSON.parse(bkText.value.trim()); } catch(e){ b = null; }
  if (!b || b.app !== "cyber-scroll" || !b.data || typeof b.data !== "object"){ bkMsg.textContent = "That doesn't look like a Cyber Scroll backup. Copy the whole text, including the curly brackets."; return; }
  if (!Object.keys(b.data).length){ bkMsg.textContent = "That backup is empty, so restoring it would only erase this device's progress."; return; }
  if (!store.ok){ bkMsg.textContent = "This browser is blocking storage, so a backup can't be restored here."; return; }
  if (bkArmed !== bkText.value){
    const n = ["cr2-answers", "cr2-py-answers"].reduce((a, k) => { try { return a + Object.keys(JSON.parse(b.data[k] || "{}")).length; } catch(e){ return a; } }, 0);
    const when = b.at ? new Date(b.at).toLocaleDateString("en-AU", {day:"numeric", month:"short", year:"numeric"}) : "an unknown date";
    bkMsg.textContent = `This backup is from ${when} with ${n} answers. Restoring replaces everything on this device. Tap again to restore.`;
    document.getElementById("bkApply").textContent = "Tap again to restore";
    bkArmed = bkText.value; return;
  }
  try {
    Object.keys(localStorage).filter(k => k.startsWith("cr2-")).forEach(k => localStorage.removeItem(k));
    Object.entries(b.data).forEach(([k, v]) => { if (k.startsWith("cr2-") && typeof v === "string") localStorage.setItem(k, v); });
  } catch(e){ bkMsg.textContent = "Couldn't restore: storage is full or blocked."; return; }
  bkMsg.textContent = "Restored. Reloading…";
  history.replaceState(null, "", location.pathname + location.search);
  setTimeout(() => location.reload(), 400);
});
document.getElementById("openDays").addEventListener("click", openSheet);
document.getElementById("hdrPick").addEventListener("click", openSheet);
document.getElementById("bkNudge").addEventListener("click", e => { openSheet(e); document.getElementById("bkTitle").scrollIntoView({block:"start"}); });
// The date may have changed while the app sat in the background.
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshDaily(); });
document.getElementById("closeDays").addEventListener("click", () => closeSheet());
sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
document.getElementById("nextBtn").addEventListener("click", next);
[["study", S], ["py", P]].forEach(([tab, T]) => {
  T.el.querySelector(".toTop").addEventListener("click", () => go(tab, 0));
  twoTap(T.el.querySelector(".reset"), "Tap again to clear", () => {
    Object.keys(T.answers).forEach(k => delete T.answers[k]);
    store.set(T.cfg.answersKey, {});
    Object.values(T.resetters).forEach(list => list.forEach(f => f()));
    updateScore(tab, false);
  });
});

/* ---------- Resume buttons ---------- */
const resumeLabels = {};
function updateResume(tab){
  const r = resumeLabels[tab]; if (!r) return;
  const T = TABS[tab], idx = T.cards.findIndex(c => c.el.id === store.get(r.posKey, ""));
  r.btn.textContent = idx > 0 && T.cards[idx].group >= 0 ? `Continue ${r.word} ${T.cards[idx].group + 1}` : `Start ${r.word} 1`;
}
function wireResume(tab, btnId, posKey, word){
  const T = TABS[tab], btn = document.getElementById(btnId);
  resumeLabels[tab] = {btn, posKey, word}; updateResume(tab);
  btn.addEventListener("click", () => {
    const i = T.cards.findIndex(c => c.el.id === store.get(posKey, ""));
    T.detour = false;
    if (i > 0 && T.cards[i].group >= 0) go(tab, i); else goGroup(tab, 0);
  });
}
wireResume("study", "resume", "cr2-pos", "Day");
wireResume("py", "pyResume", "cr2-py-pos", "Lesson");

document.addEventListener("keydown", e => {
  if (storySheet.classList.contains("open")){ if (e.key === "Escape") closeStory(); return; }
  if (e.target.closest && e.target.closest("input, textarea")) return;
  if (sheet.classList.contains("open")){ if (e.key === "Escape") closeSheet(); return; }
  if (e.target.closest && e.target.closest("button") && (e.key === " " || e.key === "Enter")) return;
  if (["ArrowDown","PageDown","j"," "].includes(e.key)){ e.preventDefault(); next(); }
  if (["ArrowUp","PageUp","k"].includes(e.key)){ e.preventDefault(); prev(); }
});

/* ---------- Hash links ----------
   #day-5 or #d5-7 open Study, #py-3 or #p3-2 open Python, #feed opens the Feed,
   #study and #python open a tab at its current card. */
function fromHash(hash){
  const id = (hash || location.hash).slice(1);
  if (id === "feed" || id === "study" || id === "python"){
    switchTab(id === "python" ? "py" : id);
    if (id === "feed" && F.current === 0) requestAnimationFrame(() => go("feed", 1));
    return true;
  }
  for (const tab of ["study","py"]){
    const idx = TABS[tab].cards.findIndex(c => c.el.id === id);
    if (idx >= 0 && /^(day-\d+|d\d+-\d+|py-\d+|p\d+-\d+|start|finish|py-start|py-finish|portfolio|portfolio-2|stories|ready)$/.test(id)){ switchTab(tab); go(tab, idx); return true; }
  }
  return false;
}
window.addEventListener("hashchange", () => { if (ignoreHash){ ignoreHash = false; return; } fromHash(); });

renderStories();
/* ---------- Job-ad readiness: progress per skill that entry-level ads ask for ----------
   Mastered = share of the skill's questions answered right on two separate days (box 3+).
   A CV line unlocks at 30% mastered, or once a linked lab is ticked in the portfolio. */
const SKILLS = [
  {name:"SIEM and log analysis", s:[22,23,24,25,33], p:[7,8,14], kinds:["triage","kql"], pf:["logons","scan-watch","wireshark"], need:["logons","scan-watch"],
   did:"Investigated failed logons and a port scan in Windows Security and firewall logs in a home lab, and practised KQL in Microsoft's Log Analytics demo.",
   know:"Understand SIEM triage, Windows logon events and KQL for Microsoft Sentinel and Defender."},
  {name:"Identity and access", s:[3,4,29,30,31], decks:["cloud-iam","e8-admin","e8-mfa","owasp-a01","owasp-a07"], pf:["perm-proof"], need:["perm-proof"],
   did:"Tested Linux file permissions and least privilege with separate user accounts in a home lab.",
   know:"Understand authentication, MFA strength, least privilege, Conditional Access and role-based access in Microsoft Entra ID and Azure."},
  {name:"Incident response", s:[6,7,26,27,32], kinds:["incident"], pf:["playbook"], need:["playbook"],
   did:"Wrote a phishing incident playbook aligned to NIST SP 800-61 Rev. 3.",
   know:"Understand incident response under NIST SP 800-61 Rev. 3, using lessons from incidents such as Medibank and Change Healthcare."},
  {name:"Networking", s:[8,9,10,11,12,13,14], pf:["lab-ips","fw-rule","nmap"], need:["lab-ips","nmap"],
   did:"Built an isolated VirtualBox lab with static addressing and scanned it with Nmap.",
   know:"Understand TCP/IP, subnetting, DNS, DHCP, TLS and firewall rules."},
  {name:"Cloud security", p:[13], s:[29,30,31], kinds:["cloud"], pf:["py-s3"], need:["py-s3"],
   did:"Wrote a Python (boto3) script that flags S3 buckets without a bucket-level public access block.",
   know:"Understand the cloud shared responsibility model, identity-based access and cloud logging in AWS and Azure."},
  {name:"Vulnerability management", s:[2,5,11,22,34], decks:["owasp-a03","e8-patch-apps","e8-patch-os"], pf:["nmap"],
   know:"Understand vulnerability prioritisation with CVSS, EPSS and CISA KEV, and the Essential Eight patching timeframes."},
  {name:"Scripting", p:[1,2,3,4,5,6,7,8,9,10,11,12,13,14], pf:["py-detector","py-s3"], need:["py-detector"],
   did:"Wrote a Python tool that finds brute-force sources in SSH logs using regex, Counter and argparse.",
   know:"Write Python for security tasks such as log parsing, regex, hashing and port checks."},
  {name:"Frameworks and compliance", kinds:["e8","law","owasp"], pf:[],
   know:"Understand the Essential Eight, OWASP Top 10:2025, NIST CSF 2.0 and Australian and NZ breach notification duties."}
];
function skillKeys(sk){
  const keys = [];
  (sk.s || []).forEach(n => DAYS[n-1] && DAYS[n-1].quiz.forEach((q, i) => keys.push(`s:${n}.${i}`)));
  (sk.p || []).forEach(n => PY_LESSONS[n-1] && PY_LESSONS[n-1].quiz.forEach((q, i) => keys.push(`p:${n}.${i}`)));
  FEED_DECKS.filter(d => d.qs && ((sk.kinds || []).includes(d.kind) || (sk.decks || []).includes(d.id))).forEach(d => d.qs.forEach((q, n) => keys.push(checkKey(d, n))));
  return keys;
}
function skillScore(sk){
  const keys = skillKeys(sk), n = keys.length || 1;
  const mastered = keys.filter(k => srs[k] && srs[k].box >= 3).length, answered = keys.filter(k => srs[k]).length;
  const labs = sk.pf.filter(id => portfolio[id]).length;
  // A "did" line needs its labs ticked; a "know" line needs 30% mastered. Nothing claims work you haven't ticked.
  const did = !!sk.did && (sk.need || []).every(id => portfolio[id]);
  return {pct:Math.round(mastered / n * 100), answered:Math.round(answered / n * 100), labs, line: did ? sk.did : mastered / n >= .3 ? sk.know : null};
}
const readyCard = addCard("study", {c:"var(--w2)", id:"ready", label:"Readiness", group:-3, at:S.cards.findIndex(c => c.el.id === "finish"), html:`
  <div class="tag"><span>Job-ad readiness</span>Skills entry-level ads ask for</div>
  <h2>How ready are you?</h2>
  <ul class="skills" id="skillList"></ul>
  <div class="row"><button class="btn" id="cvCopy" type="button">Copy CV lines</button></div>
  <textarea id="cvText" readonly hidden aria-label="CV lines"></textarea>
  <p class="small" id="cvMsg" aria-live="polite">Bars show the share of each skill's questions you've got right on two separate days.</p>`});
function renderReady(){
  document.getElementById("skillList").innerHTML = SKILLS.map(sk => { const r = skillScore(sk);
    return `<li><span>${esc(sk.name)}</span><span class="pct">${r.pct}%${r.labs ? ` · ${r.labs} lab${r.labs === 1 ? "" : "s"}` : ""}</span><span class="meter" role="img" aria-label="${r.pct}% mastered"><i style="width:${Math.max(r.pct, 2)}%"></i></span></li>`; }).join("");
}
document.getElementById("cvCopy").addEventListener("click", () => {
  const lines = SKILLS.map(sk => skillScore(sk).line).filter(Boolean).map(l => "• " + l);
  const msg = document.getElementById("cvMsg");
  if (!lines.length){ msg.textContent = "Nothing ready yet. An “understand” line unlocks at 30% mastered; a hands-on line unlocks when you tick its labs in the portfolio."; return; }
  const text = lines.join("\n");
  const done = () => { msg.textContent = `Copied ${lines.length} line${lines.length === 1 ? "" : "s"}. Edit them into your own words before you use them.`; };
  const show = () => { const t = document.getElementById("cvText"); t.hidden = false; t.value = text; t.select(); msg.textContent = "Copying isn't allowed here, so the lines are selected above. Long-press to copy."; };
  try { navigator.clipboard.writeText(text).then(done, show); } catch(e){ show(); }
});
renderReady();
// A link to a card or tab wins; otherwise reopen the last tab used.
const savedTab = store.get("cr2-tab", "study");
switchTab(TABS[savedTab] ? savedTab : "study");
if (initialHash) requestAnimationFrame(() => setTimeout(() => fromHash(initialHash), 50));
else if (active === "feed") requestAnimationFrame(() => go("feed", 1));


// Content version, shown in the Days sheet.
(function(){
  const v = window.CONTENT_VERSION, el = document.getElementById("bkLast");
  if (v && el) el.insertAdjacentHTML("afterend", `<p class="small">Content version ${esc(String(v.version))}${v.date ? " · " + esc(v.date) : ""}</p>`);
})();

// After an update: say what changed, once. Also ask the browser to keep this app's data (Android can clear it otherwise).
(function(){
  const v = window.CONTENT_VERSION;
  if (v && v.version){
    const seen = +store.get("cr2-seen-version", 0);
    if (seen && seen < v.version) setTimeout(() => toast(`Updated to content version ${v.version}${v.note ? ": " + v.note : ""}`), 800);
    store.set("cr2-seen-version", v.version);
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
})();
