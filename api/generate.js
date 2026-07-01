// Secure backend: holds the school's Gemini key as a hidden secret and writes
// the lesson plan. Teachers never see or send a key. Deployed as a Vercel
// serverless function. Configure once: Vercel → Settings → Environment
// Variables → GEMINI_API_KEY (and optional GEMINI_MODEL).

var FRAMEWORK = require("./framework.js");

// Grade 1→5 depth ladder (PRD §4): the kind of thinking, story shape, and
// questioning style rise with the grade. Returns plain-language guidance lines.
function gradeGuidance(grade) {
  var g = parseInt((String(grade).match(/\d+/) || [])[0], 10) || 3;
  var verbs = {
    1: "identify, name, match, point to, sort — simple recognition and naming",
    2: "describe, group, compare in simple ways, recall — explaining in their own words",
    3: "explain, classify, demonstrate, organise, use — understanding how and why",
    4: "compare and contrast, apply, arrange, infer — using knowledge in new situations",
    5: "differentiate, justify, evaluate, construct, conclude — reasoning, judging, creating"
  }[g] || "age-appropriate thinking";
  var story = g <= 2 ? "a warm, simple narrative with one clear character and an everyday situation; short sentences, gentle events"
    : g === 3 ? "a fuller narrative with a small problem to solve and a little cause and effect"
    : "a real-world scenario the character reasons through, with choices, consequences, and a problem that needs the chapter's ideas to solve";
  var quest = g <= 2 ? "closed questions with picture or object prompts (e.g. 'Point to the root')"
    : g <= 4 ? "questions with thinking time, and think-pair-share"
    : "open, probing questions that ask children to give reasons and weigh ideas (Socratic style)";
  return { verbs: verbs, story: story, quest: quest };
}

// Grade calibration table (Build Brief Part B section 9): vocabulary count and
// word ceilings per grade. Authoritative for counts. Returns plain numbers.
function gradeCalib(grade) {
  var g = parseInt((String(grade).match(/\d+/) || [])[0], 10) || 3;
  var t = {
    1: { vocab: "4", sentence: 10, story: 140, finale: 220, recap: 70, verb: "recall and naming led" },
    2: { vocab: "4 to 5", sentence: 12, story: 180, finale: 300, recap: 90, verb: "recall plus one compare or sequence" },
    3: { vocab: "5", sentence: 14, story: 220, finale: 360, recap: 110, verb: "add classify or connect" },
    4: { vocab: "5 to 6", sentence: 16, story: 280, finale: 420, recap: 130, verb: "add explain" },
    5: { vocab: "6", sentence: 18, story: 340, finale: 480, recap: 150, verb: "add synthesise" }
  };
  return t[g] || t[3];
}

