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

// App-specific overlay on the Framework above. Adds only the output format,
// the hard constraints, and faithfulness — it does NOT re-explain the pedagogy
// the Framework already defines.
function addendum(d) {
  var session = "Session " + d.sessionNo + " of " + d.sessions;
  var grade = gradeGuidance(d.grade);
  return [
    "",
    "=== TASK ===",
    "Write ONE complete, ready-to-teach plan for " + session + ", in a single reply.",
    "Do not ask questions or wait for approval. Detect the chapter number and name",
    "from the attached pages yourself.",
    "",
    "=== GROUND IT IN THE CHAPTER (do not invent) ===",
    "Draw every activity, example, word, story detail, and question from the ATTACHED",
    "chapter only. Do not add facts, characters, or content the chapter does not support.",
    "",
    "=== GRADE & DEPTH (this plan is " + d.grade + ") ===",
    "Pitch everything at " + d.grade + ". Wherever the text names a grade it must say",
    "'" + d.grade + "' — never another grade.",
    "- Learning-outcome thinking for this grade: " + grade.verbs + ".",
    "- Story shape for this grade: " + grade.story + ".",
    "- Questioning style for this grade: " + grade.quest + ".",
    "- For Maths, use only the number range and operations the chapter shows; never go",
    "  beyond what the chapter itself contains.",
    "",
    "=== SCOPE ===",
    "Teach 1-2 focal skills this session. Across the " + d.sessions + " sessions, spread the",
    "chapter's skills so each has a clear focus; treat earlier-covered content as quick",
    "review and never repeat what an earlier session already taught.",
    "",
    "=== VOCABULARY (carry words across the chapter) ===",
    "Show new words under a '### Today\\'s New Words' heading. From Session 2 onward also",
    "add a '### Words We Already Know' heading listing key words from earlier sessions, so",
    "earlier vocabulary stays alive instead of fading.",
    "",
    "=== OUTPUT FORMAT (exact markers — the app colour-codes them) ===",
    "Line 1:  # Chapter <number>: <name> — " + session,
    "Line 2:  Chapter Progress So Far: <1-2 sentences>",
    "Parts as '## ' headings, exactly: '## Part One — Before Class',",
    "  '## Part Two — During Class', '## Part Three — After Class'.",
    "All sub-sections as '### ' headings.",
    "In Part One, put a '### Cue Colours Used in This Plan' heading on its own line",
    "  (the app fills the colour key — do not list colours yourself).",
    "Each in-class step as '### <minutes> min — <title>' then ONE line of teacher action.",
    "The story as '### The Story — <title>', then 1-2 short paragraphs; reflective line",
    "  in *italics*.",
    "Any fun fact as a paragraph starting 'Did You Know? ...'.",
    "The Google Classroom message under a '### Evening Post' heading.",
    "",
    "=== QUALITY BAR ===",
    "- Learning Outcomes: 3-5, observable and measurable with a threshold",
    "  (e.g. 'match 4 of 5 synonym pairs').",
    "- Misconceptions: a 3-column, 3-row table — 'What the child says | Why it happens |",
    "  What the teacher does' — every cell filled.",
    "- Assessment for Learning: tie each check to a specific Learning Outcome.",
    "- Part Three: a short closure/plenary + an exit ticket linked to the outcomes.",
    "- In-class step minutes must add up to the session length.",
    "- Story: original and warm, set in a Tamil Nadu / Coimbatore context, built from",
    "  the chapter's own characters and target words; keep the SAME recurring character",
    "  across the chapter's sessions.",
    "- Tone: warm, simple, and encouraging throughout — written for a teacher of young",
    "  children, and easy for that teacher to read and follow.",
    "",
    "=== NON-NEGOTIABLE ===",
    "The plan is complete ONLY when it ends with Part Three and a full Evening Post;",
    "never stop inside the Story. Output clean Markdown only — short paragraphs, tight",
    "lists, no preamble, no sign-off, no filler."
  ].join("\n");
}

