// Background generation — STEP 3: report a job's progress, and hand back the
// finished plan once it's done. The browser polls this while generating, and
// also calls it on reopen to pick up a chapter that finished while it was away.
var kv = require("./_kv.js");

function label(step, N, status) {
  if (status === "done") return "Your plan is ready.";
  if (status === "error") return "Something went wrong.";
  if (status === "paused") return "Session " + (step + 1) + " needs another try.";
  if (step < N) return "Writing session " + (step + 1) + " of " + N + "…";
  if (step === N) return "Writing the chapter summary…";
  return "Drawing your mind maps…";
}

module.exports = async function (req, res) {
  if (!kv.configured()) { res.status(503).json({ error: "Background mode is not set up." }); return; }
  var jobId = (req.query && req.query.job) || "";
  if (!jobId) { res.status(400).json({ error: "Missing job id." }); return; }

  var meta;
  try { meta = JSON.parse(await kv.get("job:" + jobId) || "null"); }
  catch (e) { meta = null; }
  if (!meta) { res.status(404).json({ status: "missing" }); return; }

  var out = {
    status: meta.status, step: meta.step, total: meta.total,
    sessions: meta.sessions, lowQuality: meta.lowQuality, error: meta.error,
    failedStep: meta.status === "paused" ? meta.step : undefined,
    label: label(meta.step, meta.sessions, meta.status)
  };
  // Ship the (larger) results when finished, OR when paused so the app can show
  // the sessions already written while one session waits to be retried.
  if (meta.status === "done" || meta.status === "paused") {
    out.results = meta.results;
    out.chapterNumber = meta.chapterNumber;
    out.chapterName = meta.chapterName;
    out.grade = meta.grade;
    out.subject = meta.subject;
  }
  res.status(200).json(out);
};

module.exports.config = { maxDuration: 10 };