// App-specific overlay on the Framework above. Encodes the Build Brief Part B
// per-session contract (counts, controlled vocabularies, timing, consistency
// locks, fact verification, anti-padding) adapted to the teacher's chosen
// session count N. The render markers ('## Part One — ...', '### <n> min — ...',
// '### Evening Post') are kept exactly so the existing renderer keeps working.
function addendum(d) {
  var s = d.sessionNo, N = d.sessions;
  var session = "Session " + s + " of " + N;
  var isLast = String(s) === String(N);
  var grade = gradeGuidance(d.grade);
  var cal = gradeCalib(d.grade);
  var storyCeil = isLast ? cal.finale : cal.story;
  return [
    "",
    "=== TASK ===",
    "Write ONE complete, ready-to-teach plan for " + session + ", a 40-minute lesson at",
    "the Enhanced level, in a single reply. Do not ask questions or wait for approval.",
    "Detect the chapter number and name from the attached pages yourself.",
    "",
    "=== GROUND IT IN THE CHAPTER (do not invent) ===",
    "Draw every activity, example, word, story detail, and question from the ATTACHED",
    "chapter only. Add no facts, characters, or content the chapter does not support.",
    "",
    "=== GLOBAL WRITING RULES (apply everywhere) ===",
    "- British and Indian English only: colour, realise, metre, neighbour, programme,",
    "  organise, woollen. Reject American spellings (color, realize, meter).",
    "- Do NOT use em dashes in your sentences. Use a colon, a comma, or two sentences.",
    "- Use only the single ellipsis glyph '…' when you need one. No '...'.",
    "- No stars and no '*' decoration on any label or item, including the Amazing Fact.",
    "- No template artifacts: no '---' rules, no bracketed stubs like '[Image of ...]'.",
    "- ANTI-PADDING: the counts below are targets with floors. Never invent filler to",
    "  hit a number. If the chapter genuinely yields fewer, give the real ones down to",
    "  the floor and add the line: 'Fewer than <N> genuine items exist for this chapter.'",
    "",
    "=== GRADE CALIBRATION (this plan is " + d.grade + ", authoritative) ===",
    "Pitch everything at " + d.grade + "; wherever the text names a grade it must say '" + d.grade + "'.",
    "- New vocabulary words this session: " + cal.vocab + ".",
    "- Maximum sentence length in student-facing text: " + cal.sentence + " words.",
    "- In-class Story ceiling: about " + storyCeil + " words" + (isLast ? " (this is the Story Finale)." : "."),
    "- Evening Post Read More recap ceiling: about " + cal.recap + " words.",
    "- Outcome-verb complexity for this grade: " + cal.verb + ".",
    "- Questioning style for this grade: " + grade.quest + ".",
    "- For Maths, stay within the number range and operations the chapter shows.",
    "",
    "=== CONSISTENCY THREAD AND LOCKS (one chapter, " + N + " sessions) ===",
    "- ONE recurring character (an Indian name, one spelling) in ONE setting with a gentle",
    "  Tamil Nadu lean: introduce in Session 1, develop, resolve in the final session.",
    "- ONE chapter Big Idea: a single sentence reused WORD FOR WORD in the Takeaway chart,",
    "  every Evening Post, and the Chapter Summary.",
    "- ONE definition per vocabulary word: a single clause reused WORD FOR WORD in the",
    "  in-class Vocabulary block, the Evening Post New Words, and the Chapter Summary.",
    "- The Story's Follow-on question is reused VERBATIM as the Evening Post Follow-on.",
    "- Treat earlier-covered content as quick review; never re-teach an earlier session.",
    "",
    "=== OUTPUT FORMAT (exact markers — the app colour-codes them) ===",
    "Line 1:  # Chapter <number>: <name> — " + session,
    "Line 2:  Chapter Progress So Far: <1-2 sentences>" + (String(s) === "1" ? " (omit this line on Session 1)" : ""),
    "Parts as '## ' headings, exactly: '## Part One — Before Class',",
    "  '## Part Two — During Class', '## Part Three — After Class'.",
    "All sub-sections as '### ' headings.",
    "In Part One include a '### Cue Colours Used in This Plan' heading on its own line",
    "  (the app fills the colour key — do not list colours yourself).",
    "Each in-class block as '### <minutes> min — <title>' then the teacher action beneath.",
    "The story as '### The Story — <title>', then short paragraphs.",
    "The Evening Post under a '### Evening Post' heading.",
    "",
    "=== PART ONE — BEFORE CLASS (required sections and counts) ===",
    "- '### Learning Outcomes': EXACTLY 5. Each begins with a different verb from this",
    "  list, no verb repeated: Identify, Name, List, Label, Describe, Distinguish,",
    "  Classify, Sequence, Match, Connect, Compare, Explain, Synthesise, Reflect,",
    "  Appreciate, Commit. Tag EXACTLY ONE '(Thinking)' using a higher-order verb",
    "  (Distinguish, Classify, Connect, Compare, Explain, Synthesise) and EXACTLY ONE",
    "  '(Values)' using Reflect, Appreciate, or Commit. Make each observable.",
    "- '### Prerequisites Check': 3 to 4 bullets.",
    "- '### Anticipated Misconceptions': a table with exact headers 'What the child says |",
    "  Why it happens | What the teacher does'. Target 3 rows, floor 2. Column three names",
    "  a textbook page or a concrete manipulative.",
    "- '### Anticipated Student Questions': target 5, floor 4. Each a real child question",
    "  with a teacher Response of 1 to 3 sentences.",
    "- '### Questioning Technique Guide': a table of EXACTLY 3 rows, bands '1 to 2 Closed",
    "  recall', '3 to 4 Think-Pair-Share', '5 Socratic'. Each row: one example, one technique.",
    "- '### Differentiation': exactly two parts, 'Support (Core)' and 'Extension (Full)'.",
    "- '### Teaching Aids Checklist': a table 'Item | Page or Source | Element served'.",
    "  Target 4 to 6 rows, floor 4. Every 'Element served' names a Part Two block below.",
    "- '### Cue Colours Used in This Plan' (heading only).",
    "- '### Level Note': Enhanced default plus the pacing logic, 2 to 4 sentences.",
    "- '### My Pre-Demo Checklist': EXACTLY 5 yes/no items.",
    "",
    "=== PART TWO — DURING CLASS (40 minutes, Enhanced) ===",
    "Open with the no-skip rule in one sentence (reach the Story and Takeaway even if",
    "short on time; the rest goes home in the Evening Post). Then timed blocks as",
    "'### <minutes> min — <title>', and the PRINTED minutes MUST total exactly 40:",
    "- Prior Knowledge Activation (include a Contingency line): about 5 min.",
    "- Vocabulary Introduction (" + cal.vocab + " words, each with its locked definition): about 3 min.",
    "- Concept Teaching (1 to 2 sub-blocks, moves tied to page numbers): about 14 min.",
    "  Place EXACTLY ONE Amazing Fact (one line) inside Concept Teaching, no extra minutes.",
    "- The Story (set in India, the recurring character): about 7 min. End it with two",
    "  lines: 'Essential question answer:' (1 to 2 sentences) and 'Follow-on question:' (one).",
    "- Assessment for Learning: about 6 min, with EXACTLY 3 modes in this order — Written,",
    "  Oral (Think-Pair-Share), Physical or diagram-based — each with its minutes and a",
    "  stated expected answer.",
    "- Class Activity tied to a NAMED textbook exercise: about 4 min.",
    "- Takeaway with a Takeaway Starter sentence: about 1 min.",
    "Then two short reference lists: '### Core Sequence' (a strict subset, printed minutes",
    "totalling 24 to 30, must keep the Story and Takeaway, Written assessment only) and",
    "'### Full Sequence' (Enhanced plus exactly 2 named extra elements with their minutes).",
    "",
    "=== AMAZING FACT VERIFICATION ===",
    "Prefer a fact stated in the chapter's own pages and cite the page. If external, it",
    "must be verifiable and plain: no unquantified superlatives ('the most', 'the longest')",
    "and no invented numbers; add a short teacher note that it is beyond the textbook.",
    "",
    "=== PART THREE — POST-CLASS ===",
    "- '### Teacher Reflection': EXACTLY 6 questions. Question 6 looks forward to the next",
    "  session" + (isLast ? " (or, this being the final session, to the next chapter)." : ".") ,
    "- '### Evening Post' (paste-ready for parents, plain everyday language) containing:",
    "  Quick Glance (the Big Idea and home task), Home Task, Follow-on Question (the SAME",
    "  question as the Story, verbatim), Read More (the story or context recap within about",
    "  " + cal.recap + " words), New Words (each with its locked definition), Amazing Fact.",
    "",
    "=== NON-NEGOTIABLE ===",
    "The plan is complete ONLY when it ends with Part Three and a full Evening Post; never",
    "stop inside the Story. Output clean Markdown only — no preamble, no sign-off, no filler."
  ].join("\n");
}

