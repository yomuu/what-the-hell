# Cyber Reels: handoff for Claude Code

## What this is
`cyber-reels.html` is a single-file, mobile-first study app: a full-screen vertical feed (CSS scroll-snap) that swipes like Instagram Reels. It covers Stage 1 (beginner) of a 28-day cybersecurity refresher plan. I want to use it instead of scrolling Instagram.

## Current state
- 28 days, 4 weeks (Week 1 security fundamentals, Week 2 networking, Week 3 operating systems and crypto, Week 4 hands-on analysis).
- Each day has only 4 cards: topic title, "Learn", "Remember" (key point) and one multiple-choice "Check" with an explanation.
- All content lives in the `DAYS` array in the inline script. Progress and answers are saved in localStorage (`cr-answers`, `cr-pos`), wrapped in try/catch.
- Day picker sheet, week colours, progress bar, resume button, keyboard support, `#day-N` hash links.

## What I want: make it a lot longer
Expand every day so a session feels like a proper reels binge, roughly 10 to 15 cards per day:
1. Split each topic into several short "learn" cards (one idea per card, 2 to 4 sentences each).
2. Add a "real world" card per day (a breach, incident or everyday example).
3. Add a "try it" card per day with a command, a lab step or a Python snippet where it fits (my lab: VirtualBox, Kali, a Windows target, internal network only).
4. Add a "myth vs fact" card where there's a common misconception.
5. Replace the single check with 3 to 5 quiz questions per day, mixed difficulty, each with an explanation.
6. Add a short "recap" card at the end of each day and a longer review on days 7, 14, 21 and 27.
7. Keep everything in one HTML file with no external requests except Google Fonts.

Consider moving the content into a separate JSON or JS data file if that makes it easier to grow, as long as it still works as a static page.

## Accuracy rules (these were already corrected; keep them)
- SMS codes count as MFA but are weak (SIM swapping, phishing). Authenticator-app codes are also phishable. Only FIDO2 keys and passkeys are phishing-resistant.
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
