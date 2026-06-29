# Gap Analysis — Generated Lesson Plan (June 2026)

**Sample audited:** *Chapter 2: Why Did Seema Fall? & Sentences — Session 1 of 1*
(Grade 2, English) — a real PDF produced by the live app.
**Method:** four parallel specialist reviews — PDF/rendering, framework adherence,
pedagogy, and readability/house-style — cross-checked against
`docs/framework/4-lesson-plan-framework-v1.1.md`, `docs/house-style-and-readability.md`,
`app.js`, and `api/generate.js`.

**Headline:** The plan's structure, story, and Tamil-Nadu grounding are genuinely
strong — but the PDF is **partly unusable as delivered** because of (1) output
truncation that drops the last third of the plan, (2) right-edge text clipping,
and (3) a blank first page. Almost every finding traces to **~8 fixable causes**.

---

## Severity summary

| Theme | Critical | High | Medium | Low |
|---|---|---|---|---|
| Generation / completeness | 1 (truncation) | 2 | 1 | — |
| PDF rendering | 3 | 1 | 2 | 1 |
| Pedagogy (content) | 1 | 4 | 4 | 2 |
| House style / readability | — | 2 | 2 | 1 |

---

## A. Generation & completeness (root cause: token truncation)

The plan **ends mid-story** — no Part Three (After Class), **no Evening Post**, no
Takeaway, no Today's Learning Chart, no Core/Full reference lists. This is the
single most damaging issue: the teacher receives an unfinished plan.

| # | Finding | Severity | Root cause | Fix (target) |
|---|---|---|---|---|
| A1 | Part Three, Evening Post, Takeaway, Learning Chart all missing; story cut mid-sentence | **Critical** | `maxOutputTokens: 20000` is too low for a *thinking* model (`gemini-2.5-flash` spends budget on internal reasoning), so output stops mid-plan with `finishReason: MAX_TOKENS` | **Backend:** raise `maxOutputTokens` (~32k–40k) and/or cap thinking budget; **and treat `truncated` as a hard failure** — auto-retry/continue instead of showing a partial plan |
| A2 | Partial plan is shown as if finished | **High** | Frontend renders `markdown` even when backend already flagged `truncated: true` | **Frontend/backend:** block or auto-continue on truncation; never surface a half plan |
| A3 | "Grade 1" appears in a Grade 2 plan (≥2 places) | **High** | Grade injected once in the user message, never anchored in the system prompt/addendum → model drifts | **Prompt:** echo `d.grade` into the addendum + forbid references to any other grade + self-check |
| A4 | Misconceptions table specified only as "a table for the three misconceptions" | **Medium** | Prompt under-specifies columns | **Prompt:** require 3 columns — *what the child says / why it happens / what the teacher does* |

---

## B. PDF rendering (root cause: capture-width + CSS leakage + page-break)

| # | Finding | Severity | Root cause | Fix (target) |
|---|---|---|---|---|
| B1 | **Every wide line clipped ~10–12% off the right edge**; tables run off-page | **Critical** | `html2canvas.windowWidth:800` ≠ `.pdf-doc` 760px; no `table-layout:fixed`, no `word-break`; tables size to content and overflow | **CSS/JS:** match capture width to doc width; `box-sizing:border-box; overflow:hidden`; `table-layout:fixed; width:100%`; `overflow-wrap:break-word` on cells/paragraphs |
| B2 | **Misconceptions table collapses to one column**, "WHAT THE CHILD SAYS" repeated above each row | **Critical** | Mobile `@media(max-width:600px)` rules (`td{display:block}` + `td::before{content:attr(data-label)}`) fire inside the PDF capture | **CSS:** scope mobile rules to exclude `.pdf-doc`; force `display:table-cell` + `td::before{content:none}` + visible `thead` inside `.pdf-doc` |
| B3 | **Page 1 fully blank; header pushed ~60% down page 2** (~32% of the document is dead space — violates the "little whitespace / printout-friendly" requirement) | **Critical** | `.pdf-doc .plan-session{break-before:page}` fires before the first/only session; `:first-of-type` reset defeated by the `.pdf-head` sibling | **CSS:** break only *between* sessions — `.plan-session + .plan-session{page-break-before:always}` |
| B4 | Ordered-list steps all render "1." instead of 1,2,3… | **High** | `mdToHtml` starts a new `<ol>` whenever bullet sub-lists interleave numbered steps; each restarts at 1 | **JS:** emit `<ol start="N">` and/or nest bullet sub-lists inside the `<li>` |
| B5 | Lines sliced mid-glyph at page seams | **Medium** | Only `h1/h2/table/blockquote` have `break-inside:avoid` | **CSS:** add `break-inside:avoid` to `li, p, tr` in `.pdf-doc` |
| B6 | Overlapping/garbled text ("flashca…ful'/'empty'…rds") | **Medium** | Text overprint during capture (related to width/layout) | **CSS/JS:** resolve with the B1 width fix; re-test |
| B7 | PDF is image-only — no selectable/searchable text, ~2 MB / 5 pages | **Low (architectural)** | html2canvas rasterizes the DOM by design | **Optional:** move to a text-based HTML→PDF (server-side Puppeteer / WeasyPrint) for a real text layer — larger change |