// Chapter Summary overlay (PRD §3.1): one revision sheet for the whole chapter —
// a teacher reference half and a child-friendly revision half. Generated as a
// final step after all sessions, so it can reuse their vocabulary, story
// character and misconceptions rather than inventing new ones.
function summaryAddendum(d) {
  var grade = gradeGuidance(d.grade);
  return [
    "",
    "=== TASK ===",
    "Write ONE Chapter Summary for the whole chapter, in a single reply. This is the",
    "final revision sheet after all " + d.sessions + " sessions — not a re-teach.",
    "Do not ask questions or wait for approval.",
    "",
    "=== GROUND IT IN THE CHAPTER (do not invent) ===",
    "Summarise only what the ATTACHED chapter and the earlier sessions below contain.",
    "Reuse the SAME chapter number/name, the SAME vocabulary, the SAME recurring story",
    "character, and the SAME misconceptions already established — add nothing new.",
    "",
    "=== GRADE & DEPTH (this is " + d.grade + ") ===",
    "Pitch the children's half at " + d.grade + ": " + grade.verbs + ".",
    "",
    "=== OUTPUT FORMAT (exact markers — the app colour-codes them) ===",
    "Line 1:  # Chapter <number>: <name> — Chapter Summary",
    "Then TWO halves, each a '## ' heading.",
    "'## For the Teacher' with these '### ' sub-sections, in order:",
    "  '### The Big Idea' — 2-3 sentences on what the whole chapter teaches.",
    "  '### Key Points' — a tight bullet list of the main ideas across all sessions.",
    "  '### Words to Know' — a 2-column table 'Word | What it means'.",
    "  '### Watch for These' — the chapter's 3 common misconceptions as short bullets.",
    "  '### The Story So Far' — one short paragraph recapping the character's journey.",
    "'## For the Children' (simple words a child of this grade can read), in order:",
    "  '### What We Learned' — 4-6 'I can ...' bullets in very simple language.",
    "  '### My New Words' — each key word with a one-line, kid-friendly meaning.",
    "  '### Quick Check' — 3-4 easy questions a child can answer from memory.",
    "  '### Remember This' — one or two warm, encouraging takeaway lines.",
    "",
    "=== QUALITY BAR ===",
    "- Keep it to about one page — concise revision, not a fresh lesson.",
    "- Warm, simple, encouraging tone; the children's half must be readable by a child",
    "  of this grade and usable by a parent at home.",
    "- Keep the Tamil Nadu / Coimbatore flavour consistent with the sessions.",
    "",
    "=== NON-NEGOTIABLE ===",
    "Output clean Markdown only — no preamble, no sign-off, no filler."
  ].join("\n");
}

function summaryUserMessage(d) {
  var lines = [
    "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
    "Grade: " + d.grade,
    "Subject: " + d.subject,
    "Total Sessions: " + d.sessions,
    "Generate: the Chapter Summary for the whole chapter. The chapter pages are attached."
  ];
  if (d.chapterNumber || d.chapterName) {
    lines.push(
      "The teacher has confirmed the chapter as " +
      (d.chapterNumber ? "Chapter " + d.chapterNumber : "this chapter") +
      (d.chapterName ? ": " + d.chapterName : "") +
      ". Use exactly that in the title — do not re-detect or change it."
    );
  }
  if (d.prior && String(d.prior).trim()) {
    lines.push(
      "",
      "=== ALL SESSIONS OF THIS CHAPTER (already written) ===",
      "Base the summary on these: reuse their chapter number/name, vocabulary, story",
      "character and misconceptions. Do not introduce anything new.",
      String(d.prior).slice(0, 24000),
      "=== END SESSIONS ==="
    );
  }
  return lines.join("\n");
}

