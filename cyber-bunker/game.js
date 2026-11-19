/* Breach Drill: an off-duty game. Play the attacker (Red team) or the night-shift defender (Blue team)
   against Ironbark Freight, a made-up company. Every technique, log line and response is real practice:
   red moves carry their MITRE ATT&CK IDs, blue alerts use real Windows Event IDs and log sources.
   Loaded after app.js and uses its helpers (store, esc, live, TABS, rail, tabsBar). */
(function(){
"use strict";
const KEY = "cr2-drill";
const stats = Object.assign({redBest:0, blueBest:0, redWins:0, blueWins:0, played:0}, (typeof store !== "undefined" && store.get(KEY, {})) || {});
const saveStats = () => { try { store.set(KEY, stats); } catch(e){} };
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const h = s => esc(String(s));

/* ---------- Red team data ---------- */
const CONTROLS = {
  mfa:   {name:"Phishing-resistant MFA", what:"FIDO2 keys or passkeys on every login, so a stolen or guessed password isn't enough."},
  patch: {name:"Patched VPN", what:"The VPN appliance gets security fixes within 48 hours."},
  edr:   {name:"EDR in block mode", what:"Endpoint detection and response, plus LSA protection, stops tools reading LSASS memory."},
  svc:   {name:"Strong service-account passwords", what:"Long random passwords, or managed service accounts, so cracked tickets give nothing."},
  clean: {name:"No passwords in scripts", what:"Secrets live in a vault, not in files on shares."},
  laps:  {name:"Unique local admin passwords (LAPS)", what:"Every computer has its own local Administrator password, so one hash doesn't open the others."},
  seg:   {name:"Network segmentation", what:"Workstations can't open Remote Desktop or SMB connections to servers."},
  egress:{name:"Egress and DNS filtering", what:"Servers can only reach approved destinations, and DNS goes through a filtering resolver."},
  casb:  {name:"Cloud upload blocking", what:"Uploads to unapproved file-sharing sites are blocked."},
  siem:  {name:"Watched SIEM", what:"Logs are collected and someone watches the alerts, so every move makes 25% more noise."}
};
const STAGES = [
  {name:"Get in", tactic:"Initial Access", techs:[
    {name:"Phishing page", att:"T1566", desc:"Email staff a fake login page and catch a password.", stop:"mfa", noise:10},
    {name:"Password spray", att:"T1110.003, then T1133", desc:"Try a few common passwords against every VPN account, then log in with any that work.", stop:"mfa", noise:20},
    {name:"Exploit the VPN", att:"T1190", desc:"Use a published flaw in the internet-facing VPN appliance.", stop:"patch", noise:15}]},
  {name:"Grab credentials", tactic:"Credential Access", techs:[
    {name:"Dump LSASS memory", att:"T1003.001", desc:"Read password hashes from the memory of the Windows login process.", stop:"edr", noise:25},
    {name:"Kerberoasting", att:"T1558.003", desc:"Request service tickets, then crack the service-account passwords offline.", stop:"svc", noise:10},
    {name:"Search file shares", att:"T1552.001", desc:"Look for passwords saved in scripts and config files.", stop:"clean", noise:5}]},
  {name:"Reach the file server", tactic:"Lateral Movement", techs:[
    {name:"Pass the hash", att:"T1550.002", desc:"Reuse the local Administrator hash to log in to other computers.", stop:"laps", noise:15},
    {name:"Remote Desktop", att:"T1021.001", desc:"Log in to the file server over Remote Desktop with stolen credentials.", stop:"seg", noise:20},
    {name:"Admin shares", att:"T1021.002", desc:"Copy a tool to the server's ADMIN$ share and run it as a service.", stop:"seg", noise:15}]},
  {name:"Get the data out", tactic:"Exfiltration", techs:[
    {name:"Upload to file sharing", att:"T1567.002", desc:"Upload the files to a cloud file-sharing site.", stop:"casb", noise:15},
    {name:"DNS tunnelling", att:"T1048", desc:"Hide the data inside DNS queries to a domain you control.", stop:"egress", noise:20},
    {name:"Over your C2 channel", att:"T1041", desc:"Send the data slowly over your existing command-and-control (C2) connection.", stop:"egress", noise:10}]}
];

/* ---------- Blue team data ---------- */
// ok: stops the attack. disrupt: hurts the business. Every option says why.
const ALERTS = [
  {stage:0, title:"Failed logons", src:"Windows Security log", log:"Event ID 4625 (failed logon) x180 in 10 minutes\n90 different accounts, 2 tries each\nAll from 203.0.113.50", att:"T1110.003 Password Spraying", opts:[
    {t:"Block 203.0.113.50 and check those accounts for a successful logon", ok:1, why:"A password spray tries a few common passwords on many accounts to dodge lockouts. Block the source, then look for an Event ID 4624 success from it."},
    {t:"Disable all 90 accounts", ok:1, disrupt:1, why:"It stops the attack, but 90 staff are locked out over guesses that probably failed. Blocking the source does the job without the damage."},
    {t:"Close it: failed logons happen all day", why:"Two tries each across 90 accounts from one address is a spray, not typos."}]},
  {stage:0, title:"Phishing email", src:"Mail gateway and sign-in logs", log:"40 staff got \"Overdue invoice\" from paymnets-ironbark.co\n3 clicked the link\n4 minutes later: sign-in for j.wong from a new country", att:"T1566 Phishing", opts:[
    {t:"Revoke j.wong's sessions, reset the password and purge the email", ok:1, why:"The new-country sign-in right after a click suggests a stolen password. Revoking sessions throws the attacker out, and purging stops more clicks."},
    {t:"Email staff to be more careful", why:"Good later, but the attacker is already signed in as j.wong."},
    {t:"Close it: the mail gateway will catch the next one", why:"It already missed this one, and an account may be taken over."}]},
  {stage:0, title:"MFA prompts", src:"Entra ID sign-in logs", log:"25 MFA push requests to r.patel, 01:10 to 01:25\nThe last one was approved\nr.patel is not on shift", att:"T1621 Multi-Factor Authentication Request Generation", opts:[
    {t:"Revoke r.patel's sessions, reset the password and call them", ok:1, why:"Push bombing wears the user down until they tap Approve. The attacker has the password, so reset it and end the session."},
    {t:"Close it: the user approved the sign-in", why:"An approval at 01:25 after 24 ignored prompts is fatigue, not consent."},
    {t:"Turn off MFA for r.patel so the prompts stop", disrupt:1, why:"That hands the attacker an account with only a password in the way."}]},
  {stage:0, title:"VPN appliance", src:"VPN appliance logs", log:"New local admin account: support2\nUnknown files in the web folder\nA critical patch came out last week, not yet installed", att:"T1190 Exploit Public-Facing Application", opts:[
    {t:"Take the VPN offline, patch it, then reset VPN credentials", ok:1, why:"An unpatched critical flaw plus a new admin account means compromise. Remove access, patch, and treat stored credentials as stolen."},
    {t:"Delete support2 and carry on", why:"The flaw is still open, and the unknown files may be a web shell that lets them straight back in."},
    {t:"Close it: someone in IT probably made the account", why:"Check, don't assume. No change ticket and an unpatched critical flaw point to an attacker."}]},
  {stage:1, title:"LSASS access", src:"EDR alert on WS-114", log:"rundll32.exe opened lsass.exe memory\nCommand line used comsvcs.dll MiniDump\nUser: j.wong", att:"T1003.001 LSASS Memory", opts:[
    {t:"Isolate WS-114 and reset every account that logged in to it", ok:1, why:"A MiniDump of LSASS captures password hashes of everyone who has logged in there since it last restarted. Isolate the host and treat those accounts as stolen."},
    {t:"Delete the dump file", why:"The attacker has probably copied it already. The hashes are still valid until the passwords change."},
    {t:"Restart WS-114", why:"A restart wipes memory evidence, but the stolen hashes still work."}]},
  {stage:1, title:"Service tickets", src:"Domain controller Security log", log:"Event ID 4769 (Kerberos service ticket requested)\nUser s.ford asked for 40 service accounts in 2 minutes\nTicket encryption: RC4 (0x17)", att:"T1558.003 Kerberoasting", opts:[
    {t:"Reset the service-account passwords to long random ones and investigate s.ford", ok:1, why:"Kerberoasting cracks service tickets offline. Long random passwords make cracking hopeless, and s.ford's account needs checking."},
    {t:"Close it: service tickets are normal", why:"One user asking for 40 tickets at once, with weak RC4 encryption, is a classic Kerberoasting sign."},
    {t:"Turn off Kerberos", disrupt:1, why:"Windows domains depend on Kerberos. This breaks logons for everyone."}]},
  {stage:1, title:"File share search", src:"File server audit log", log:"s.ford opened 3,000 files in 10 minutes\nMostly .ps1 and .config files on IT shares\nUsually opens about 20 files a day", att:"T1552.001 Credentials In Files", opts:[
    {t:"Disable s.ford for now, then rotate any passwords found in those files", ok:1, why:"Mass reads of scripts and config files means someone is hunting for saved passwords. Stop the account, then change what was exposed."},
    {t:"Delete the scripts", why:"The attacker may already have read them, and the passwords inside still work."},
    {t:"Close it: staff read files all day", why:"3,000 script and config files in 10 minutes isn't normal work for this user."}]},
  {stage:2, title:"Remote Desktop", src:"FS-01 Security log", log:"Event ID 4624, logon type 10 (Remote Desktop)\nFS-01 at 02:13, from WS-114\nAccount: svc-backup (never used Remote Desktop before)", att:"T1021.001 Remote Desktop Protocol", opts:[
    {t:"Disable svc-backup, reset its password and isolate WS-114 and FS-01", ok:1, why:"A service account doing an interactive Remote Desktop logon at 02:13 is someone using stolen credentials."},
    {t:"Close it: it's a service account", why:"Service accounts run jobs. They don't log in over Remote Desktop."},
    {t:"Restart FS-01", why:"The attacker keeps the password and can log straight back in."}]},
  {stage:2, title:"Local admin logons", src:"Windows Security logs", log:"Event ID 4624, logon type 3 (network), NTLM\nSame local Administrator account on 12 workstations in 5 minutes\nAll from WS-114", att:"T1550.002 Pass the Hash", opts:[
    {t:"Isolate WS-114 and give every computer its own local admin password (LAPS)", ok:1, why:"One shared local Administrator password means one hash opens every computer. Unique passwords stop the reuse."},
    {t:"Change the shared Administrator password to a new shared one", why:"Still shared: the attacker only needs to steal the new hash once."},
    {t:"Close it: admins log in to computers", why:"Twelve workstations in five minutes from one source is automated movement, not an admin at work."}]},
  {stage:2, title:"New service", src:"FS-01 System log", log:"Event ID 7045 (new service installed)\nService updsvc runs C:\\Windows\\Temp\\u.exe\nFile copied over the ADMIN$ share from WS-114", att:"T1021.002 SMB/Windows Admin Shares", opts:[
    {t:"Isolate FS-01 and WS-114 and start incident response", ok:1, why:"A service running from Temp, pushed over ADMIN$, is a classic way to run tools remotely. Contain both ends."},
    {t:"Delete u.exe and move on", why:"The attacker still has the credentials that let them push it."},
    {t:"Close it: it's an update service", why:"Legitimate services rarely run from Windows\\Temp, and this one arrived over ADMIN$ from a workstation."}]},
  {stage:3, title:"Large upload", src:"Web proxy", log:"18 GB uploaded from FS-01, 01:00 to 04:00\nDestination: a personal file-sharing site\nFS-01 has never used this site", att:"T1567.002 Exfiltration to Cloud Storage", opts:[
    {t:"Block the site, isolate FS-01 and start a breach assessment", ok:1, why:"Data is leaving. Stop it, contain the server, and check whether personal information makes it a notifiable breach."},
    {t:"Ask the site to delete the files later", why:"The attacker has copies already. Stop the leak first."},
    {t:"Close it: probably a backup", why:"Backups go to the approved service, not a personal site in the middle of the night."}]},
  {stage:3, title:"Odd DNS", src:"DNS resolver logs", log:"40,000 queries from FS-01 overnight\nLong random subdomains of one domain, e.g.\nq7f3a9e1c2.data.cdn-sync.example\nDomain registered 2 days ago", att:"T1048 Exfiltration Over Alternative Protocol", opts:[
    {t:"Block the domain, isolate FS-01 and start a breach assessment", ok:1, why:"Long random subdomains to a brand-new domain is DNS tunnelling: data hidden in the queries."},
    {t:"Close it: DNS traffic is normal", why:"Normal DNS doesn't send 40,000 random names to one new domain."},
    {t:"Restart the DNS server", why:"FS-01 just keeps sending once it's back."}]},
  {stage:3, title:"Beaconing", src:"Firewall logs", log:"FS-01 sends HTTPS to 198.51.100.23 every 60 seconds\nAll night, and each upload is bigger than the last\nNo business reason for that address", att:"T1041 Exfiltration Over C2 Channel", opts:[
    {t:"Block 198.51.100.23, isolate FS-01 and start a breach assessment", ok:1, why:"Regular check-ins with growing uploads is a C2 channel moving data out."},
    {t:"Close it: it's HTTPS, so it's safe", why:"Encryption hides what's sent, not who it's sent to. Attackers use HTTPS too."},
    {t:"Watch it for another week", why:"Every minute more data leaves."}]}
];
const BENIGN = [
  {title:"Failed logons", src:"Windows Security log", log:"Event ID 4625 x5 for m.lee at 08:02\nThen a success at 08:03 from her usual laptop\nShe changed her password yesterday", opts:[
    {t:"Close it as benign", ok:1, why:"A few fails then a success, on her own laptop, right after a password change: she typed the old one."},
    {t:"Disable m.lee's account", disrupt:1, why:"Nothing points to an attacker, and now she can't work."},
    {t:"Isolate her laptop", disrupt:1, why:"Too much for a typo. Look at the pattern first."}]},
  {title:"Big upload", src:"Web proxy", log:"4 GB uploaded from BKP-01 at 01:00\nDestination: the company's approved cloud backup\nSame time and size every night", opts:[
    {t:"Close it as benign", ok:1, why:"The approved backup job, on its normal schedule. Knowing what normal looks like saves you from false alarms."},
    {t:"Block the backup service", disrupt:1, why:"That stops your own backups, which you need if ransomware hits."},
    {t:"Isolate BKP-01", disrupt:1, why:"Nothing unusual here, and the backup now fails."}]},
  {title:"New account", src:"Windows Security log", log:"Event ID 4720 (user account created) at 10:15\nCreated by the IT manager\nMatches an approved change ticket for a new starter", opts:[
    {t:"Close it as benign", ok:1, why:"A new account with an approved ticket is normal onboarding. Without the ticket, it would need checking."},
    {t:"Delete the new account", disrupt:1, why:"The new starter can't log in on day one."},
    {t:"Reset the IT manager's password", disrupt:1, why:"There's no sign the account is compromised."}]},
  {title:"PowerShell", src:"EDR", log:"PowerShell ran on the IT admin's laptop\nDuring the monthly patching window\nSigned script from the company's software repository", opts:[
    {t:"Close it as benign", ok:1, why:"Signed scripts from your own repository during patching are expected. Context turns an alert into normal work."},
    {t:"Isolate the admin's laptop", disrupt:1, why:"Patching stops, and nothing suggests an attack."},
    {t:"Block PowerShell company-wide", disrupt:1, why:"IT needs PowerShell to manage systems. This breaks admin work everywhere."}]}
];
const TRACK = ["Outside", "Inside", "Has credentials", "On the file server", "Data gone"];

/* ---------- Sheet ---------- */
const sheetEl = document.createElement("div");
sheetEl.className = "sheet drill"; sheetEl.id = "drillSheet";
sheetEl.setAttribute("role", "dialog"); sheetEl.setAttribute("aria-modal", "true"); sheetEl.setAttribute("aria-labelledby", "drillTitle");
sheetEl.innerHTML = `<div class="panel"><header><h3 id="drillTitle" tabindex="-1">Breach Drill</h3><button class="x" id="drillClose" type="button">Close</button></header><div id="drillBody"></div><p class="sr" id="drillLive" aria-live="polite"></p></div>`;
document.body.appendChild(sheetEl);
const body = sheetEl.querySelector("#drillBody"), say = t => { sheetEl.querySelector("#drillLive").textContent = t; };
let opener = null, game = null;

function inertAll(on){
  Object.entries(TABS).forEach(([k, T]) => T.el.inert = on || k !== active);
  rail.inert = on; tabsBar.inert = on;
  const u = document.getElementById("updateBar"); if (u) u.inert = on;
}
function open(e){
  opener = (e && e.currentTarget) || document.activeElement;
  sheetEl.classList.add("open"); inertAll(true);
  history.pushState({drill:1}, "");
  game ? render() : menu();
  sheetEl.querySelector("#drillTitle").focus({preventScroll:true});
}
function hide(){
  sheetEl.classList.remove("open"); inertAll(false);
  if (opener && opener.isConnected) opener.focus({preventScroll:true});
}
// Registered in index.html before app.js, so Back closes the game without moving the cards.
window.DRILL_POP = () => { if (!sheetEl.classList.contains("open")) return false; hide(); return true; };
sheetEl.querySelector("#drillClose").addEventListener("click", () => { if (history.state && history.state.drill) history.back(); else hide(); });
sheetEl.addEventListener("click", e => { if (e.target === sheetEl) sheetEl.querySelector("#drillClose").click(); });
document.addEventListener("click", e => { const b = e.target.closest && e.target.closest("[data-drill]"); if (b){ e.preventDefault(); open({currentTarget:b}); } });

function focusFirst(sel){ const el = body.querySelector(sel); if (el){ if (!el.hasAttribute("tabindex")) el.tabIndex = -1; el.focus({preventScroll:true}); el.scrollIntoView({block:"nearest"}); } }

/* ---------- Menu ---------- */
function menu(){
  game = null;
  body.innerHTML = `<p class="dr-intro">Ironbark Freight runs a small Windows network: a VPN, staff laptops, a file server and a domain controller. Tonight, pick a side.</p>
    <div class="dr-pick">
      <button class="dr-side red" type="button" data-side="red"><b>Red team: break in</b><span>Get in, grab credentials, reach the file server and get the data out before the noise gets you caught.</span><small>Best ${stats.redBest} · wins ${stats.redWins}</small></button>
      <button class="dr-side blue" type="button" data-side="blue"><b>Blue team: hold the line</b><span>Work an 8-alert night shift. Stop the attacker, but don't wreck the business over false alarms.</span><small>Best ${stats.blueBest} · wins ${stats.blueWins}</small></button>
    </div>
    <p class="small">A training simulation with a made-up company. Every technique, log and response is real practice for SOC and security interviews.</p>`;
  body.querySelectorAll("[data-side]").forEach(b => b.addEventListener("click", () => b.dataset.side === "red" ? startRed() : startBlue()));
}

/* ---------- Red team ---------- */
function startRed(){
  // Hidden defences: 4 or 5 controls, maybe a SIEM, and always at least one way through each stage.
  let ctl = shuffle(Object.keys(CONTROLS).filter(k => k !== "siem")).slice(0, 4 + (Math.random() < .5 ? 1 : 0));
  for (let full; (full = STAGES.find(st => st.techs.every(t => ctl.includes(t.stop)))); ){ const stops = [...new Set(full.techs.map(t => t.stop))]; ctl = ctl.filter(c => c !== pick(stops)); }
  if (Math.random() < .5) ctl.push("siem");
  game = {side:"red", ctl, stage:0, noise:0, known:new Set(), turns:0, log:[], path:[], msg:"You're outside Ironbark's network. Pick your first move.", ok:null};
  stats.played++; saveStats(); render();
  focusFirst(".dr-msg");
}
const mult = () => game.ctl.includes("siem") ? 1.25 : 1;
function redMove(i){
  const g = game, st = STAGES[g.stage], t = i === "recon" ? null : st.techs[i];
  g.turns++;
  if (!t){
    const n = Math.round(5 * mult()); g.noise += n;
    st.techs.forEach(x => g.known.add(x.stop)); if (g.ctl.includes("siem")) g.known.add("siem");
    const found = st.techs.filter(x => g.ctl.includes(x.stop)).map(x => CONTROLS[x.stop].name);
    g.msg = `Recon: ${found.length ? "they have " + [...new Set(found)].join(" and ") : "nothing here stops these three moves"}${g.ctl.includes("siem") ? ". Their SIEM is watched, so you're noisier" : ""}. Noise +${n}.`; g.ok = null;
  } else if (g.ctl.includes(t.stop)){
    const n = Math.round(t.noise * 1.5 * mult()); g.noise += n; g.known.add(t.stop);
    g.msg = `Blocked: ${t.name} failed against ${CONTROLS[t.stop].name}. Failed attempts are loud. Noise +${n}.`; g.ok = false;
  } else if (Math.random() < .85){
    const n = Math.round(t.noise * mult()); g.noise += n;
    g.path.push({stage:st.name, tech:t}); g.stage++;
    g.msg = g.stage < STAGES.length ? `${t.name} worked. Noise +${n}. Next: ${STAGES[g.stage].name.toLowerCase()}.` : `${t.name} worked. The data is out.`; g.ok = true;
  } else {
    const n = Math.round(t.noise * mult()); g.noise += n;
    g.msg = `${t.name} didn't land this time (nobody bit, or the timing was off). Noise +${n}.`; g.ok = false;
  }
  if (g.noise >= 100) return endRed(false);
  if (g.stage >= STAGES.length) return endRed(true);
  render(); say(g.msg); focusFirst(".dr-msg");
}
function endRed(won){
  const g = game, score = won ? Math.max(0, 100 - g.noise) + 50 : 0;
  if (won){ stats.redWins++; stats.redBest = Math.max(stats.redBest, score); } saveStats();
  const defs = g.ctl.map(c => `<li><b>${h(CONTROLS[c].name)}</b>: ${h(CONTROLS[c].what)}</li>`).join("");
  const route = g.path.map(p => `<li>${h(p.stage)}: ${h(p.tech.name)} (${h(p.tech.att)}). Would have been stopped by: ${h(CONTROLS[p.tech.stop].name)}.</li>`).join("");
  game.done = true;
  body.innerHTML = `<div class="dr-end ${won ? "win" : "lose"}"><b>${won ? "Data out. You win." : "Caught."}</b> ${won ? `Score ${score} (lower noise scores more).` : `The noise hit ${Math.min(g.noise, 999)}. Ironbark's team spotted you at stage ${g.stage + 1}: ${h(STAGES[g.stage].name.toLowerCase())}.`}</div>
    <h4>Debrief: Ironbark's defences</h4><ul class="dr-list">${defs}</ul>
    ${route ? `<h4>Your route, and what would have stopped it</h4><ul class="dr-list">${route}</ul>` : ""}
    <p class="small">The blue-team lesson: every attack needs a whole chain to work. One well-placed control breaks the chain.</p>
    <div class="row"><button class="btn" type="button" data-again>Play again</button><button class="btn ghost" type="button" data-menu>Switch sides</button></div>`;
  wireEnd(startRed); say(won ? "You win." : "Caught."); focusFirst(".dr-end");
}

/* ---------- Blue team ---------- */
function startBlue(){
  game = {side:"blue", turn:0, max:8, pos:0, disrupt:0, score:0, right:0, cur:null, answered:null, history:[]};
  stats.played++; saveStats(); nextAlert();
}
function nextAlert(){
  const g = game; g.turn++; g.answered = null;
  const real = Math.random() < .7 || g.turn === 1;
  const a = real ? pick(ALERTS.filter(x => x.stage === g.pos)) : pick(BENIGN);
  g.cur = Object.assign({real}, a, {order:shuffle(a.opts.map((o, i) => i))});
  render(); say(`Alert ${g.turn} of ${g.max}: ${a.title}`); focusFirst(".dr-alert");
}
function blueAnswer(i){
  const g = game, a = g.cur, o = a.opts[i];
  let out;
  if (o.disrupt) g.disrupt++;
  if (a.real){
    if (o.ok){ g.right++; g.score += o.disrupt ? 5 : 10; const was = g.pos; g.pos = Math.max(0, g.pos - 1); out = was > 0 ? "Blocked, and the attacker is pushed back a step." : "Blocked at the door."; }
    else { g.pos++; out = g.pos >= 4 ? "Missed. The data is gone." : `Missed. The attacker moves on: ${TRACK[g.pos].toLowerCase()}.`; }
  } else {
    if (o.ok){ g.right++; g.score += 5; out = "Right call: a false alarm, closed fast."; }
    else out = "A false alarm, and the business felt that.";
  }
  if (o.disrupt) out += ` Disruption ${g.disrupt} of 3.`;
  g.answered = {i, out, good:!!o.ok && !o.disrupt};
  g.history.push({title:a.title, real:a.real, att:a.att, good:!!o.ok, disrupt:!!o.disrupt, best:a.opts.find(x => x.ok && !x.disrupt).t});
  render(); say(out); focusFirst(".dr-result");
}
function blueNext(){
  const g = game;
  if (g.pos >= 4) return endBlue("lost");
  if (g.disrupt >= 3) return endBlue("fired");
  if (g.turn >= g.max) return endBlue("won");
  nextAlert();
}
function endBlue(how){
  const g = game, won = how === "won", score = won ? g.score + (g.pos === 0 ? 20 : 0) : 0;
  if (won){ stats.blueWins++; stats.blueBest = Math.max(stats.blueBest, score); } saveStats();
  const head = won ? `<b>Shift over. You held the line.</b> Score ${score}.${g.pos === 0 ? " The attacker is fully evicted: bonus 20." : ` The attacker is still ${TRACK[g.pos].toLowerCase()}, so hand over to the day shift.`}`
    : how === "fired" ? `<b>Shift over: too much disruption.</b> Three overreactions, and the business pulled the plug. Knowing normal matters as much as spotting bad.`
    : `<b>Breach.</b> The data left the building. Every missed alert let the attacker take another step.`;
  const rows = g.history.map(x => `<li class="${x.good && !x.disrupt ? "ok" : "miss"}"><b><span class="dmk" aria-hidden="true">${x.good && !x.disrupt ? "✓" : "✗"}</span> ${h(x.title)}</b>${x.real ? ` <span class="lvl">${h(x.att)}</span>` : ` <span class="lvl">false alarm</span>`}<span>Best response: ${h(x.best)}</span></li>`).join("");
  game.done = true;
  body.innerHTML = `<div class="dr-end ${won ? "win" : "lose"}">${head}</div><h4>Shift log</h4><ol class="dr-list debrief-like">${rows}</ol>
    <div class="row"><button class="btn" type="button" data-again>Play again</button><button class="btn ghost" type="button" data-menu>Switch sides</button></div>`;
  wireEnd(startBlue); say(won ? "You held the line." : "Shift over."); focusFirst(".dr-end");
}
function wireEnd(again){
  body.querySelector("[data-again]").addEventListener("click", again);
  body.querySelector("[data-menu]").addEventListener("click", () => { menu(); focusFirst(".dr-intro"); });
}

/* ---------- Render ---------- */
function meter(label, val, max, cls){
  const pct = Math.min(100, Math.round(val / max * 100));
  return `<div class="dr-meter ${cls || ""}"><span>${label}</span><div class="dr-bar" role="img" aria-label="${label} ${val} of ${max}"><i style="width:${pct}%"></i></div><span>${val}/${max}</span></div>`;
}
function render(){
  const g = game;
  if (!g) return menu();
  if (g.done) return;
  if (g.side === "red"){
    const st = STAGES[g.stage];
    const known = [...g.known].filter(k => g.ctl.includes(k));
    body.innerHTML = `<div class="dr-hud"><div class="dr-stage">Stage ${g.stage + 1} of 4 · ${h(st.name)} <span class="lvl">${h(st.tactic)}</span></div>${meter("Noise", g.noise, 100, g.noise >= 70 ? "hot" : "")}</div>
      <p class="dr-msg ${g.ok === true ? "good" : g.ok === false ? "bad" : ""}" tabindex="-1">${h(g.msg)}</p>
      <div class="dr-moves">${st.techs.map((t, i) => { const blocked = g.known.has(t.stop) && g.ctl.includes(t.stop);
        return `<button class="dr-move${blocked ? " blocked" : ""}" type="button" data-m="${i}"><b>${h(t.name)}</b><span>${h(t.desc)}</span><small>${h(t.att)} · noise +${Math.round(t.noise * mult())}${blocked ? " · they have " + h(CONTROLS[t.stop].name) : ""}</small></button>`; }).join("")}
        <button class="dr-move recon" type="button" data-m="recon"><b>Recon first</b><span>Scan and look around to see which of these moves they can stop.</span><small>Noise +${Math.round(5 * mult())}</small></button></div>
      ${known.length ? `<p class="small">Known defences: ${known.map(k => h(CONTROLS[k].name)).join(", ")}.</p>` : ""}
      <div class="row"><button class="btn ghost" type="button" data-quit>Give up</button></div>`;
    body.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => redMove(b.dataset.m === "recon" ? "recon" : +b.dataset.m)));
  } else {
    const a = g.cur, ans = g.answered;
    body.innerHTML = `<div class="dr-hud"><div class="dr-stage">Alert ${g.turn} of ${g.max} · score ${g.score}</div>
        <ol class="dr-track" aria-label="Attacker progress: ${TRACK[Math.min(g.pos, 4)]}">${TRACK.map((t, i) => `<li class="${i < g.pos ? "past" : i === g.pos ? "now" : ""}">${t}</li>`).join("")}</ol>
        ${meter("Disruption", g.disrupt, 3, g.disrupt >= 2 ? "hot" : "")}</div>
      <div class="dr-alert" tabindex="-1"><div class="dr-ah">ALERT · ${h(a.title)}</div><div class="where">${h(a.src)}</div><pre class="code">${h(a.log)}</pre></div>
      <p class="dr-q">What do you do?</p>
      <div class="dr-opts">${a.order.map(i => { const o = a.opts[i]; const cls = !ans ? "" : (o.ok && !o.disrupt) ? " right" : i === ans.i ? " wrong" : "";
        return `<button class="opt${cls}" type="button" data-o="${i}"${ans ? ' aria-disabled="true"' : ""}><span>${h(o.t)}</span></button>`; }).join("")}</div>
      ${ans ? `<div class="dr-result ${ans.good ? "good" : "bad"}" tabindex="-1"><b>${h(ans.out)}</b> ${h(a.opts[ans.i].why)}${!a.opts[ans.i].ok || a.opts[ans.i].disrupt ? ` Best: ${h(a.opts.find(x => x.ok && !x.disrupt).t)}.` : ""}${a.real ? ` <span class="lvl">${h(a.att)}</span>` : ` <span class="lvl">False alarm</span>`}</div>
        <div class="row"><button class="btn" type="button" data-next>${g.pos >= 4 || g.disrupt >= 3 || g.turn >= g.max ? "See the shift report" : "Next alert"}</button></div>` : ""}
      <div class="row"><button class="btn ghost" type="button" data-quit>End shift</button></div>`;
    if (!ans) body.querySelectorAll("[data-o]").forEach(b => b.addEventListener("click", () => blueAnswer(+b.dataset.o)));
    const nx = body.querySelector("[data-next]"); if (nx) nx.addEventListener("click", blueNext);
  }
  twoTap(body.querySelector("[data-quit]"), "Tap again to quit", () => { menu(); focusFirst(".dr-intro"); }, say);
}
})();
