---
description: Polish all Cyber Bunker writing for clarity, one section at a time, without changing facts.
---

Polish the writing in Cyber Bunker using the copy-editor subagent and content/STYLE.md.

1. Start with a sample only: have copy-editor rewrite Training Bunker Day 1 and one Archive incident file, then show me before-and-after examples and wait for my OK before continuing.
2. Once I approve the sample, run every remaining batch automatically, one after another, without stopping for my input. Work through the rest in this order, one batch at a time: Training Bunker (one level per batch), The Archive (Codex decks, then incident files, then quick-fire cards), Terminal (Python lessons), then every UI label, button, empty state and message.
3. After each batch (still without stopping):
   - Run content-reviewer on the changed content to confirm no facts changed, and resolve anything copy-editor flagged.
   - Run ux-reviewer to check the new text fits on a 375px screen.
   - Commit with a message naming the batch.
   - If a fact needs a decision from me, keep the original wording, add it to a "Needs Kane" list and carry on. If a batch fails, roll it back to the last commit, note it in the "Needs Kane" list and move to the next batch.
4. Finish with a summary: what changed in each section, the glossary size, and anything still flagged for me to decide.
