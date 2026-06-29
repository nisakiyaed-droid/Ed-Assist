// Secure backend: holds the school's Gemini key as a hidden secret and writes
// the lesson plan. Teachers never see or send a key. Deployed as a Vercel
// serverless function. Configure once: Vercel → Settings → Environment
// Variables → GEMINI_API_KEY (and optional GEMINI_MODEL).

var FRAMEWORK = require("./framework.js");

function addendum(d) {
  return [
    "",
    "=== HOW TO RESPOND IN THIS APP ===",
    "You are writing ONE complete, ready-to-teach session plan in a single reply.",
    "Do not ask questions and do not wait for approval.",
    "READ THE ATTACHED CHAPTER PAGES and work out the Chapter Number and Chapter Name",
    "yourself from them — never ask the teacher for these.",
    "Write the full plan for the requested session using the three labelled parts",
    "(Part One — Before Class; Part Two — During Class, Enhanced sequence leading;",
    "Part Three — After Class), the warm house style, a Story grounded in a Tamil Nadu /",
    "Coimbatore setting, and the Evening Post.",
    "Begin with ONE Markdown '# ' heading in exactly this shape:",
    "'# Chapter <number>: <name> — Session " + d.sessionNo + " of " + d.sessions + "'.",
    "",
    "=== LAYOUT (use these EXACT markers — the app colour-codes them) ===",
    "- Right after the title, write one line: 'Chapter Progress So Far: <one or two sentences>'.",
    "- Use these three part headings exactly, as '## ' headings:",
    "    '## Part One — Before Class'",
    "    '## Part Two — During Class'",
    "    '## Part Three — After Class'",
    "- For every smaller section (Learning Outcomes, Anticipated Misconceptions, etc.)",
    "  use a '### ' heading.",
    "- Early in Part One, add a '### Cue Colours Used in This Plan' heading on its own",
    "  (the app prints the coloured key automatically — do not list the colours yourself).",
    "- Write each In-Class teaching step as a '### ' heading in this shape:",
    "    '### <minutes> min — <Step title>'   (e.g. '### 3 min — Hook')",
    "  then ONE short line describing what the teacher does.",
    "- Write the story as a '### The Story — <story title>' heading, then 1-2 short",
    "  paragraphs; put the reflective sentence in *italics*.",
    "- Write any amazing fact as a paragraph starting 'Did You Know? ...'.",
    "- Put the Google-Classroom message under a '### Evening Post' heading.",
    "",
    "=== GRADE (must stay consistent) ===",
    "This plan is for " + d.grade + ". Pitch every activity, word, and example at " + d.grade + ".",
    "Every place the text names a grade it must say '" + d.grade + "' — never any other grade.",
    "",
    "=== SCOPE (do not overload young learners) ===",
    "Teach only ONE or TWO focal skills in this session, suitable for " + d.grade + ".",
    "Across the " + d.sessions + " sessions, spread the chapter's skills so each session has a",
    "clear focus; treat anything already covered in earlier sessions as quick spiral review,",
    "not new teaching. Do not cram every concept into one period.",
    "",
    "=== QUALITY RULES ===",
    "- Learning Outcomes: 3-5, written as observable, measurable statements with a success",
    "  threshold (e.g. 'match 4 of 5 synonym pairs', 'turn 3 verbs into the past tense').",
    "- The Misconceptions table must have EXACTLY three columns and three rows:",
    "  'What the child says | Why it happens | What the teacher does'. Fill all three columns.",
    "- Assessment for Learning: tie each check to a specific Learning Outcome.",
    "- Part Three must include a short closure/plenary and a quick exit ticket linked to the",
    "  outcomes, then the Evening Post for Google Classroom.",
    "- Make the minutes of the In-Class steps add up to the stated session length.",
    "",
    "=== COMPLETENESS (most important) ===",
    "The plan is only finished when it ends with Part Three - After Class AND a complete",
    "Evening Post. NEVER stop inside the Story. Keep earlier sections tight so you always have",
    "room to finish Part Three and the Evening Post.",
    "Keep it comfortable to read and compact: short paragraphs, tight lists, no filler",
    "and no empty padding. Output clean Markdown only (headings, lists, and the three-column",
    "misconceptions table). No preamble, no sign-off."
  ].join("\n");
}

function userMessage(d) {
  var lines = [
    "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
    "Grade: " + d.grade,
    "Subject: " + d.subject,
    "Total Sessions: " + d.sessions,
    "Generate: Session " + d.sessionNo + " of " + d.sessions + ".",
    "",
    "The chapter pages are attached. Detect the chapter number and name from them,",
    "then write the complete Session " + d.sessionNo + " plan now."
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
    res.status(400).json({ error: "Please upload the chapter pages (a PDF or photos) so I can read the chapter." });
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
    generationConfig: { temperature: 0.85, maxOutputTokens: 40000 }
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
