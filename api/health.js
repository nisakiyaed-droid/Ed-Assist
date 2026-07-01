// Private status page data. Gated by the school password. Reports whether each
// piece is configured, how many plans were made today against the daily cap, and
// the most recent failures — enough to see at a glance if generation is healthy
// without exposing any keys or chapter content.
var kv = require("./_kv.js");
var lib = require("./_library.js");

var DAILY_GENERATION_LIMIT = 30;   // keep in step with api/start.js

function istDay() {
  var ist = new Date(Date.now() + 5.5 * 3600 * 1000);
  return ist.getUTCFullYear() + "-" +
    String(ist.getUTCMonth() + 1).padStart(2, "0") + "-" +
    String(ist.getUTCDate()).padStart(2, "0");
}

module.exports = async function (req, res) {
  // The status page is ADMIN-ONLY and must NOT open with the shared school
  // password (every teacher has that). It uses its own ADMIN_PASSWORD secret,
  // known only to the administrator. If that isn't set yet, the page stays
  // locked for everyone rather than falling back to the school password.
  var admin = process.env.ADMIN_PASSWORD || "";
  if (!admin) {
    res.status(503).json({ error: "The status page needs an admin password. Add ADMIN_PASSWORD in Vercel (Settings → Environment Variables), then reload." });
    return;
  }
  var pw = (req.query && req.query.pw) || "";
  if (String(pw) !== admin) { res.status(401).json({ error: "Wrong admin password." }); return; }

  var config = {
    claude: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    store: kv.configured(),
    selfRunning: !!process.env.QSTASH_TOKEN,
    passwordSet: !!process.env.SCHOOL_PASSWORD
  };

  var usedToday = 0, errors = [], storeReachable = kv.configured();
  if (kv.configured()) {
    try { usedToday = parseInt(await kv.get("usage:" + istDay()), 10) || 0; }
    catch (e) { storeReachable = false; }
    try { errors = await lib.recentErrors(15); } catch (e) {}
  }

  // Overall: healthy unless there is no writer, or the store can't be reached.
  var healthy = (config.claude || config.gemini) && (!kv.configured() || storeReachable);

  res.status(200).json({
    healthy: healthy,
    writer: config.claude ? "Claude (with Gemini backup)" : config.gemini ? "Gemini only" : "none configured",
    config: config,
    usage: { today: usedToday, cap: DAILY_GENERATION_LIMIT, day: istDay() },
    recentErrors: errors,
    checkedAt: Date.now()
  });
};

module.exports.config = { maxDuration: 10 };
