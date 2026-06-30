// Background generation — STEP 2: advance a job by exactly one piece (one
// session, or the summary, or the map). Each call is a single Gemini round-trip
// that finishes well within the 60s limit. The browser (or, later, a queue)
// calls this repeatedly until the job is done; progress survives a page close
// because everything lives in the Redis store.
var kv = require("./_kv.js");
var gen = require("./generate.js");

function label(step, N) {
  if (step < N) return "Writing session " + (step + 1) + " of " + N + "…";
  if (step === N) return "Writing the chapter summary…";
  return "Drawing your mind maps…";
}

module.exports = async function (req, res) {
  var key = process.env.GEMINI_API_KEY;
  if (!key || !kv.configured()) { res.status(503).json({ error: "Background mode is not set up." }); return; }

  var jobId = (req.query && req.query.job) ||
    (req.body && (typeof req.body === "string" ? "" : req.body.job)) || "";
  if (!jobId) { res.status(400).json({ error: "Missing job id." }); return; }

  var meta;
  try { meta = JSON.parse(await kv.get("job:" + jobId) || "null"); }
  catch (e) { meta = null; }
  if (!meta) { res.status(404).json({ status: "missing" }); return; }
  if (meta.status === "done" || meta.status === "error") {
    res.status(200).json({ status: meta.status, step: meta.step, total: meta.total, error: meta.error });
    return;
  }

  var N = meta.sessions, step = meta.step;
  var mode = step < N ? "session" : (step === N ? "summary" : "map");

  // Reload the chapter pages once for this step.
  var files = [];
  try {
    for (var i = 0; i < meta.pageCount; i++) {
      files.push(JSON.parse(await kv.get("job:" + jobId + ":p:" + i) || "null"));
    }
    files = files.filter(Boolean);
  } catch (e) { files = []; }
  if (!files.length) { res.status(410).json({ error: "The chapter is no longer in the store. Please start again." }); return; }

  var d = {
    grade: meta.grade, subject: meta.subject, sessions: N,
    chapterNumber: meta.chapterNumber, chapterName: meta.chapterName,
    files: files, mode: mode, sessionNo: step + 1,
    prior: meta.results.sessions.join("\n\n")
  };

  var model = gen.defaultModel();
  var result;
  try { result = await gen.callGemini(key, model, d); }
  catch (e) { result = { ok: false, errorMessage: "Could not reach the writer." }; }

  // A session must produce real text; the summary and map are optional bonuses.
  var text = (result && result.text || "").trim();
  if (mode === "session" && (!result.ok || !text)) {
    meta.status = "error";
    meta.error = (result && result.errorMessage) || "A session came back empty. Please make this chapter again.";
    meta.updatedAt = Date.now();
    try { await kv.set("job:" + jobId, JSON.stringify(meta), 6 * 60 * 60); } catch (e) {}
    res.status(200).json({ status: "error", step: step, total: meta.total, error: meta.error });
    return;
  }

  // Record the piece, flagging weak output rather than failing.
  var passes = mode === "summary" ? gen.summaryPasses(result)
    : mode === "map" ? gen.mapPasses(result) : gen.planPasses(result, d);
  if (mode === "session") { meta.results.sessions.push(text); if (!passes) meta.lowQuality = true; }
  else if (mode === "summary") { meta.results.summary = text; }
  else { meta.results.map = text; }

  meta.step = step + 1;
  if (meta.step >= meta.total) { meta.status = "done"; }
  meta.updatedAt = Date.now();
  try { await kv.set("job:" + jobId, JSON.stringify(meta), 6 * 60 * 60); }
  catch (e) { res.status(503).json({ error: "Couldn't save progress. Please try again." }); return; }

  res.status(200).json({
    status: meta.status, step: meta.step, total: meta.total,
    label: meta.status === "done" ? "Your plan is ready." : label(meta.step, N),
    lowQuality: meta.lowQuality
  });
};

module.exports.config = { maxDuration: 60 };