// Mind-map overlay (PRD §3.8 / §8.3). One call returns a structured outline the
// app draws into two maps: a Chapter Map (pure content, four-level tree) and one
// Daily Map per session (topic + 3-4 ideas).
function mapAddendum(d) {
  return [
    "",
    "=== TASK ===",
    "Produce the mind-map content for this chapter as a structured outline, in one",
    "reply. Two parts: a Chapter Map (pure content) and Daily Maps (one per session).",
    "Do not ask questions or wait for approval.",
    "",
    "=== GROUND IT IN THE CHAPTER (do not invent) ===",
    "Use only ideas from the ATTACHED chapter and the sessions below. Add no new facts.",
    "",
    "=== CHAPTER MAP (content only — NO sessions, NO teaching order, NO story) ===",
    "A four-level tree of the chapter's ideas and how they connect:",
    "  Level 1 = the chapter (its title).",
    "  Level 2 = EXACTLY 4 numbered primary branches naming the chapter's main strands",
    "    (reuse the chapter's actual strand names, not generic words).",
    "  Level 3 = sub-nodes under each branch (2 to 4 each), key terms or examples.",
    "  Level 4 = short detail bubbles under a pointer (0 to 2 each), only where useful.",
    "Every label SHORT — 1 to 4 words, child-friendly, readable on its own.",
    "",
    "=== DAILY MAPS (one per session) ===",
    "For each of the " + d.sessions + " sessions: the day's topic (2-4 words) and 3 to 4",
    "key ideas (each 2-5 words) that mirror what that session teaches.",
    "",
    "=== OUTPUT FORMAT (exact — the app draws the maps from this) ===",
    "# Chapter Map: <chapter title>",
    "## 1. <branch>",
    "- <pointer>",
    "  - <detail>",
    "- <pointer>",
    "## 2. <branch>",
    "(continue for every branch)",
    "",
    "# Daily Maps",
    "## Session 1: <day topic>",
    "- <key idea>",
    "- <key idea>",
    "- <key idea>",
    "## Session 2: <day topic>",
    "(continue for all " + d.sessions + " sessions)",
    "",
    "=== NON-NEGOTIABLE ===",
    "Output ONLY this outline as clean Markdown — no preamble, no explanation, no extra",
    "prose. Number the branches ('## 1. '). Indent detail bubbles with two spaces."
  ].join("\n");
}

function mapUserMessage(d) {
  var lines = [
    "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
    "Grade: " + d.grade,
    "Subject: " + d.subject,
    "Total Sessions: " + d.sessions,
    "Generate: the mind-map outline for the whole chapter. The chapter pages are attached."
  ];
  if (d.chapterNumber || d.chapterName) {
    lines.push(
      "The teacher has confirmed the chapter as " +
      (d.chapterNumber ? "Chapter " + d.chapterNumber : "this chapter") +
      (d.chapterName ? ": " + d.chapterName : "") +
      ". Use exactly that chapter name in the title."
    );
  }
  if (d.prior && String(d.prior).trim()) {
    lines.push(
      "",
      "=== ALL SESSIONS OF THIS CHAPTER (already written) ===",
      "Use these for the Daily Maps (one per session, in order) and to stay consistent",
      "with the chapter's vocabulary. The Chapter Map itself stays content-only.",
      String(d.prior).slice(0, 24000),
      "=== END SESSIONS ==="
    );
  }
  return lines.join("\n");
}

function userMessage(d) {
  var lines = [
    "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
    "Grade: " + d.grade,
    "Subject: " + d.subject,
    "Total Sessions: " + d.sessions,
    "Generate: Session " + d.sessionNo + " of " + d.sessions + ". The chapter pages are attached."
  ];
  if (d.chapterNumber || d.chapterName) {
    lines.push(
      "The teacher has confirmed the chapter as " +
      (d.chapterNumber ? "Chapter " + d.chapterNumber : "this chapter") +
      (d.chapterName ? ": " + d.chapterName : "") +
      ". Use exactly that in the title — do not re-detect or change it."
    );
  }
  if (d.prior && String(d.prior).trim()) {
    lines.push(
      "",
      "=== EARLIER SESSIONS OF THIS CHAPTER (already written) ===",
      "Use the SAME chapter number/name and the SAME story character and Tamil Nadu",
      "setting as below, continuing the story forward (do not restart it). Do not repeat",
      "content already covered — move the chapter ahead for Session " + d.sessionNo + ".",
      String(d.prior).slice(0, 8000),
      "=== END EARLIER SESSIONS ==="
    );
  }
  return lines.join("\n");
}

