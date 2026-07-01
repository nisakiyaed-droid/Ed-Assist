// Upstash QStash — a tiny publisher so the server can trigger its own next step,
// letting a chapter finish even with the browser fully closed. If QSTASH_TOKEN
// isn't set, configured() is false and the app falls back to browser-driven
// stepping (which still works, it just needs the page open).
var TOKEN = process.env.QSTASH_TOKEN || "";

function configured() { return !!TOKEN; }

// Public base URL of this deployment, from the incoming request, so QStash can
// call us back (works on the vercel.app domain and any custom domain).
function baseUrl(req) {
  var proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0];
  var host = req.headers["x-forwarded-host"] || req.headers.host || "";
  return proto + "://" + host;
}

// Ask QStash to POST `body` to `destUrl` (with its own retries). Returns whether
// the message was accepted; never throws.
async function publish(destUrl, body, delaySeconds) {
  if (!configured()) return false;
  var headers = { Authorization: "Bearer " + TOKEN, "Content-Type": "application/json" };
  if (delaySeconds) headers["Upstash-Delay"] = delaySeconds + "s";
  try {
    var r = await fetch("https://qstash.upstash.io/v2/publish/" + destUrl, {
      method: "POST", headers: headers, body: JSON.stringify(body || {})
    });
    return r.ok;
  } catch (e) { return false; }
}

module.exports = { configured: configured, baseUrl: baseUrl, publish: publish };