---

## C. Pedagogy (content quality — mostly prompt-level)

Overall verdict from the curriculum review: **weak-to-adequate** — well-structured
and the story embeds the target words well, but overloaded and incomplete for a
single Grade 2 period.

| # | Finding | Severity | Fix (target) |
|---|---|---|---|
| C1 | **Cognitive overload** — synonyms, antonyms, nouns, verbs/past tense, sentences *and* spelling in one ~32-min period | **Critical** | **Prompt/product:** cap focal skills per Grade 2 period (1–2); treat the rest as spiral review (see decision below) |
| C2 | Grade pitch inconsistent (labelled G2, framed as G1 review) | **High** | **Prompt:** lock grade; raise rigour to true Grade 2 |
| C3 | Learning outcomes not measurable ("Appreciate…", "identify common spelling patterns") | **High** | **Prompt:** require observable verbs + success thresholds |
| C4 | No closure/plenary, no exit ticket, no homework | **High** | **Prompt:** mandate a closure + one measurable exit ticket per outcome (also recovered by fixing truncation) |
| C5 | Assessment not aligned to outcomes; no success criteria | **High** | **Prompt:** require an outcome→assessment mapping |
| C6 | Timing unrealistic, no buffers/closure | **Medium** | **Prompt:** total minutes must equal the period length; include slack + closure |
| C7 | Differentiation thin; "Socratic" question too abstract for age 7; spelling under-taught | **Medium** | **Prompt:** tiered scaffolds, age-calibrated open questions, EAL/Tamil bridge |
| C8 | ICSE alignment asserted, not evidenced | **Low** | **Prompt:** cite the specific ICSE Grade 2 English competency per outcome |

---

## D. House style & readability

| # | Finding | Severity | Fix (target) |
|---|---|---|---|
| D1 | House-style colour banners (Blue/Green/Purple parts) and cue colours (vocabulary/story/fact) not applied — uniform navy only | **High** | **CSS:** implement the palette from `house-style §1`, or simplify the house-style doc to match what's rendered |
| D2 | Per-page footer (chapter, session, version, date) missing | **Medium** | **CSS:** add a running footer |
| D3 | House-style doc says "generous white space" but the school explicitly wants **little** whitespace | **Medium** | **Doc:** reconcile — state the print-efficiency rule explicitly |
| D4 | Masthead tagline punctuation crowds | **Low** | **CSS/doc:** standardise masthead |

---

## Recommended fix order

**Phase 1 — make the PDF usable again (rendering + completeness, all unambiguous):**
1. A1/A2 — fix truncation: raise token budget + block/auto-continue on `truncated`.
2. B1 — right-edge clipping (width + table-layout + word-break).
3. B3 — remove blank page 1 / header gap (break only between sessions).
4. B2 — stop mobile table CSS leaking into the PDF.
5. B4/B5 — list numbering + page-seam protection.
6. A3 — grade-lock in the prompt.

**Phase 2 — content quality via the prompt:**
7. A4, C2–C6 — measurable outcomes, closure + exit ticket, AfL mapping, grade rigour, misconception columns, timing self-check.

**Phase 3 — product decision + polish:**
8. C1 — lesson scoping (one focal skill per session vs the current "cover everything").
9. D1–D4 — house-style colour layer, footer, doc reconciliation.
10. B7 — (optional) selectable-text PDF via server-side rendering.

**Key files:** `app.js` (PDF builder, `mdToHtml`, html2canvas opts), `styles.css`
(`.pdf-doc`, `.pdf-stage`, mobile table rules, page-break rules), `api/generate.js`
(prompt addendum, grade injection, `maxOutputTokens`, truncation handling).