// One Gemini round-trip. Builds the body (systemInstruction = FRAMEWORK +
// addendum; contents = userMessage [+ optional extraInstruction for a retry]
// followed by the inline file parts), POSTs, and returns a normalised result.
// On any transport/JSON failure it returns ok:false with an errorMessage so the
// caller decides how to surface it. Privacy: never logs the chapter or the plan.
async function callGemini(key, model, d, extraInstruction) {
  // Same file-part building as before: the user message first, then each file
  // inlined as base64. A retry adds a short steering note after the user message.
  // d.mode swaps the prompt: "summary" → Chapter Summary, "map" → mind-map
  // outline, anything else → a session plan.
  var isSummary = d.mode === "summary";
  var isMap = d.mode === "map";
  var parts = [{ text: isSummary ? summaryUserMessage(d) : isMap ? mapUserMessage(d) : userMessage(d) }];
  if (extraInstruction) {
    parts.push({ text: extraInstruction });
  }
  var files = Array.isArray(d.files) ? d.files : [];
  for (var i = 0; i < files.length; i++) {
    if (files[i] && files[i].data) {
      parts.push({ inlineData: { mimeType: files[i].mimeType || "application/octet-stream", data: files[i].data } });
    }
  }

  var body = {
    systemInstruction: { parts: [{ text: FRAMEWORK + "\n\n" + (isSummary ? summaryAddendum(d) : isMap ? mapAddendum(d) : addendum(d)) }] },
    contents: [{ role: "user", parts: parts }],
    // gemini-2.5-flash is a thinking model. Left uncapped it can think for 100s+
    // (a single call hit 142s in testing) and blow past Vercel's 60s limit. With
    // the deeper Part B prompt AND a large image chapter, a 6000-token thinking
    // budget could consume the whole output budget and return NO answer text
    // ("No plan text came back"). So: trim thinking to 3000 (the prompt is highly
    // structured, so heavy free reasoning is not needed) and raise the output cap
    // to 24000 so there is ample room for the full plan after thinking. Net: each
    // call is faster and reliably emits the plan.
    generationConfig: { temperature: 0.5, maxOutputTokens: 24000, thinkingConfig: { thinkingBudget: 3000 } }
  };

  var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
    encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

  try {
    var gres = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    var raw = await gres.text();
    var json;
    try { json = JSON.parse(raw); } catch (e) { json = null; }

    if (!gres.ok) {
      var m = (json && json.error && json.error.message) || ("Gemini request failed (" + gres.status + ").");
      return { ok: false, status: gres.status, text: "", finishReason: null, errorMessage: m, blockReason: null };
    }
    if (json && json.promptFeedback && json.promptFeedback.blockReason) {
      return { ok: true, status: gres.status, text: "", finishReason: null, errorMessage: null, blockReason: json.promptFeedback.blockReason };
    }
    var cand = json && json.candidates && json.candidates[0];
    // Join only the answer parts (defensively skip any "thought" parts so a
    // model's reasoning can never bleed into the plan text).
    var text = cand && cand.content && cand.content.parts
      ? cand.content.parts.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ""; }).join("") : "";
    // Degenerate-loop safety AT THE SOURCE: a normal one-session plan is ~12-14k
    // chars. If the model ran away (seen intermittently at 200k-400k chars), do
    // NOT return the giant string — it would make a huge broken PDF. Fail cleanly
    // so the handler surfaces a friendly "Make again".
    if (text.length > 42000) {
      return { ok: false, status: gres.status, text: "", finishReason: cand && cand.finishReason, errorMessage: "The plan came out garbled. Please tap \"Make again\".", blockReason: null };
    }
    return { ok: true, status: gres.status, text: text, finishReason: cand && cand.finishReason, errorMessage: null, blockReason: null };
  } catch (err) {
    return { ok: false, status: 0, text: "", finishReason: null, errorMessage: "Couldn't reach Google to write the plan. Please try again in a moment.", blockReason: null };
  }
}

