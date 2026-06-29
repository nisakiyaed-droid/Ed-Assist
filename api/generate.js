// Secure backend: holds the school's Gemini key as a hidden secret and writes
// the lesson plan. Teachers never see or send a key. Deployed as a Vercel
// serverless function. Configure once: Vercel → Settings → Environment
// Variables → GEMINI_API_KEY (and optional GEMINI_MODEL).

var FRAMEWORK = require("./framework.js");

// App-specific overlay on the Framework above. Adds only the output format,
// the hard constraints, and faithfulness — it does NOT re-explain the pedagogy
// the Framework already defines.
function addendum(d) {
  var session = "Session " + d.sessionNo + " of " + d.sessions;
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
    "=== GRADE ===",
    "Pitch everything at " + d.grade + ". Wherever the text names a grade it must say",
    "'" + d.grade + "' — never another grade.",
    "",
    "=== SCOPE ===",
    "Teach 1-2 focal skills this session. Across the " + d.sessions + " sessions, spread the",
    "chapter's skills so each has a clear focus; treat earlier-covered content as quick",
    "review and never repeat what an earlier session already taught.",
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
    // gemini-2.5-flash is a thinking model — reasoning tokens count against this
    // budget. 20000 was too low (the plan stopped mid-story). 40000 leaves ample
    // room for thinking + the full plan including Part Three and the Evening Post.
    // Lower temperature → steadier, more consistent plans run-to-run (the school
    // wants reliable quality, not creative variance).
    generationConfig: { temperature: 0.5, maxOutputTokens: 40000 }
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
    var text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ""; }).join("") : "";
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

  // First attempt.
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

  // Quality gate: if the first draft is complete and well-formed, ship it.
  if (planPasses(first, d)) {
    res.status(200).json({ markdown: first.text, truncated: false, finishReason: first.finishReason });
    return;
  }

  // It failed the gate (or came back empty). Make ONE retry, naming what was
  // missing so the model knows what to fix.
  var firstMissing = validatePlan(first.text, d).missing;
  if (first.finishReason && first.finishReason !== "STOP" && firstMissing.indexOf("incomplete") === -1) {
    firstMissing.push("incomplete");
  }
  var extra = "Your previous draft was incomplete or malformed (missing: " +
    (firstMissing.join(", ") || "required sections") + "). Write the COMPLETE plan " +
    "again with every required section, ending with '## Part Three — After Class' and " +
    "a full '### Evening Post'. Never stop inside the Story.";

  var second = await callGemini(key, model, d, extra);
  // A retry transport/API failure or a block is not fatal on its own — we may
  // still have usable text from the first attempt. We only surface those below
  // when neither attempt produced anything usable.
  if (second.ok && !second.blockReason && planPasses(second, d)) {
    res.status(200).json({ markdown: second.text, truncated: false, finishReason: second.finishReason });
    return;
  }

  // Both attempts fell short of the gate. Return the better of the two when
  // there is any usable text — never hard-fail on usable content. "Better" =
  // a clean STOP wins; otherwise the longer draft.
  var firstText = (first.text || "").trim();
  var secondText = (second.text || "").trim();
  var best = null;
  if (firstText && secondText) {
    var firstStop = first.finishReason === "STOP";
    var secondStop = second.finishReason === "STOP";
    if (firstStop !== secondStop) {
      best = firstStop ? first : second;
    } else {
      best = firstText.length >= secondText.length ? first : second;
    }
  } else if (firstText) {
    best = first;
  } else if (secondText) {
    best = second;
  }

  if (best) {
    var bestTruncated = !(best.finishReason && best.finishReason === "STOP");
    res.status(200).json({
      markdown: best.text,
      truncated: !!bestTruncated,
      finishReason: best.finishReason,
      lowQuality: true
    });
    return;
  }

  // Neither attempt produced any usable text at all — fall back to the existing
  // "no plan came back" error.
  res.status(502).json({ error: "No plan text came back (the model may have stopped early). Please try again." });
};

module.exports.config = { maxDuration: 60 };

// Exported for local testing (no effect on the serverless handler).
module.exports.addendum = addendum;
module.exports.userMessage = userMessage;
module.exports.FRAMEWORK = FRAMEWORK;
