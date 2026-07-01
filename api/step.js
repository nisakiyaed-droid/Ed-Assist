// Background generation — STEP 2: advance a job by exactly one piece (one
// session, or the summary, or the map). Each call is a single Gemini round-trip
// that finishes well within the 60s limit. The browser (or, later, a queue)
// calls this repeatedly until the job is done; progress survives a page close
// because everything lives in the Redis store.
var kv = require("./_kv.js");
var gen = require("./generate.js");
var qstash = require("./_qstash.js");
var lib = require("./_library.js");

var JOB_TTL = 6 * 60 * 60;

function label(step, N) {
  if (step < N) return "Writing session " + (step + 1) + " of " + N + "…";
  if (step === N) return "Writing the chapter summary…";
  return "Drawing your mind maps…";
}

module.exports = async function (req, res) {
  var haveWriter = process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY;
  if (!haveWriter || !kv.configured()) { res.status(503).json({ error: "Background mode is not set up." }); return; }

  var body = {};
  try { body = (req.body && typeof req.body !== "string") ? req.body : JSON.parse((req.body || "{}")); }
  catch (e) { body = {}; }
  var jobId = (req.query && req.query.job) || body.job || "";
  var resume = !!((req.query && req.query.resume) || body.resume);
  if (!jobId) { res.status(400).json({ error: "Missing job id." }); return; }

  var meta;
  try { meta = JSON.parse(await kv.get("job:" + jobId) || "null"); }
  catch (e) { meta = null; }
  if (!meta) { res.status(404).json({ status: "missing" }); return; }
  if (meta.status === "done" || meta.status === "error") {
    res.status(200).json({ status: meta.status, step: meta.step, total: meta.total, error: meta.error });
    return;
  }
  // Paused = a session used up its one auto-retry and is waiting for the teacher
  // to tap "Retry this session". Every finished session is kept. A plain step or
  // a stray queue retry just reports the paused state; only an explicit resume
  // (the button) clears it and tries that session again with a fresh retry.
  if (meta.status === "paused") {
    if (!resume) {
      res.status(200).json({ status: "paused", step: meta.step, total: meta.total, failedStep: meta.step, error: meta.error, lowQuality: meta.lowQuality });
      return;
    }
    meta.status = "running"; meta.attempts = 0; meta.error = null;
  }

  // Lock so two overlapping calls (e.g. a backgrounded request plus a reopen)
  // never generate the same piece twice. The lock self-expires after 75s in case
  // a function dies mid-step.
  var now = Date.now();
  if (meta.lockedAt && (now - meta.lockedAt) < 75000) {
    res.status(200).json({ status: "running", step: meta.step, total: meta.total, busy: true, label: label(meta.step, meta.sessions) });
    return;
  }
  meta.lockedAt = now;
  try { await kv.set("job:" + jobId, JSON.stringify(meta), 6 * 60 * 60); }
  catch (e) { res.status(503).json({ error: "Couldn't reach the store. Please try again." }); return; }

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

  // A big scanned chapter arrives as many page-images. Opus is too slow to read
  // that many images and still write within the 60s limit, so for a heavy image
  // chapter we go straight to the fast writer. A clean short PDF (a page or two)
  // still gets Opus quality. A retry always uses the fast writer.
  var imgCount = files.filter(function (f) { return f && /^image\//.test(f.mimeType || ""); }).length;
  var heavy = imgCount >= (parseInt(process.env.OPUS_MAX_IMAGE_PAGES, 10) || 12);

  var d = {
    grade: meta.grade, subject: meta.subject, sessions: N,
    chapterNumber: meta.chapterNumber, chapterName: meta.chapterName,
    files: files, mode: mode, sessionNo: step + 1,
    prior: meta.results.sessions.join("\n\n"),
    preferFast: heavy || (meta.attempts || 0) >= 1
  };

  var result;
  try { result = await gen.callModel(d); }
  catch (e) { result = { ok: false, errorMessage: "Could not reach the writer." }; }

  // A session must produce real text; the summary and map are optional bonuses.
  var text = (result && result.text || "").trim();
  if (mode === "session" && (!result.ok || !text)) {
    var why = (result && result.errorMessage) || "A session came back empty.";
    // First failure of this session: try it ONE more time automatically. We keep
    // the step pointer where it is and re-arm a step so the same session reruns.
    if ((meta.attempts || 0) < 1) {
      meta.attempts = (meta.attempts || 0) + 1;
      meta.lockedAt = null; meta.updatedAt = Date.now();
      try { await kv.set("job:" + jobId, JSON.stringify(meta), JOB_TTL); } catch (e) {}
      if (qstash.configured()) {
        var rbase = meta.base || qstash.baseUrl(req);
        await qstash.publish(rbase + "/api/step", { job: jobId }, 3);   // small pause before retry
      }
      res.status(200).json({ status: "running", step: step, total: meta.total, label: "Session " + (step + 1) + " needed a second try…", retrying: true });
      return;
    }
    // Auto-retry is spent: pause here, keeping every finished session, and wait
    // for the teacher to retry just this one. Nothing already written is lost.
    meta.status = "paused";
    meta.error = "Session " + (step + 1) + " could not be written just now. " + why;
    meta.lockedAt = null; meta.updatedAt = Date.now();
    try { await kv.set("job:" + jobId, JSON.stringify(meta), JOB_TTL); } catch (e) {}
    await lib.logError("session", "Session " + (step + 1) + "/" + N + " paused: " + why);
    res.status(200).json({ status: "paused", step: step, total: meta.total, failedStep: step, error: meta.error, lowQuality: meta.lowQuality });
    return;
  }

  // Record the piece, flagging weak output rather than failing.
  var passes = mode === "summary" ? gen.summaryPasses(result)
    : mode === "map" ? gen.mapPasses(result) : gen.planPasses(result, d);
  if (mode === "session") { meta.results.sessions.push(text); if (!passes) meta.lowQuality = true; }
  else if (mode === "summary") { meta.results.summary = text; }
  else { meta.results.map = text; }

  meta.step = step + 1;
  meta.attempts = 0;                              // fresh retry budget for the next piece
  if (meta.step >= meta.total) { meta.status = "done"; }
  meta.lockedAt = null; meta.updatedAt = Date.now();
  try { await kv.set("job:" + jobId, JSON.stringify(meta), JOB_TTL); }
  catch (e) { res.status(503).json({ error: "Couldn't save progress. Please try again." }); return; }

  // On completion, save the finished chapter into the shared library so it stays
  // available after the job's own 6-hour window (kept until a teacher deletes it).
  if (meta.status === "done") { await lib.saveChapter(jobId, meta); }

  // Chain the next piece via QStash so the job finishes even if the browser is
  // closed. (The busy/lock path above never reaches here, so we never double up.)
  if (meta.status !== "done" && qstash.configured()) {
    var base = meta.base || qstash.baseUrl(req);
    await qstash.publish(base + "/api/step", { job: jobId });
  }

  res.status(200).json({
    status: meta.status, step: meta.step, total: meta.total,
    label: meta.status === "done" ? "Your plan is ready." : label(meta.step, N),
    lowQuality: meta.lowQuality
  });
};

module.exports.config = { maxDuration: 60 };