// One Claude (Anthropic Messages API) round-trip. Raw HTTPS — no SDK, matching
// the zero-dependency style of the rest of the backend. Returns the SAME
// normalised shape as callGemini { ok, status, text, finishReason, errorMessage,
// blockReason } so every caller and quality gate works unchanged. Privacy: never
// logs the chapter or the plan.
//
// Notes for Opus 4.8: send NO temperature / top_p / top_k / budget_tokens (all
// rejected with a 400). Use adaptive thinking + output_config.effort for depth.
// stop_reason is mapped to Gemini-style finishReason: "end_turn"/"stop_sequence"
// → "STOP" (a clean finish the gates accept), "max_tokens" stays itself (so the
// gate flags it as truncated), "refusal" is surfaced as a soft error so the
// dispatcher can fall back to Gemini.
async function callClaude(key, model, d, extraInstruction) {
  var isSummary = d.mode === "summary";
  var isMap = d.mode === "map";
  var systemText = FRAMEWORK + "\n\n" +
    (isSummary ? summaryAddendum(d) : isMap ? mapAddendum(d) : addendum(d));
  var userText = isSummary ? summaryUserMessage(d) : isMap ? mapUserMessage(d) : userMessage(d);

  // Text first (matching Gemini's order), then each chapter page. Small PDFs
  // arrive as application/pdf (Claude reads them as documents); big ones were
  // shrunk to JPEGs in the browser (image blocks). A cache breakpoint on the
  // final page block lets an immediate retry of the same piece reuse the upload.
  var content = [{ type: "text", text: userText }];
  if (extraInstruction) { content.push({ type: "text", text: extraInstruction }); }
  var files = Array.isArray(d.files) ? d.files : [];
  var lastFileIdx = -1;
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (!f || !f.data) { continue; }
    var mt = f.mimeType || "";
    if (mt.indexOf("image/") === 0) {
      content.push({ type: "image", source: { type: "base64", media_type: mt, data: f.data } });
    } else {
      // application/pdf (or unknown) → document block.
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: f.data } });
    }
    lastFileIdx = content.length - 1;
  }
  if (lastFileIdx >= 0) { content[lastFileIdx].cache_control = { type: "ephemeral" }; }

  // effort controls how deeply Opus thinks. Vercel Hobby caps each function at
  // 60s, so "medium" (the default) keeps a single piece reliably under that;
  // ANTHROPIC_EFFORT can raise or lower it without a code change.
  var effort = process.env.ANTHROPIC_EFFORT || "medium";
  var body = {
    model: model,
    max_tokens: 32000,
    // FRAMEWORK is identical across every piece of every chapter, so cache it;
    // the per-session addendum is a separate, uncached block after it.
    system: [
      { type: "text", text: FRAMEWORK, cache_control: { type: "ephemeral" } },
      { type: "text", text: systemText.slice(FRAMEWORK.length) }
    ],
    messages: [{ role: "user", content: content }],
    thinking: { type: "adaptive" },
    output_config: { effort: effort }
  };

  try {
    var ares = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify(body),
      // Never let a slow model blow past Vercel's 60s function limit: abort a few
      // seconds short so the caller can surface a clean, retryable message.
      signal: (typeof AbortSignal !== "undefined" && AbortSignal.timeout) ? AbortSignal.timeout(55000) : undefined
    });
    var raw = await ares.text();
    var json;
    try { json = JSON.parse(raw); } catch (e) { json = null; }

    if (!ares.ok) {
      var m = (json && json.error && json.error.message) || ("Claude request failed (" + ares.status + ").");
      return { ok: false, status: ares.status, text: "", finishReason: null, errorMessage: m, blockReason: null };
    }
    var stop = json && json.stop_reason;
    if (stop === "refusal") {
      // A safety classifier declined. Treat as a soft failure so callModel can
      // fall back to Gemini rather than failing the whole chapter.
      return { ok: false, status: ares.status, text: "", finishReason: "refusal", errorMessage: "Claude declined this request.", blockReason: "refusal" };
    }
    var text = (json && Array.isArray(json.content) ? json.content : [])
      .filter(function (b) { return b && b.type === "text"; })
      .map(function (b) { return b.text || ""; }).join("");
    // Same degenerate-output guard as Gemini: a normal plan is ~12-14k chars.
    if (text.length > 42000) {
      return { ok: false, status: ares.status, text: "", finishReason: stop || null, errorMessage: "The plan came out garbled. Please tap \"Make again\".", blockReason: null };
    }
    var finishReason = (stop === "end_turn" || stop === "stop_sequence") ? "STOP" : (stop || null);
    return { ok: true, status: ares.status, text: text, finishReason: finishReason, errorMessage: null, blockReason: null };
  } catch (err) {
    var aborted = err && (err.name === "TimeoutError" || err.name === "AbortError");
    return {
      ok: false, status: 0, text: "", finishReason: null,
      errorMessage: aborted
        ? "Claude took too long to write this piece. Please try again."
        : "Couldn't reach Claude to write the plan. Please try again in a moment.",
      blockReason: null
    };
  }
}

