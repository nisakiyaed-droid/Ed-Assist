// Minimal Upstash Redis client over its REST API — no npm dependency, just one
// HTTPS request per command. Uses the keys Vercel injected when the Redis
// database was connected (KV_REST_API_URL + KV_REST_API_TOKEN). Falls back to
// the UPSTASH_* names in case a different prefix was chosen.
var REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
var REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";

function configured() { return !!(REST_URL && REST_TOKEN); }

// Run one Redis command, e.g. ["SET", key, value, "EX", "3600"].
async function cmd(args) {
  if (!configured()) throw new Error("KV store is not configured");
  var r = await fetch(REST_URL, {
    method: "POST",
    headers: { Authorization: "Bearer " + REST_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(args)
  });
  var j = await r.json();
  if (j && j.error) throw new Error("KV error: " + j.error);
  return j ? j.result : null;
}

module.exports = {
  configured: configured,
  get: function (k) { return cmd(["GET", k]); },
  set: function (k, v, ttlSeconds) {
    return ttlSeconds ? cmd(["SET", k, v, "EX", String(ttlSeconds)]) : cmd(["SET", k, v]);
  },
  del: function (k) { return cmd(["DEL", k]); },
  incr: function (k) { return cmd(["INCR", k]); },
  decr: function (k) { return cmd(["DECR", k]); },
  expire: function (k, ttlSeconds) { return cmd(["EXPIRE", k, String(ttlSeconds)]); },
  // List helpers, used by the shared chapter library and the error log.
  lpush: function (k, v) { return cmd(["LPUSH", k, v]); },
  lrange: function (k, start, stop) { return cmd(["LRANGE", k, String(start), String(stop)]); },
  lrem: function (k, count, v) { return cmd(["LREM", k, String(count), v]); },
  ltrim: function (k, start, stop) { return cmd(["LTRIM", k, String(start), String(stop)]); }
};