function userMessage(d) {
  var lines = [
    "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
    "Grade: " + d.grade,
    "Subject: " + d.subject,
    "Total Sessions: " + d.sessions,
    "Generate: Session " + d.sessionNo + " of " + d.sessions + ". The chapter pages are attached."
  ];
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
  var parts = [{ text: userMessage(d) }];
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
    systemInstruction: { parts: [{ text: FRAMEWORK + "\n\n" + addendum(d) }] },
    contents: [{ role: "user", parts: parts }],
    // gemini-2.5-flash is a thinking model. Left uncapped it can think for 100s+
    // (a single call hit 142s in testing) and blow past Vercel's 60s limit — the
    // teacher sees "not connected". thinkingBudget caps the thinking so each call
    // reliably finishes in ~30s, while maxOutputTokens 20000 still leaves ~14k for
    // the full plan (thinking is capped, so it no longer crowds out the output and
    // causes truncation). Lower temperature → steadier, more consistent plans.
    generationConfig: { temperature: 0.5, maxOutputTokens: 16000, thinkingConfig: { thinkingBudget: 6000 } }
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
    if (text.length > 30000) {
      return { ok: false, status: gres.status, text: "", finishReason: cand && cand.finishReason, errorMessage: "The plan came out garbled. Please tap \"Make again\".", blockReason: null };
    }
    return { ok: true, status: gres.status, text: text, finishReason: cand && cand.finishReason, errorMessage: null, blockReason: null };
  } catch (err) {
    return { ok: false, status: 0, text: "", finishReason: null, errorMessage: "Couldn't reach Google to write the plan. Please try again in a moment.", blockReason: null };
  }
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
  // The running chapter-progress note.
  if (t.indexOf("Chapter Progress So Far:") === -1) { missing.push("progress"); }
  // All three Parts.
  if (t.indexOf("## Part One") === -1) { missing.push("Part One"); }
  if (t.indexOf("## Part Two") === -1) { missing.push("Part Two"); }
  if (t.indexOf("## Part Three") === -1) { missing.push("Part Three"); }
  // The Evening Post (Google Classroom message) and the Story sub-sections.
  // Match what the RENDERER accepts, not an exact string, so we don't retry a
  // perfectly good plan over a tiny heading variation ("### Story —" etc.).
  if (!/###\s+evening\s+post/i.test(t)) { missing.push("Evening Post"); }
  if (!/###\s+(the\s+)?story\b/i.test(t)) { missing.push("Story"); }
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
  // Grade consistency: the requested grade must appear and no OTHER grade number.
  var want = d && d.grade ? String(d.grade) : "";
  var wantNo = (want.match(/Grade\s+(\d+)/) || [])[1];
  if (want && t.indexOf(want) === -1) {
    missing.push("grade");
  } else if (wantNo) {
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

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }
  var key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(503).json({
      error: "This planner isn't set up yet. The school needs to add the Gemini key once " +
        "in Vercel → Settings → Environment Variables (name it GEMINI_API_KEY), then redeploy."
    });
    return;
  }
  var model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  var d;
  try {
    d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch (e) { d = {}; }

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

  // ONE Gemini call. We deliberately do NOT auto-retry: a second ~30s call would
  // risk exceeding Vercel's 60s function limit (which the teacher sees as "not
  // connected"). The gate below instead flags a weak draft so the app can offer
  // "Make again".
  var first = await callGemini(key, model, d);
  // Hard errors first, exactly as before: Gemini transport/API failure → 502,
  // a blocked prompt → 422. Empty text is NOT fatal here — we fall through to
  // the retry below.
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
  if (draft.length > 28000) {
    res.status(502).json({ error: "The plan came out garbled. Please tap \"Make again\"." });
    return;
  }

  // Quality gate: if the draft is complete and well-formed, ship it clean.
  if (planPasses(first, d)) {
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

// Exported for local testing (no effect on the serverless handler).
module.exports.addendum = addendum;
module.exports.userMessage = userMessage;
module.exports.FRAMEWORK = FRAMEWORK;
