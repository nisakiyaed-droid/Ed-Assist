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

  var parts = [{ text: userMessage(d) }];
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
      res.status(502).json({ error: m });
      return;
    }
    if (json && json.promptFeedback && json.promptFeedback.blockReason) {
      res.status(422).json({ error: "The request was blocked (" + json.promptFeedback.blockReason + "). Try a different chapter file." });
      return;
    }
    var cand = json && json.candidates && json.candidates[0];
    var text = cand && cand.content && cand.content.parts
      ? cand.content.parts.map(function (p) { return p.text || ""; }).join("") : "";

    if (!text.trim()) {
      res.status(502).json({ error: "No plan text came back (the model may have stopped early). Please try again." });
      return;
    }
    var truncated = cand && cand.finishReason && cand.finishReason !== "STOP";
    res.status(200).json({ markdown: text, truncated: !!truncated, finishReason: cand && cand.finishReason });
  } catch (err) {
    res.status(502).json({ error: "Couldn't reach Google to write the plan. Please try again in a moment." });
  }
};

module.exports.config = { maxDuration: 60 };

// Exported for local testing (no effect on the serverless handler).
module.exports.addendum = addendum;
module.exports.userMessage = userMessage;
module.exports.FRAMEWORK = FRAMEWORK;
