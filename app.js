/* Ed-Assist — Dr. Dasarathan International School · Lesson Planner
 *
 * Generates a complete session plan on the page using the school's Gemini key.
 * The key is the teacher's own: it is kept only in this browser (optionally in
 * localStorage on this device) and is sent only to Google. It is never sent to
 * us, never committed to the code, and never stored online.
 *
 * It still offers the older "copy-paste message for Claude" path as a fallback.
 */
(function () {
  "use strict";

  function el(id) { return document.getElementById(id); }
  var KEY_STORE = "edassist_gemini_key";

  // ---- Framework (the engine) -------------------------------------------
  // Fetched from the hosted Markdown file; a compact fallback keeps the app
  // working even if the fetch fails (e.g. opened from a local file).
  var FRAMEWORK_FALLBACK = [
    "You are an expert primary curriculum designer for an ICSE school in India (Grades 1–5;",
    "English, Mathematics, Environmental Studies, Social Studies). Sessions run 40 minutes; medium is English.",
    "Write everything in full — no acronyms (always 'Assessment for Learning'); short, warm, jargon-free sentences.",
    "",
    "Root all stories and examples in India, letting the setting follow the content, with a gentle South-Indian / Tamil Nadu lean.",
    "Keep one story character across the chapter; carry local colour through place, character, food and festival — always in English.",
    "",
    "Each session plan has THREE labelled parts:",
    "PART ONE — Before Class: Learning Outcomes (3–5, with one thinking and one values outcome); Prerequisites Check;",
    "  exactly three Anticipated Misconceptions (what the child says / why / what the teacher does); four or five likely",
    "  student questions with deepening responses; a Questioning Technique guide; one support and one extension; a Teaching",
    "  Aids checklist; choosing the level (Enhanced is the everyday default); a short self-check.",
    "PART TWO — During Class: lead with the Enhanced sequence (~35 min), each step numbered with a minute estimate that sums",
    "  to the level target. The six Core essentials, in order: Prior Knowledge Activation, Teach the Concept, Class Activity,",
    "  Assessment for Learning (written + oral + physical), The Story, Takeaway. Always reach the Story and the Takeaway.",
    "  Give Core and Full as short reference lists; Full adds one genuine Cross-curricular link and one 'Did You Know?'.",
    "  The Story ends with a line answering the essential question plus one follow-on question.",
    "PART THREE — After Class: six reflection questions, then the Evening Post — a ready-to-paste Google Classroom block in",
    "  two layers (quick glance: today's chart, home task, follow-on question; read-more: full story, new words, amazing fact).",
    "",
    "Three warm levels: Core (~25 min), Enhanced (~35 min, default), Full (40 min)."
  ].join("\n");

  var frameworkPromise = null;
  function getFramework() {
    if (frameworkPromise) return frameworkPromise;
    frameworkPromise = fetch("docs/framework/4-lesson-plan-framework-v1.1.md")
      .then(function (r) { if (!r.ok) throw new Error("no framework"); return r.text(); })
      .catch(function () { return FRAMEWORK_FALLBACK; });
    return frameworkPromise;
  }

  // ---- Key handling -----------------------------------------------------
  function loadSavedKey() {
    var saved = "";
    try { saved = localStorage.getItem(KEY_STORE) || ""; } catch (e) {}
    if (saved) { el("apiKey").value = saved; el("rememberKey").checked = true; }
    refreshKeyState();
  }
  function refreshKeyState() {
    var has = el("apiKey").value.trim() !== "";
    el("keyState").textContent = has ? "✓ key set" : "— key needed";
    el("keyState").classList.toggle("ok", has);
    if (!has) el("aiSettings").open = true;
  }
  function persistKeyIfWanted() {
    try {
      if (el("rememberKey").checked && el("apiKey").value.trim()) {
        localStorage.setItem(KEY_STORE, el("apiKey").value.trim());
      } else {
        localStorage.removeItem(KEY_STORE);
      }
    } catch (e) {}
  }
  function forgetKey() {
    el("apiKey").value = "";
    el("rememberKey").checked = false;
    try { localStorage.removeItem(KEY_STORE); } catch (e) {}
    refreshKeyState();
  }

  // ---- Files → base64 ---------------------------------------------------
  function fileToPart(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var data = String(reader.result).split(",")[1] || "";
        resolve({ inlineData: { mimeType: file.type || "application/octet-stream", data: data } });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ---- Prompts ----------------------------------------------------------
  function operatingAddendum() {
    return [
      "",
      "=== HOW TO RESPOND IN THIS APP ===",
      "You are generating ONE complete, ready-to-teach session plan in a single reply.",
      "There is no back-and-forth here, so do not ask questions and do not wait for approval.",
      "If chapter pages are attached, base the plan on them; if not, use the chapter name and your",
      "knowledge of a typical ICSE primary chapter. Produce the full plan for the requested session,",
      "using the three labelled parts (Part One — Before Class; Part Two — During Class, with the",
      "Enhanced sequence leading; Part Three — After Class), the warm house style, a Story grounded",
      "in an Indian / Tamil Nadu setting (the school is in Coimbatore), and the Evening Post.",
      "Begin directly with the session title as a Markdown '#' heading. Output clean Markdown only",
      "(headings, lists, and a table for the three misconceptions). No preamble, no sign-off."
    ].join("\n");
  }

  function userMessage(d) {
    return [
      "School: Dr. Dasarathan International School, Coimbatore, Tamil Nadu (ICSE).",
      "Chapter Number: " + d.chapterNo,
      "Chapter Name: " + d.chapterName,
      "Grade: " + d.grade,
      "Subject: " + d.subject,
      "Total Sessions: " + d.sessions,
      "Generate: Session " + d.sessionNo + " of " + d.sessions + ".",
      "",
      "Please write the complete Session " + d.sessionNo + " plan now."
    ].join("\n");
  }

  // ---- Gemini call ------------------------------------------------------
  function callGemini(key, model, systemText, parts) {
    var url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);
    var body = {
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: "user", parts: parts }],
      generationConfig: { temperature: 0.85, maxOutputTokens: 8192 }
    };
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }).then(function (res) {
      return res.json().then(function (json) {
        if (!res.ok) {
          var msg = (json && json.error && json.error.message) || ("Request failed (" + res.status + ")");
          throw new Error(msg);
        }
        if (json.promptFeedback && json.promptFeedback.blockReason) {
          throw new Error("The request was blocked (" + json.promptFeedback.blockReason + "). Try rephrasing.");
        }
        var cand = json.candidates && json.candidates[0];
        if (!cand || !cand.content || !cand.content.parts) {
          throw new Error("No plan was returned. Please try again.");
        }
        return cand.content.parts.map(function (p) { return p.text || ""; }).join("");
      });
    });
  }

  // ---- Generate flow ----------------------------------------------------
  function check(inputId, fieldId) {
    var ok = el(inputId).value.trim() !== "";
    el(fieldId).classList.toggle("invalid", !ok);
    return ok;
  }

  function setStatus(text, kind) {
    var s = el("genStatus");
    s.className = "gen-status " + (kind || "");
    s.textContent = text;
    s.classList.remove("hidden");
  }

  function handleGenerate(e) {
    e.preventDefault();
    var noOk = check("chapterNo", "field-chapterNo");
    var nameOk = check("chapterName", "field-chapterName");
    if (!noOk) { el("chapterNo").focus(); return; }
    if (!nameOk) { el("chapterName").focus(); return; }

    var key = el("apiKey").value.trim();
    if (!key) {
      el("aiSettings").open = true;
      el("apiKey").focus();
      el("planResult").classList.remove("hidden");
      el("planBody").innerHTML = "";
      setStatus("Please add the school's Gemini key above, then press Generate.", "warn");
      return;
    }
    persistKeyIfWanted();
    refreshKeyState();

    var data = {
      chapterNo: el("chapterNo").value.trim(),
      chapterName: el("chapterName").value.trim(),
      grade: el("grade").value,
      subject: el("subject").value,
      sessions: el("sessions").value,
      sessionNo: el("sessionNo").value
    };

    var btn = el("generateAiBtn");
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = "Generating…";
    el("planResult").classList.remove("hidden");
    el("result").classList.add("hidden");
    el("planBody").innerHTML = "";
    el("planTitle").textContent = "Session " + data.sessionNo + " — " + data.chapterName;
    setStatus("Reading your chapter and writing the plan… this can take up to a minute.", "busy");
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    var files = el("chapterFile").files;
    var fileJobs = [];
    for (var i = 0; i < files.length; i++) fileJobs.push(fileToPart(files[i]));

    Promise.all([getFramework(), Promise.all(fileJobs)]).then(function (out) {
      var framework = out[0];
      var fileParts = out[1];
      var systemText = framework + "\n\n" + operatingAddendum();
      var parts = [{ text: userMessage(data) }].concat(fileParts);
      return callGemini(key, el("model").value, systemText, parts);
    }).then(function (markdown) {
      el("genStatus").classList.add("hidden");
      renderPlan(markdown);
    }).catch(function (err) {
      setStatus("Couldn't generate the plan: " + err.message, "error");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = oldLabel;
    });
  }

  var lastMarkdown = "";
  function renderPlan(markdown) {
    lastMarkdown = markdown;
    var html = window.DOMPurify.sanitize(window.marked.parse(markdown));
    el("planBody").innerHTML = html;
  }

  function copyPlan() {
    if (!lastMarkdown) return;
    navigator.clipboard.writeText(lastMarkdown).then(function () {
      var b = el("copyPlanBtn"); var old = b.textContent;
      b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = old; }, 1500);
    });
  }

  // ---- Starter-message fallback (copy-paste to Claude) ------------------
  function buildStarter(d) {
    return [
      "Hello! I teach at Dr. Dasarathan International School, an ICSE school in",
      "Coimbatore, Tamil Nadu. I would like to plan a chapter. Here are my details:",
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
  function showStarter() {
    var noOk = check("chapterNo", "field-chapterNo");
    var nameOk = check("chapterName", "field-chapterName");
    if (!noOk) { el("chapterNo").focus(); return; }
    if (!nameOk) { el("chapterName").focus(); return; }
    var data = {
      chapterNo: el("chapterNo").value.trim(),
      chapterName: el("chapterName").value.trim(),
      grade: el("grade").value, subject: el("subject").value, sessions: el("sessions").value
    };
    el("starter").textContent = buildStarter(data);
    el("planResult").classList.add("hidden");
    el("result").classList.remove("hidden");
    el("result").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  function copyStarter() {
    navigator.clipboard.writeText(el("starter").textContent).then(function () {
      var b = el("copyBtn"); var old = b.textContent;
      b.textContent = "Copied ✓"; setTimeout(function () { b.textContent = old; }, 1500);
    });
  }

  // ---- Wiring -----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    loadSavedKey();
    el("chapter-form").addEventListener("submit", handleGenerate);
    el("starterBtn").addEventListener("click", showStarter);
    el("copyBtn").addEventListener("click", copyStarter);
    el("copyPlanBtn").addEventListener("click", copyPlan);
    el("printPlanBtn").addEventListener("click", function () { window.print(); });
    el("forgetKey").addEventListener("click", forgetKey);
    el("apiKey").addEventListener("input", refreshKeyState);
    el("rememberKey").addEventListener("change", persistKeyIfWanted);
    [["chapterNo", "field-chapterNo"], ["chapterName", "field-chapterName"]].forEach(function (p) {
      el(p[0]).addEventListener("input", function () {
        if (el(p[0]).value.trim() !== "") el(p[1]).classList.remove("invalid");
      });
    });
  });
})();
