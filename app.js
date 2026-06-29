/* Ed-Assist — Version 1
 * A free front-end for the lesson-plan system. It collects the five small
 * questions and builds a ready-to-paste starter message for Claude. The teacher
 * attaches the Framework + chapter pages and sends it in their Claude chat.
 *
 * NOTE FOR v2 (AI in the app): to generate plans inside the website, send these
 * same five answers plus the chapter to a small backend that calls the Anthropic
 * API with the Framework as the system prompt, then render the result. This v1
 * needs no key, no backend, and no cost.
 */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }

  function buildStarter(d) {
    return [
      "Hello! I would like to plan a chapter. Here are my details:",
      "",
      "• Chapter Number: " + d.chapterNo,
      "• Chapter Name: " + d.chapterName,
      "• Grade: " + d.grade,
      "• Subject: " + d.subject,
      "• Total Sessions: " + d.sessions,
      "",
      "I have attached the Lesson Plan Generation Framework and the scanned pages",
      "of the chapter. Please follow the Framework: start with Step 0 and confirm",
      "the chapter with me before building anything."
    ].join("\n");
  }

  function handleSubmit(e) {
    e.preventDefault();
    var chapterNo = el("chapterNo").value.trim();
    var chapterName = el("chapterName").value.trim();
    if (!chapterNo) { el("chapterNo").focus(); return; }
    if (!chapterName) { el("chapterName").focus(); return; }

    var data = {
      chapterNo: chapterNo,
      chapterName: chapterName,
      grade: el("grade").value,
      subject: el("subject").value,
      sessions: el("sessions").value
    };

    el("starter").textContent = buildStarter(data);
    el("result").classList.remove("hidden");
    el("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function copyStarter() {
    var text = el("starter").textContent;
    navigator.clipboard.writeText(text).then(function () {
      var btn = el("copyBtn");
      var old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("chapter-form").addEventListener("submit", handleSubmit);
    el("copyBtn").addEventListener("click", copyStarter);
  });
})();
