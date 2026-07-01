// The "My Chapters" library API.
//   GET  /api/library            → list every saved chapter (summaries)
//   GET  /api/library?id=<id>    → the full plan for one chapter
//   DELETE /api/library?id=<id>  → remove one chapter
// All calls are gated by the shared school password (once SCHOOL_PASSWORD is set),
// since they expose the school's own plan content.
var kv = require("./_kv.js");
var lib = require("./_library.js");

function checkPw(req, body) {
  if (!process.env.SCHOOL_PASSWORD) return true;
  var pw = (req.query && req.query.pw) || (body && body.password) || "";
  return String(pw) === process.env.SCHOOL_PASSWORD;
}

module.exports = async function (req, res) {
  if (!kv.configured()) { res.status(503).json({ error: "The library is not set up (missing store)." }); return; }

  var body = {};
  if (req.method === "DELETE" || req.method === "POST") {
    try { body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {}); }
    catch (e) { body = {}; }
  }
  if (!checkPw(req, body)) { res.status(401).json({ error: "Wrong school password." }); return; }

  var id = (req.query && req.query.id) || body.id || "";

  try {
    if (req.method === "DELETE" || (req.method === "POST" && body.action === "delete")) {
      if (!id) { res.status(400).json({ error: "Missing chapter id." }); return; }
      await lib.remove(id);
      res.status(200).json({ ok: true });
      return;
    }

    if (req.method === "GET") {
      if (id) {
        var item = await lib.getItem(id);
        if (!item) { res.status(404).json({ error: "That chapter is no longer in the library." }); return; }
        res.status(200).json(item);
        return;
      }
      var items = await lib.list();
      res.status(200).json({ items: items });
      return;
    }

    res.status(405).json({ error: "Method not allowed." });
  } catch (e) {
    res.status(503).json({ error: "Couldn't reach the library. Please try again." });
  }
};

module.exports.config = { maxDuration: 10 };
