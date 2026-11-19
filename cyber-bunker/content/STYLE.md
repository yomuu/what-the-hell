# Cyber Bunker writing style guide

Every agent that writes or edits content follows this guide. The reader studies on a phone, often in short, interrupted bursts, and should understand each card on the first read. Each rule notes the research it comes from (see Sources at the end).

## 1. Plain language
- Write in plain English, even though the reader has technical training. Specialists also understand plain English faster [1][2].
- Aim for a reading age of about 9 to 12 for explanations. Technical terms are allowed, but define them (see section 4) [1][2].
- Use "you" and a conversational, friendly tone. People learn better from conversational wording than formal wording [4].
- Use active voice and verbs, not abstract nouns: "Attackers stole passwords", not "Credential theft occurred" [2].
- No idioms or figures of speech [2].
- NZ spelling (organisation, analyse, defence). No em dashes anywhere.

## 2. Sentences
- One idea per sentence [2].
- Hard limit: 25 words per sentence. Short is fine: cards are naturally brief, so there is no minimum average (decided 18 November 2026). Comprehension stays above 90% at an average of about 14 words, and drops below 10% at 43 words [1].
- Put the key point first, then the detail [2].
- Cut filler: "basically", "essentially", "it is important to note that", "in order to".
- Unpack stacked nouns: "credential-based remote access exploitation" becomes "attackers logged in remotely with stolen passwords".

## 3. Cards (built for small screens)
- One idea per card. If a card needs "also" or "another thing", split it. Learning is better in short, learner-paced segments [4].
- Learn cards: 2 to 4 sentences, about 60 words maximum. Difficult text is read more slowly on a phone, and earlier text scrolled off-screen strains working memory [3].
- Every card makes sense on its own, without the card before it. Phone reading gets interrupted [3].
- Cut anything that doesn't serve the card's one idea: no background trivia, no decoration. Removing extra material is one of the strongest learning effects [4].
- No bold and no asterisks in card text (decided 18 November 2026). Signal the key idea by putting it first in the card instead.

## 4. Terms and consistency
- Start each day or deck with a short "Key terms" card defining the 2 to 4 new terms it uses, before the lessons. Write one "Term: definition" per line (separated by a newline); the app shows them as a list with every term highlighted. Learning names and characteristics of key concepts first helps people learn the main material [4].
- Define every technical term on first use in a day or deck, even if the Key terms card covered it: "multi-factor authentication (MFA), which means proving who you are in two different ways".
- After that, use one term consistently. Don't switch between "attacker", "threat actor" and "adversary" in the same deck.
- Spell out acronyms on first use per day or deck, except very common ones (IP, URL, PC).
- Keep the master list in content/glossary.json: term, plain one-line definition, preferred spelling.

## 5. Quiz questions
Based on the research-backed multiple-choice item-writing guidelines [5]:
- The question tests one specific, important idea. No trivia, no trick questions, no opinion-based questions.
- Keep reading to a minimum. Put the shared wording in the question, not repeated in every option.
- Word questions positively. Avoid NOT and EXCEPT. If one is unavoidable, write it in capitals.
- Use 3 or 4 options. All are believable mistakes a learner might actually make. No joke options.
- Keep options similar in length, grammar and content type, and make sure they don't overlap. A correct option that is longer or more detailed than the rest gives the answer away.
- Don't give clues: avoid absolute words like "always" and "never" in wrong options, and don't repeat words from the question in the correct option only.
- Don't use "All of the above". Use "None of the above" rarely, if ever.
- List options in a logical order, such as numerical or shortest to longest.

## 6. Quiz explanations
- Always explain; never show only "Correct" or "Incorrect". Explanations that address the learner's own response or the key concept beat right/wrong feedback for applying knowledge to new questions and for retention [6].
- Start with the answer and one sentence on why it's right.
- Then say why each wrong option is wrong, one short sentence each, so whichever option the learner picked gets a specific explanation [6]. To keep the card on one phone screen, wrong options that share a reason can share one sentence ("Not integrity or availability: restoring clean copies fixes both."). Keep the whole explanation to about 45 words.
- If a wrong option is a common trap, say so: "This is the trap answer because..."

## 7. Incident files
- Lead with what happened in one plain sentence.
- Use the labelled fields (ENTRY POINT, IMPACT, ACTOR) for facts, one or two short lines each.
- Round numbers sensibly ("about 9.7 million people") and always say what the number counts.

## 8. Labels and themed names
- The first time a user meets a themed name (Training Bunker, The Archive, Codex, Levels B1 to B4, Bunker Radio), show a plain label beside it: "Codex: OWASP Top 10 risks".
- Buttons say exactly what happens: "Check answer", "Next card", "Show lesson".
- Error and empty messages say what happened and what to do next.

## 9. Never
- Never change a fact, figure, date, name, source, code or command while editing for style. If something looks wrong, flag it for content-reviewer.
- Never pad content to make it look longer.

## Checks to run after editing
Run `node tools/style-check.js` from the project root; it does the measurable checks below.
- List every sentence over 25 words and every learn card over 60 words, and fix them.
- Report the average sentence length per section (no minimum; nothing over 25 words).
- Search for em dashes, "All of the above", and NOT or EXCEPT in lower case inside questions.
- Check that no correct option is clearly the longest in its question.

## Sources (checked 18 November 2026)
1. GOV.UK content principles: conventions and research background (PDF). https://assets.publishing.service.gov.uk/media/5a7c43cded915d7d70d1daf0/GOV.UK_content_principles.pdf
   Supporting sentence-length figures: Inside GOV.UK, "Sentence length: why 25 words is our limit". https://insidegovuk.blog.gov.uk/2014/08/04/sentence-length-why-25-words-is-our-limit/
2. GOV.WALES, Introduction to writing for GOV.WALES (based on GOV.UK research). https://www.gov.wales/introduction-writing-govwales
3. Nielsen Norman Group, Reading content on mobile devices (Moran, 2016). https://www.nngroup.com/articles/mobile-content/
4. Mayer, R. E. (2020), Multimedia principles summary (PDF). https://ugc.futurelearn.com/uploads/files/7d/d6/7dd6188d-c343-4311-b064-ac98d2c95abc/Multimedia_Principles._R._E._Mayer__2020.pdf
5. Haladyna, T. M. and Downing, S. M. (1989), multiple-choice item-writing rules, summarised by Penn State Schreyer Institute (PDF). https://www.schreyerinstitute.psu.edu/pdf/Multiple_Choice_Item_Writing_Rules.pdf
6. Ryan, A. et al. (2020), Beyond right or wrong: more effective feedback for formative multiple-choice tests, Perspectives on Medical Education 9, 307 to 313 (PDF). https://minerva-access.unimelb.edu.au/server/api/core/bitstreams/03a2d8aa-4701-5e4a-aef2-e12b48eda55e/content