// Provider dispatch. The school chose Claude Opus as the primary writer with an
// automatic Gemini fallback. So: if an Anthropic key is present, write with
// Claude; only if that call fails or comes back empty (and there is still enough
// of the 60s window left to make a second call safely) do we fall back to Gemini.
// With no Anthropic key it behaves exactly like the old Gemini-only path.
async function callModel(d, extraInstruction) {
  var claudeKey = process.env.ANTHROPIC_API_KEY;
  var geminiKey = process.env.GEMINI_API_KEY;
  var geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (claudeKey) {
    var claudeModel = process.env.ANTHROPIC_MODEL || "claude-opus-4-8";
    var startedAt = Date.now();
    var r;
    try { r = await callClaude(claudeKey, claudeModel, d, extraInstruction); }
    catch (e) { r = { ok: false, status: 0, text: "", finishReason: null, errorMessage: "Couldn't reach Claude.", blockReason: null }; }
    if (r && r.ok && (r.text || "").trim()) { return r; }
    // Claude failed or returned nothing. Fall back to Gemini only if we have a
    // key AND the first call failed quickly enough that a second one still fits
    // inside the 60s function budget (a slow Claude timeout must NOT be chased
    // by a 30s Gemini call — that would exceed the limit and kill the step).
    var elapsed = Date.now() - startedAt;
    if (geminiKey && elapsed < 30000) {
      try { return await callGemini(geminiKey, geminiModel, d, extraInstruction); }
      catch (e2) { /* fall through to Claude's error */ }
    }
    return r;
  }

  // No Claude key configured: original Gemini-only behaviour.
  return await callGemini(geminiKey, geminiModel, d, extraInstruction);
}

