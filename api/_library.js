// The shared "My Chapters" library. When a background job finishes, its plan is
// saved here permanently (kept until a teacher deletes it) so finished chapters
// stop disappearing after the 6-hour job window. One school-wide list: any
// teacher who logs in can reopen or re-download any saved chapter.
//
// Storage (Upstash Redis, no TTL):
//   library:index          → a list of compact summary JSON strings (newest first)
//   library:item:<id>      → the full plan { results, chapter meta } for one chapter
//   errors:log             → a capped list of recent failures, for the status page
var kv = require("./_kv.js");

var INDEX_KEY = "library:index";
var ERRORS_KEY = "errors:log";
var ERRORS_MAX = 50;

function itemKey(id) { return "library:item:" + id; }

// Save a finished job into the library. `meta` is the job meta from the store;
// `id` is the job id (reused as the library id). Never throws — a library save
// must never break the actual generation.
async function saveChapter(id, meta) {
  try {
    var title = buildTitle(meta);
    var summary = {
      id: id,
      title: title,
      chapterNumber: meta.chapterNumber || "",
      chapterName: meta.chapterName || "",
      grade: meta.grade || "",
      subject: meta.subject || "",
      sessions: meta.sessions || (meta.results && meta.results.sessions ? meta.results.sessions.length : 0),
      createdAt: Date.now()
    };
    var item = {
      id: id,
      title: title,
      chapterNumber: summary.chapterNumber,
      chapterName: summary.chapterName,
      grade: summary.grade,
      subject: summary.subject,
      sessions: summary.sessions,
      createdAt: summary.createdAt,
      results: meta.results || { sessions: [], summary: "", map: "" }
    };
    await kv.set(itemKey(id), JSON.stringify(item));       // no TTL: kept until deleted
    await kv.lpush(INDEX_KEY, JSON.stringify(summary));    // newest first
    return true;
  } catch (e) { return false; }
}

// A human title for the library row, e.g. "Chapter 5: Plants Around Us".
function buildTitle(meta) {
  var num = (meta.chapterNumber || "").toString().trim();
  var name = (meta.chapterName || "").toString().trim();
  // Fall back to the title the model wrote on the first session.
  if (!name && meta.results && meta.results.sessions && meta.results.sessions[0]) {
    var m = String(meta.results.sessions[0]).match(/^#\s+(.+)$/m);
    if (m) {
      var t = m[1].replace(/\s*[—-]\s*Session.*$/i, "").trim();
      var cm = t.match(/^chapter\s+(\d+)\s*:\s*(.+)$/i);
      if (cm) { num = num || cm[1]; name = cm[2].trim(); }
      else { name = t; }
    }
  }
  var label = name || "Untitled chapter";
  return num ? ("Chapter " + num + ": " + label) : label;
}

// List every saved chapter, newest first. Returns an array of summaries.
async function list() {
  var raw = await kv.lrange(INDEX_KEY, 0, -1);
  var out = [];
  (raw || []).forEach(function (s) {
    try { out.push(JSON.parse(s)); } catch (e) {}
  });
  return out;
}

// The full plan for one chapter, or null if it isn't there.
async function getItem(id) {
  var raw = await kv.get(itemKey(id));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

// Remove one chapter: drop it from the index and delete its item.
async function remove(id) {
  var raw = await kv.lrange(INDEX_KEY, 0, -1);
  var target = null;
  (raw || []).forEach(function (s) {
    try { if (JSON.parse(s).id === id) target = s; } catch (e) {}
  });
  if (target != null) { await kv.lrem(INDEX_KEY, 1, target); }
  await kv.del(itemKey(id));
  return true;
}

// Record a short failure note for the status page. No chapter content is stored,
// only a category and a plain message. Never throws.
async function logError(type, message) {
  try {
    await kv.lpush(ERRORS_KEY, JSON.stringify({ t: Date.now(), type: type || "error", msg: String(message || "").slice(0, 300) }));
    await kv.ltrim(ERRORS_KEY, 0, ERRORS_MAX - 1);
  } catch (e) {}
}

// The most recent failures (newest first) for the status page.
async function recentErrors(n) {
  var raw = await kv.lrange(ERRORS_KEY, 0, (n || 20) - 1);
  var out = [];
  (raw || []).forEach(function (s) {
    try { out.push(JSON.parse(s)); } catch (e) {}
  });
  return out;
}

module.exports = {
  saveChapter: saveChapter, list: list, getItem: getItem,
  remove: remove, logError: logError, recentErrors: recentErrors
};
