// Background generation — STEP 1: accept the chapter once, create a job in the
// Redis store, and return a job id. The browser can then close; /api/step
// advances the job one piece at a time and /api/status reports progress.
var kv = require("./_kv.js");
var crypto = require("crypto");

var DAILY_GENERATION_LIMIT = 30;        // school-wide successful generations per IST day
var JOB_TTL = 6 * 60 * 60;              // keep a job for 6 hours

function istDay() {
  var ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.getUTCFullYear() + "-" +
    String(ist.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(ist.getUTCDate()).padStart(2, "0");
}
function secondsToIstMidnight() {
  var istMs = Date.now() + 5.5 * 3600 * 1000;
  var ist = new Date(istMs);
  var next = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1, 0, 0, 0);
  return Math.max(60, Math.ceil((next - istMs) / 1000));
}

module.exports = async function (req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "Use POST." }); return; }
  if (!process.env.GEMINI_API_KEY) {
    res.status(503).json({ error: "This planner isn't set up yet (missing Gemini key)." });
    return;
  }
  if (!kv.configured()) {
    res.status(503).json({ error: "Background mode isn't switched on yet. The school needs to connect the Redis store in Vercel." });
    return;
  }

  var d;
  try { d = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
  catch (e) { d = {}; }

  if (process.env.SCHOOL_PASSWORD && String(d.password || "") !== process.env.SCHOOL_PASSWORD) {
    res.status(401).json({ error: "Wrong school password. Please enter it again." });
    return;
  }

  var files = Array.isArray(d.files) ? d.files : [];
  if (!files.length) { res.status(400).json({ error: "Please upload the chapter PDF first." }); return; }

  // School-wide daily cap, enforced server-side and reset at IST midnight.
  var day = istDay();
  var count;
  try {
    count = await kv.incr("usage:" + day);
    if (count === 1) { await kv.expire("usage:" + day, secondsToIstMidnight()); }
  } catch (e) {
    res.status(503).json({ error: "Couldn't reach the store. Please try again in a moment." });
    return;
  }
  if (count > DAILY_GENERATION_LIMIT) {
    try { await kv.decr("usage:" + day); } catch (e) {}
    res.status(429).json({
      error: "The school's daily limit of " + DAILY_GENERATION_LIMIT + " plans has been reached. " +
        "It resets after midnight (IST). Please try again tomorrow.",
      limitReached: true
    });
    return;
  }

  var N = parseInt(d.sessions, 10) || 4;
  var jobId = crypto.randomUUID();
  var ttl = JOB_TTL;

  // Store each chapter page on its own key (each well under the 1 MB value limit).
  try {
    for (var i = 0; i < files.length; i++) {
      await kv.set("job:" + jobId + ":p:" + i, JSON.stringify(files[i]), ttl);
    }
    var meta = {
      status: "running", step: 0, total: N + 2, sessions: N,
      grade: d.grade || "Grade 3", subject: d.subject || "Environmental Studies",
      chapterNumber: (d.chapterNumber || "").toString().trim(),
      chapterName: (d.chapterName || "").toString().trim(),
      pageCount: files.length,
      results: { sessions: [], summary: "", map: "" },
      lowQuality: false, error: null, updatedAt: Date.now()
    };
    await kv.set("job:" + jobId, JSON.stringify(meta), ttl);
  } catch (e) {
    res.status(503).json({ error: "Couldn't save the chapter to the store. Please try again." });
    return;
  }

  res.status(200).json({ jobId: jobId, total: N + 2 });
};

module.exports.config = { maxDuration: 30 };