// Structural quality gate. Returns { ok, missing } where `missing` lists short
// labels for whatever required section/shape is absent. The caller handles the
// finishReason !== "STOP" check separately (a non-STOP plan is incomplete even
// if every marker happens to be present). Privacy: inspects text in memory only.
function validatePlan(text, d) {
  var t = text || "";
  var missing = [];

  // A '# ' title line (markdown H1) must exist.
  if (!/^#\s+/m.test(t)) { missing.push("title"); }
  // The running chapter-progress note — only required from Session 2 onward
  // (Session 1 deliberately omits it).
  if (String(d && d.sessionNo) !== "1" && t.indexOf("Chapter Progress So Far:") === -1) { missing.push("progress"); }
  // All three Parts.
  if (t.indexOf("## Part One") === -1) { missing.push("Part One"); }
  if (t.indexOf("## Part Two") === -1) { missing.push("Part Two"); }
  if (t.indexOf("## Part Three") === -1) { missing.push("Part Three"); }
  // The Evening Post (Google Classroom message) and the Story sub-sections.
  // Match what the RENDERER accepts, not an exact string, so we don't retry a
  // perfectly good plan over a tiny heading variation ("### Story —" etc.).
  if (!/###\s+evening\s+post/i.test(t)) { missing.push("Evening Post"); }
  if (!/###[^\n]*\bstory\b/i.test(t)) { missing.push("Story"); }
  // At least three timed in-class steps like '### 10 min ...'.
  var timed = t.match(/###\s+\d+\s*min/g);
  if (!timed || timed.length < 3) { missing.push("timed steps"); }
  // A misconceptions table: a row with >=2 pipes immediately followed by a
  // markdown separator row (dashes/colons between pipes).
  var hasTable = false;
  var rows = t.split("\n");
  for (var r = 0; r < rows.length - 1; r++) {
    var pipes = (rows[r].match(/\|/g) || []).length;
    if (pipes >= 2 && /^\s*\|?[ :|-]*-[ :|-]*\|/.test(rows[r + 1])) {
      hasTable = true;
      break;
    }
  }
  if (!hasTable) { missing.push("misconceptions table"); }
  // Grade consistency: the plan must not name a DIFFERENT grade. We do NOT
  // require the literal "Grade N" string to appear (the plan format does not
  // print it), only that no conflicting grade number is mentioned.
  var wantNo = (String(d && d.grade ? d.grade : "").match(/Grade\s+(\d+)/) || [])[1];
  if (wantNo) {
    var gm = t.match(/Grade\s+(\d+)/g) || [];
    for (var g = 0; g < gm.length; g++) {
      var n = (gm[g].match(/Grade\s+(\d+)/) || [])[1];
      if (n && n !== wantNo) { missing.push("grade"); break; }
    }
  }

  return { ok: missing.length === 0, missing: missing };
}

// True when this attempt is a usable, complete, well-formed plan: there is text,
// the model finished cleanly (STOP), and every structural check passes.
function planPasses(result, d) {
  if (!result || !result.text || !result.text.trim()) { return false; }
  if (result.finishReason && result.finishReason !== "STOP") { return false; }
  return validatePlan(result.text, d).ok;
}

// Lighter gate for the Chapter Summary: a title, both halves, and real content.
function validateSummary(text) {
  var t = text || "", missing = [];
  if (!/^#\s+/m.test(t)) { missing.push("title"); }
  if (!/##\s+For the Teacher/i.test(t)) { missing.push("teacher section"); }
  if (!/##\s+For the Children/i.test(t)) { missing.push("children section"); }
  if (t.replace(/\s/g, "").length < 400) { missing.push("content"); }
  return { ok: missing.length === 0, missing: missing };
}
function summaryPasses(result) {
  if (!result || !result.text || !result.text.trim()) { return false; }
  if (result.finishReason && result.finishReason !== "STOP") { return false; }
  return validateSummary(result.text).ok;
}

// Gate for the mind-map outline: the Chapter Map header and at least two branches.
function validateMap(text) {
  var t = text || "", missing = [];
  if (!/#\s+Chapter Map\s*:/i.test(t)) { missing.push("chapter map"); }
  if ((t.match(/^##\s+\d+\.\s+/gm) || []).length < 2) { missing.push("branches"); }
  return { ok: missing.length === 0, missing: missing };
}
function mapPasses(result) {
  if (!result || !result.text || !result.text.trim()) { return false; }
  if (result.finishReason && result.finishReason !== "STOP") { return false; }
  return validateMap(result.text).ok;
}

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  // Either provider key is enough: Claude (primary) or Gemini (fallback / solo).
  if (!process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY) {
    res.status(503).json({
      error: "This planner isn't set up yet. The school needs to add a writer key once " +
        "in Vercel → Settings → Environment Variables (ANTHROPIC_API_KEY, or GEMINI_API_KEY), then redeploy."
    });
    return;
  }

  var d;
  try {
    d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) { d = {}; }

  // Shared school password (PRD §5.1). Only enforced once the school sets a
  // SCHOOL_PASSWORD env var, so the app keeps working until it's configured.
  // This also gates the billable endpoint — only staff who know it can generate.
  if (process.env.SCHOOL_PASSWORD && String(d.password || "") !== process.env.SCHOOL_PASSWORD) {
    res.status(401).json({ error: "Wrong school password. Please enter it again." });
    return;
  }

  var files = Array.isArray(d.files) ? d.files : [];
  if (!files.length) {
    res.status(400).json({ error: "Please upload the chapter PDF so I can read the chapter." });
    return;
  }
  d.grade = d.grade || "Grade 3";
  d.subject = d.subject || "Environmental Studies";
  d.sessions = d.sessions || "4";
  d.sessionNo = d.sessionNo || "1";
  d.prior = d.prior || "";
  d.chapterNumber = (d.chapterNumber || "").toString().trim();
  d.chapterName = (d.chapterName || "").toString().trim();
  d.mode = (d.mode === "summary" || d.mode === "map") ? d.mode : "session";
  var isSummary = d.mode === "summary";
  var isMap = d.mode === "map";

  // ONE writer call (Claude primary, Gemini fallback inside callModel). We
  // deliberately do NOT auto-retry at this layer: a second call would risk
  // exceeding Vercel's 60s function limit (which the teacher sees as "not
  // connected"). The gate below instead flags a weak draft so the app can offer
  // "Make again".
  var first = await callModel(d);
  // Hard errors first: a writer transport/API failure → 502, a blocked prompt
  // → 422. Empty text is NOT fatal here — we fall through to the flag below.
  if (!first.ok) {
    res.status(502).json({ error: first.errorMessage });
    return;
  }
  if (first.blockReason) {
    res.status(422).json({ error: "The request was blocked (" + first.blockReason + "). Try a different chapter file." });
    return;
  }

  var draft = (first.text || "").trim();

  // Guard against a rare degenerate run where the model loops. A normal one-
  // session plan is ~12-14k chars, so anything past 28k is runaway garbage —
  // shipping it makes a giant broken PDF, so treat it as no usable plan.
  if (draft.length > 40000) {
    res.status(502).json({ error: "The plan came out garbled. Please tap \"Make again\"." });
    return;
  }

  // Quality gate: if the draft is complete and well-formed, ship it clean.
  var passes = isSummary ? summaryPasses(first) : isMap ? mapPasses(first) : planPasses(first, d);
  if (passes) {
    res.status(200).json({ markdown: first.text, truncated: false, finishReason: first.finishReason });
    return;
  }

  // It fell short of the gate but there is usable text: return it flagged
  // lowQuality so the app shows a gentle warning and offers "Make again". We do
  // not retry here (see the single-call note above).
  if (draft) {
    res.status(200).json({
      markdown: first.text,
      truncated: !(first.finishReason && first.finishReason === "STOP"),
      finishReason: first.finishReason,
      lowQuality: true
    });
    return;
  }

  // No usable text at all.
  res.status(502).json({ error: "No plan text came back (the model may have stopped early). Please try again." });
};

module.exports.config = { maxDuration: 60 };

// Exported so the background-job endpoints (start/step/status) can reuse the
// exact same engine and quality gates instead of duplicating them.
module.exports.callGemini = callGemini;
module.exports.callClaude = callClaude;
module.exports.callModel = callModel;
module.exports.planPasses = planPasses;
module.exports.summaryPasses = summaryPasses;
module.exports.mapPasses = mapPasses;
module.exports.defaultModel = function () { return process.env.GEMINI_MODEL || "gemini-2.5-flash"; };

// Exported for local testing (no effect on the serverless handler).
module.exports.addendum = addendum;
module.exports.userMessage = userMessage;
module.exports.summaryAddendum = summaryAddendum;
module.exports.summaryUserMessage = summaryUserMessage;
module.exports.validateSummary = validateSummary;
module.exports.mapAddendum = mapAddendum;
module.exports.mapUserMessage = mapUserMessage;
module.exports.validateMap = validateMap;
module.exports.FRAMEWORK = FRAMEWORK;
