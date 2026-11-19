# Cyber Bunker: handoff for Claude Code

## What this is
Cyber Bunker is a mobile-first study app (an installable web app) that swipes like Instagram Reels. I use it instead of scrolling Instagram. It began as a single-file prototype (kept in `archive/`); the main file is now `index.html`.

## Current state
- Three tabs: **Training Bunker** (a 35-day plan in Levels B1 to B5), **The Archive** (an endless feed of OWASP Threat Codex decks, incident files, quick-fire cards and more) and **Terminal** (Python lessons with code you can edit and run in the browser).
- Content lives in `content/study.json`, `content/feed.json` and `content/python.json`. Progress is saved in localStorage under `cr2-` keys.
- The look follows `design/wasteland-archive.md`.
- `tools/check.js` checks the content and scripts. `tools/bump-version.js` raises the content version so installed phones get the update banner.

## Accuracy rules (these were already corrected; keep them)
- SMS codes count as MFA but are weak (SIM swapping, phishing). Authenticator-app codes are also phishable. FIDO2 keys, passkeys and certificate-based smart-card logins are phishing-resistant (Kane decided 19 November 2026).
- Ransomware can hit confidentiality too (double extortion), not only integrity and availability.
- Offline backups restore encrypted data but do nothing about stolen data.
- Threat x Vulnerability x Impact is a simplified teaching model, not an official formula.
- Threats can be internal or accidental, not only external.
- An open port is not automatically a vulnerability.
- VMs reduce risk but don't guarantee isolation; vulnerable VMs go on internal or host-only networks, never bridged.
- Hardening means changing insecure defaults.
- NIST SP 800-61 Rev. 3 (April 2025) organises incident response around the CSF 2.0 functions; the four-phase cycle is from Rev. 2.
- OWASP Top 10:2025: A01 Broken Access Control, A07 Authentication Failures, A09 Security Logging and Alerting Failures.
- Use Australian/NZ spelling.

## Style rules
- No em dashes anywhere in the content.
- Short, plain sentences. One idea per card.
- Keep the existing dark design, week colours and fonts.

## Background on me
I've completed a Level 6 Diploma in Cloud Computing and Cyber Security and work in IT support. I'm rebuilding my fundamentals from beginner level before moving to intermediate and advanced, and I'm job hunting for cyber and cloud security roles.
