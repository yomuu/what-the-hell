# Wasteland Archive design template

A salvaged bunker archive after the collapse: brutalist concrete frames, hazard stripes and monochrome CRT terminals. It's an original style. Don't copy any game or brand: no Fallout names, logos, mascots, Vault-Tec, Pip-Boy, RobCo or their fonts.

The CSS lives at the end of the `<style>` block in `index.html`, under "WASTELAND ARCHIVE". Change tokens there, not colours inline.

## Colour tokens

| Token | Hex | Role | Contrast on bunker black |
|---|---|---|---|
| `--bunker` | #141414 | Card and page background | |
| `--rust` | #2b2722 | Outer frame outline, option and panel fills | |
| `--metal` | #4a463d | Frames and dividers (decorative only) | 1.96 |
| `--breach` | #d4291c | Breach stamp, entry-point border, wrong answers | 3.63: large or bold text and borders only |
| `--amber` | #ffae1a | Header bar, labels, Training Bunker accent, hazard stripes | 9.93 |
| `--phosphor` | #6cff8f | Terminal text, Terminal accent, right answers | 14.33 |
| `--dimgreen` | #4a8f5c | Terminal panel borders | 4.72 |
| `--termbg` | #0d1a10 | Terminal panel background | |
| `--cyan` | #4fd1d9 | The Archive accent, Developing stamp, active filter chip | 10.05 |
| `--bone` | #d9d6cc | Body text | 12.67 |
| `--secondary` | #b8b5ab | Secondary text, impact text | 8.98 |
| `--ash` | #8a877d | Tertiary text, borders of tappable controls (3:1 needed) | 5.13 |
| `--alarm` | #ff6b6b | Small warning text ("Keeps slipping", storage warning, the ✗ mark). Breach red is too dark for small text | about 6 |

Accent per tab: Training Bunker amber, The Archive cyan, Terminal phosphor green. Text on a filled amber, cyan or green button is bunker black.

## Fonts and their roles

Loaded from Google Fonts: IBM Plex Sans (400, 700), IBM Plex Mono (500, 700) and VT323. No other fonts.

| Role | Font |
|---|---|
| Company names and headings | IBM Plex Sans 700, uppercase, letter-spacing -0.01em |
| Body | IBM Plex Sans 400, at least 16px |
| Small labels, tags, buttons, chips, tab labels | IBM Plex Mono 500, uppercase, letter-spacing about 0.1em (filter chips use 0.02em so all five fit at 375px) |
| Stamps | IBM Plex Mono 700, 19px, uppercase. Bold 19px counts as large text, so breach red meets WCAG AA (3:1) |
| Header bar, record bar, footer, counters, terminal panel labels, Python program output | VT323, short text only, never paragraphs. App messages inside the output box (download prompt, offline notices) use Plex Mono |
| Code | IBM Plex Mono |

## Shared language (all tabs)

- **No rounded corners anywhere.**
- **Frames:** every card's content sits in a 4px oxidised-metal border with a 3px rust-brown outline outside it.
- **Hazard stripes:** a 6px amber and black diagonal stripe across the top of each frame, the sheets and the tab bar, and above recap lists.
- **Terminal panels:** code, Python output, quiz results and the record card's CODEX/STATUS panel use terminal black with a dim-green border and phosphor text. Subtle scanlines appear on terminal panels only.
- **CRT flicker:** a brief flicker as each new card settles. It's turned off with prefers-reduced-motion, as is the blinking cursor.
- **The Terminal tab** is a full green-screen console: terminal-black background with scanlines, green frames, green text and green hazard stripes.
- **Focus:** a 3px amber outline on every focusable control.

## Incident card layout (top to bottom)

1. **Header bar**, VT323 amber: "BUNKER ARCHIVE 07" on the left, and the record number ("REC 017") in a small metal-bordered box on the right.
2. **Amber hazard stripe.**
3. **File row:** "INCIDENT FILE · YYYY-MM" (plus region and "New this week" when they apply) in amber IBM Plex Mono on the left. On the right, a stamp: BREACHED (breach red), VERIFIED (amber) or DEVELOPING (cyan), with a 2.5px border, rotated -8 degrees. The row is at least 52px tall, so the rotated stamp never overlaps the company name below it.
4. **Company name**, large.
5. **Entry point** line with a 4px breach-red left border.
6. **Impact** text in secondary colour, then a tap-to-reveal redaction bar hiding the key lesson. It's a button with aria-expanded, at least 48px tall.
7. **Green terminal panel** split in two: CODEX (OWASP category in phosphor green) and STATUS (amber, with a blinking cursor).
8. **Source line** in ash, as small mono text.
9. **Footer** in VT323: "SWIPE ↑ FULL FILE" on the left (the deck's detail cards follow), and a segmented block meter (■□□□□ 1/5) on the right.

Data comes from the incident deck's fields: `date`, `status`, `region`, `entry`, `impact`, `lesson`, `source`, `maps` and `title`.

## Bunker Radio (news wire)

- Opened from the header button on The Archive tab ("Radio · 3" when there are new items). It uses the Days sheet in a radio mode.
- Each item is an intel report: terminal-black panel with scanlines and a dim-green border; an RX row in VT323 (source and NZ time); a NEW marker (bunker black on amber) and an amber left edge for items new since the last visit; the headline in IBM Plex Sans 700; the summary in bone, 16px; tags as small mono labels; a Full article link and an amber Related lesson button.
- **Debrief:** a six-step form (what happened, CIA, way in, recommended steps with up to three ticked and the headline's likely controls tagged Suggested in amber, reporting, one-line lesson) inside the Radio sheet with the headline in bone (not phosphor, because it isn't inside a terminal panel), fieldsets on rust, square checkboxes and radio buttons (amber fill when chosen), and a one-line textarea. The Intel reports / My debriefs toggle uses cyan, the Archive accent, for the selected view. Messages appear in a status line inside the sheet.
- **My debriefs:** each saved debrief is shown as a terminal panel, with your line in phosphor and what happened, CIA, way in, steps and reporting answers in a small list.
- The `--rx` token (#7fbf8f) is the soft phosphor used for labels inside terminal panels.
- Exception: Radio headlines stay in normal case, not uppercase, because they're long publisher headlines (the same exception as quiz questions).

## Reusing the template

Copy the token table and type roles. Build cards as a framed panel with a hazard stripe, put anything machine-like in a terminal panel, keep VT323 to a few words, and check every text colour against its background (AA: 4.5:1 for body text, 3:1 for large text and control borders).
