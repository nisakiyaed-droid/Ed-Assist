/* Ed-Assist — Dr. Dasarathan International School · Lesson Planner
 *
 * Teachers upload a chapter and get a complete session plan. The school's
 * Gemini key lives in the backend (Vercel env var) — teachers never see it.
 * The plan downloads as a real PDF and can be shared on WhatsApp.
 */
(function () {
  "use strict";
  function el(id) { return document.getElementById(id); }
  var MAX_BYTES = 3 * 1024 * 1024; // keep the upload under the server limit
  var PW_KEY = "ddis.pw";

  // ---- Shared school password (PRD §5.1) --------------------------------
  // The server only enforces a password once SCHOOL_PASSWORD is set in Vercel.
  // The login POST tells us which case we're in: a wrong password gets 401, a
  // probe with no password gets 401 only when one IS configured (otherwise it
  // falls through to the 400 "upload a chapter" check). So the gate appears by
  // itself the moment the school sets a password, and stays hidden until then.
  function getPw() { try { return localStorage.getItem(PW_KEY) || ""; } catch (e) { return ""; } }
  function setPw(v) { try { v ? localStorage.setItem(PW_KEY, v) : localStorage.removeItem(PW_KEY); } catch (e) {} }
  function showGate(on) {
    el("loginGate").classList.toggle("hidden", !on);
    document.body.classList.toggle("gated", !!on);
    if (on) { try { el("schoolPw").focus(); } catch (e) {} }
  }
  // Returns a promise that resolves true if the password is accepted (or none is
  // required), false if it's wrong. A network/server error counts as "accepted"
  // so a blip never locks staff out of the app.
  function checkPassword(pw) {
    return fetch("api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw, files: [] })
    }).then(function (res) { return res.status !== 401; }, function () { return true; });
  }
  function initLoginGate() {
    if (getPw()) return;                 // already signed in on this device
    checkPassword("").then(function (ok) {
      if (!ok) showGate(true);           // a password is configured — ask for it
    });
  }
  function handleLogin(e) {
    e.preventDefault();
    var pw = el("schoolPw").value.trim();
    el("loginErr").classList.add("hidden");
    var btn = el("loginBtn"); btn.disabled = true; var lbl = btn.textContent; btn.textContent = "Checking…";
    checkPassword(pw).then(function (ok) {
      btn.disabled = false; btn.textContent = lbl;
      if (ok) { setPw(pw); showGate(false); loadLibrary(); }
      else { el("loginErr").classList.remove("hidden"); el("schoolPw").focus(); }
    });
  }

  // ---- Files → inline parts --------------------------------------------
  function fileToInline(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () {
        resolve({ mimeType: file.type || "application/octet-stream", data: String(r.result).split(",")[1] || "" });
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  // ---- Automatic chapter shrinking -------------------------------------
  // Vercel caps a request body at ~4.5 MB, so a base64 PDF must stay under ~3 MB.
  // Small chapters are sent untouched (keeping their text). A large scanned
  // chapter is rendered page-by-page to right-sized JPEGs in the browser so it
  // fits, with no work for the teacher. Gemini reads the images just like a PDF.
  var ASIS_BYTES = 2.8 * 1024 * 1024;   // send the original if the upload is this small
  var TARGET_BYTES = 2.7 * 1024 * 1024; // budget for the converted images (raw bytes)
  var HARD_BYTES = 3.4 * 1024 * 1024;   // refuse only if still over this after shrinking
  var MAX_PAGES = 40;

  function pdfToImageParts(file, onPage) {
    return file.arrayBuffer().then(function (buf) {
      return window.pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    }).then(function (pdf) {
      var pages = Math.min(pdf.numPages, MAX_PAGES);
      var parts = [], usedRaw = 0;
      var canvas = document.createElement("canvas");
      var ctx = canvas.getContext("2d");
      function nextPage(i) {
        if (i > pages) return Promise.resolve(parts);
        return pdf.getPage(i).then(function (page) {
          var v1 = page.getViewport({ scale: 1 });
          var targetW = pages > 18 ? 1000 : 1240;          // fewer pages → sharper
          var scale = Math.min(targetW / v1.width, 2);
          var vp = page.getViewport({ scale: scale });
          canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height);
          ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          return page.render({ canvasContext: ctx, viewport: vp }).promise.then(function () {
            // Spread the remaining byte budget over the remaining pages, dropping
            // JPEG quality only as far as needed to stay within it.
            var perPage = (TARGET_BYTES - usedRaw) / (pages - i + 1);
            var q = 0.72, data = canvas.toDataURL("image/jpeg", q);
            while (data.length * 0.75 > perPage && q > 0.4) { q -= 0.1; data = canvas.toDataURL("image/jpeg", q); }
            usedRaw += data.length * 0.75;
            parts.push({ mimeType: "image/jpeg", data: data.split(",")[1] || "" });
            if (onPage) onPage(i, pages);
            return nextPage(i + 1);
          });
        });
      }
      return nextPage(1);
    });
  }

  // Turn the chosen files into inline parts the server can send to Gemini,
  // shrinking large PDFs first. onPrep(label) reports progress.
  function prepareFiles(files, onPrep) {
    var total = 0, i;
    for (i = 0; i < files.length; i++) total += files[i].size;
    if (total <= ASIS_BYTES) {                 // small enough — keep the original
      var jobs = [];
      for (i = 0; i < files.length; i++) jobs.push(fileToInline(files[i]));
      return Promise.all(jobs);
    }
    if (!window.pdfjsLib) {                     // engine missing — fall back to the old limit
      return Promise.reject(new Error("Your file is " + (total / 1048576).toFixed(1) +
        " MB. Please use a chapter PDF under 3 MB."));
    }
    if (onPrep) onPrep("Preparing your chapter…");
    var parts = [], idx = 0;
    function nextFile() {
      if (idx >= files.length) {
        var raw = parts.reduce(function (a, p) { return a + (p.data ? p.data.length * 0.75 : 0); }, 0);
        if (raw > HARD_BYTES) {
          return Promise.reject(new Error("This chapter is very large even after shrinking. " +
            "Please upload fewer pages (just the one chapter) and try again."));
        }
        return Promise.resolve(parts);
      }
      var f = files[idx++];
      var isPdf = /pdf/i.test(f.type) || /\.pdf$/i.test(f.name);
      var step = isPdf
        ? pdfToImageParts(f, function (pg, n) { if (onPrep) onPrep("Preparing your chapter… page " + pg + " of " + n); })
        : fileToInline(f).then(function (p) { return [p]; });
      return step.then(function (ps) { parts = parts.concat(ps); return nextFile(); });
    }
    return nextFile();
  }

  // ---- Status + state ---------------------------------------------------
  function setStatus(text, kind) {
    var s = el("genStatus");
    s.className = "gen-status " + (kind || "");
    s.textContent = text;
    s.classList.remove("hidden");
  }
  function showToolbar(on) { el("planFiles").classList.toggle("hidden", !on); }
  function setMeta(items) {
    el("planMeta").innerHTML = items.map(function (x) {
      return "<li>" + String(x).replace(/&/g, "&amp;").replace(/</g, "&lt;") + "</li>";
    }).join("");
  }
  function showProgress(on) { el("genProgress").classList.toggle("hidden", !on); }
  function setProgress(done, total, label) {
    var pct = total ? Math.round((done / total) * 100) : 0;
    el("genProgressFill").style.width = pct + "%";
    el("genProgressLabel").textContent = label;
  }

  // ---- Generate ALL sessions -------------------------------------------
  var planTitleText = "Lesson plan";
  var currentSessions = [];
  var summaryMarkdown = "";          // the whole-chapter revision sheet (PRD §3.1)
  var chapterMapData = null;         // { title, branches[] } for the Chapter Learning Map
  var dailyMapData = [];             // [{ topic, ideas[] }] one per session
  var dailyPng = [];                 // pre-rendered daily-map PNGs (for the Evening Post PDFs)
  var lastMarkdown = "";
  // Remembered inputs from the last run, so "Make again" can repeat it exactly
  // without re-reading the file from disk.
  var lastRun = null; // { base, fileParts }

  // ---- Remember last choice (grade / subject / sessions) ----------------
  function loadLastChoice() {
    try {
      var pairs = [["grade", "ddis.grade"], ["subject", "ddis.subject"], ["sessions", "ddis.sessions"]];
      for (var i = 0; i < pairs.length; i++) {
        var saved = localStorage.getItem(pairs[i][1]);
        if (saved == null) continue;
        var sel = el(pairs[i][0]);
        for (var o = 0; o < sel.options.length; o++) {
          if (sel.options[o].value === saved) { sel.value = saved; break; }
        }
      }
    } catch (e) { /* localStorage may be unavailable — keep HTML defaults */ }
  }
  function saveLastChoice() {
    try {
      localStorage.setItem("ddis.grade", el("grade").value);
      localStorage.setItem("ddis.subject", el("subject").value);
      localStorage.setItem("ddis.sessions", el("sessions").value);
    } catch (e) { /* ignore — saving the choice is non-critical */ }
  }

  function postGenerate(payload) {
    return fetch("api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (raw) {
        var json; try { json = JSON.parse(raw); } catch (e) { json = null; }
        if (!res.ok || !json) {
          if (res.status === 404 || res.status === 405 || !json) {
            throw new Error("The plan maker is not connected here yet. Please open the school's Lesson Planner link.");
          }
          var err = new Error((json && json.error) || ("Request failed (" + res.status + ")."));
          err.status = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  // Retry a session a few times on transient failures (network blips, gateway
  // timeouts) so one hiccup doesn't throw away the whole batch.
  function postGenerateRetry(payload, onRetry) {
    var maxTries = 3;
    function attempt(n) {
      return postGenerate(payload).catch(function (err) {
        var msg = (err && err.message) || "";
        var transient = /Failed to fetch|NetworkError|isn't connected|\b50\d\b|timed? ?out/i.test(msg);
        if (n < maxTries && transient) {
          if (onRetry) onRetry(n);
          return new Promise(function (r) { setTimeout(r, 1500 * n); }).then(function () { return attempt(n + 1); });
        }
        throw err;
      });
    }
    return attempt(1);
  }

  function handleSubmit(e) {
    e.preventDefault();
    var files = el("chapterFile").files;
    var field = el("field-chapterFile");
    if (!files || !files.length) { field.classList.add("invalid"); el("chapterFile").focus(); return; }
    field.classList.remove("invalid");

    saveLastChoice();                         // remember grade / subject / sessions
    var N = parseInt(el("sessions").value, 10) || 1;
    var base = {
      grade: el("grade").value, subject: el("subject").value, sessions: N,
      chapterNumber: el("chapterNumber").value.trim(),
      chapterName: el("chapterName").value.trim()
    };

    // Show the output area with a "preparing" bar while we shrink a big chapter.
    var btn = el("generateBtn"); btn.disabled = true;
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = ""; showToolbar(false);
    el("genStatus").classList.add("hidden");
    showProgress(true); setProgress(0, 1, "Reading your chapter…");
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    prepareFiles(files, function (label) { setProgress(0, 1, label); }).then(function (fileParts) {
      btn.disabled = false;
      runGenerationBg(base, fileParts);       // takes over the progress bar
    }).catch(function (err) {
      btn.disabled = false; showProgress(false);
      setStatus((err && err.message) || "Sorry, that chapter could not be read. Please try another PDF.", "warn");
    });
  }

  // Re-run the last generation with the SAME inputs, reusing the already-read
  // file parts so we never read the file from disk again.
  function regenerate() {
    if (!lastRun) return;
    runGenerationBg(lastRun.base, lastRun.fileParts);
  }

  // ---- Background generation (server-side job) -------------------------
  // The chapter is uploaded ONCE to the server, which writes the plan piece by
  // piece into the Redis store. Progress survives a page close: on reopen we
  // pick the job back up (or show the finished plan). Falls back to the older
  // in-browser flow only if the server says background mode isn't configured.
  var JOB_KEY = "ddis.job";
  function saveJob(o) { try { o ? localStorage.setItem(JOB_KEY, JSON.stringify(o)) : localStorage.removeItem(JOB_KEY); } catch (e) {} }
  function loadJob() { try { return JSON.parse(localStorage.getItem(JOB_KEY) || "null"); } catch (e) { return null; } }
  function apiPost(path, payload) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      .then(function (res) { return res.text().then(function (raw) { var j; try { j = JSON.parse(raw); } catch (e) { j = null; } return { status: res.status, ok: res.ok, json: j }; }); });
  }
  function apiGet(path) {
    return fetch(path).then(function (res) { return res.text().then(function (raw) { var j; try { j = JSON.parse(raw); } catch (e) { j = null; } return { status: res.status, ok: res.ok, json: j }; }); });
  }
  function resetGenBtn() { var b = el("generateBtn"); b.disabled = false; b.textContent = "Make my plan"; showCancel(false); }

  // A run token: every generation/resume captures the current value; bumping it
  // makes any in-flight poller stop. "Start over" bumps it to escape a job that
  // is taking too long, so the teacher is never trapped watching a stalled plan.
  var genRun = 0;
  function showCancel(on) { var c = el("cancelBtn"); if (c) c.classList.toggle("hidden", !on); }
  function cancelGeneration() {
    genRun++;                          // stop any running poller/driver loop
    saveJob(null);
    showProgress(false); hideRetryBanner();
    el("planBody").innerHTML = ""; showToolbar(false);
    setStatus("Stopped. You can make a new plan now.", "warn");
    resetGenBtn();
  }

  function runGenerationBg(base, fileParts) {
    var N = base.sessions, total = N + 2;
    genRun++;                                  // fresh run; invalidates old pollers
    lastRun = { base: base, fileParts: fileParts };
    var btn = el("generateBtn"); btn.disabled = true; btn.textContent = "Making your plan…";
    showCancel(true);
    currentSessions = []; summaryMarkdown = ""; lastMarkdown = "";
    chapterMapData = null; dailyMapData = []; dailyPng = [];
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = ""; showToolbar(false); hideRetryBanner();
    el("genStatus").classList.add("hidden");
    showProgress(true); setProgress(0, total, "Saving your chapter…");
    el("planTitle").textContent = "Your lesson plan";
    setMeta([base.grade, base.subject, N + " session" + (N > 1 ? "s" : "")]);
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    apiPost("api/start", {
      grade: base.grade, subject: base.subject, sessions: N,
      chapterNumber: base.chapterNumber, chapterName: base.chapterName,
      password: getPw(), files: fileParts
    }).then(function (r) {
      if (r.status === 401) { setPw(""); showGate(true); showProgress(false); resetGenBtn(); return; }
      if (r.status === 429 && r.json && r.json.limitReached) { showProgress(false); setStatus(r.json.error, "warn"); resetGenBtn(); return; }
      if (r.status === 503) { return runGenerationSync(base, fileParts); }   // background not set up → old flow
      if (!r.ok || !r.json || !r.json.jobId) {
        showProgress(false); setStatus((r.json && r.json.error) || "Couldn't start the plan. Please try again.", "error"); resetGenBtn(); return;
      }
      saveJob({ jobId: r.json.jobId, grade: base.grade, subject: base.subject, sessions: N, total: r.json.total, selfRunning: !!r.json.selfRunning });
      driveJob(r.json.jobId, r.json.total, !!r.json.selfRunning);
    }, function () {
      showProgress(false); setStatus("Couldn't reach the plan maker. Please check your internet and try again.", "error"); resetGenBtn();
    });
  }

  // Drive a job to completion. When the server self-runs (QStash configured) the
  // app just POLLS status and can be closed entirely; otherwise it drives each
  // step from the browser (which needs the page open).
  function driveJob(jobId, total, selfRunning) {
    if (selfRunning) { return pollJob(jobId, total); }
    showCancel(true);
    var lowQ = false, curStep = 0, myRun = genRun;
    function step() {
      if (myRun !== genRun) return;
      apiPost("api/step", { job: jobId }).then(function (r) {
        if (myRun !== genRun) return;
        var j = r.json || {};
        if (r.status === 404 || j.status === "missing") {
          saveJob(null); showProgress(false); setStatus("This plan expired before it finished. Please make it again.", "warn"); resetGenBtn(); return;
        }
        if (j.busy) { setProgress(curStep, total, "Working… please keep going"); setTimeout(step, 5000); return; }
        if (!r.ok && !j.status) { setProgress(curStep, total, "Slow connection — trying again…"); setTimeout(step, 3000); return; }
        if (j.lowQuality) lowQ = true;
        if (j.step != null) curStep = j.step;
        if (j.status === "error") { saveJob(null); showProgress(false); setStatus((j.error || "Something went wrong.") + " Please tap Make again.", "error"); resetGenBtn(); return; }
        if (j.status === "paused") { handlePaused(jobId, total, false, j); return; }
        setProgress(curStep, total, (j.label || "Working…") + " — you can leave this page and come back");
        if (j.status === "done") { finishJob(jobId, lowQ); return; }
        step();                                  // straight on to the next piece
      }, function () {
        if (myRun !== genRun) return;
        setProgress(curStep, total, "Slow connection — trying again…"); setTimeout(step, 3000);
      });
    }
    step();
  }

  // Self-running mode: the server chains its own steps, so we only watch. The
  // teacher can fully close the app; on reopen the finished plan is waiting.
  function pollJob(jobId, total) {
    showCancel(true);
    var lowQ = false, curStep = 0, sameFor = 0, myRun = genRun;
    function poll() {
      if (myRun !== genRun) return;
      apiGet("api/status?job=" + encodeURIComponent(jobId)).then(function (r) {
        if (myRun !== genRun) return;
        var j = r.json || {};
        if (r.status === 404 || j.status === "missing") {
          saveJob(null); showProgress(false); setStatus("This plan expired before it finished. Please make it again.", "warn"); resetGenBtn(); return;
        }
        if (j.lowQuality) lowQ = true;
        if (j.status === "error") { saveJob(null); showProgress(false); setStatus((j.error || "Something went wrong.") + " Please tap Make again.", "error"); resetGenBtn(); return; }
        if (j.status === "paused") { handlePaused(jobId, total, true, j); return; }
        if (j.status === "done" && j.results) { renderResults(j.results, lowQ || j.lowQuality); saveJob(null); resetGenBtn(); loadLibrary(); return; }
        // Track stalls: if nothing has advanced for ~80s, nudge a step in case a
        // trigger was lost, then keep polling.
        if (j.step === curStep) { sameFor++; } else { curStep = j.step || 0; sameFor = 0; }
        setProgress(curStep, total, (j.label || "Working…") + " — you can close the app; it will keep going");
        if (sameFor >= 16) { sameFor = 0; apiPost("api/step", { job: jobId }).catch(function () {}); }
        setTimeout(poll, 5000);
      }, function () { if (myRun === genRun) setTimeout(poll, 5000); });
    }
    poll();
  }

  function finishJob(jobId, lowQ) {
    apiGet("api/status?job=" + encodeURIComponent(jobId)).then(function (r) {
      var j = r.json || {};
      if (j.status === "paused") { handlePaused(jobId, null, false, j); return; }
      if (j.status === "done" && j.results) { renderResults(j.results, lowQ || j.lowQuality); saveJob(null); loadLibrary(); }
      else { showProgress(false); setStatus("Finished, but couldn't load the files. Please reopen the app.", "warn"); }
      resetGenBtn();
    }, function () { showProgress(false); setStatus("Finished, but couldn't load. Please reopen the app.", "warn"); resetGenBtn(); });
  }

  // Populate the plan state from a finished job and render exactly as the old
  // flow did (reusing renderSessions, the folder, and the maps).
  function renderResults(results, lowQ) {
    currentSessions = (results.sessions || []).slice();
    summaryMarkdown = results.summary || "";
    chapterMapData = null; dailyMapData = []; dailyPng = [];
    var parsed = window.MapRender ? parseMapText(results.map || "") : { branches: [], daily: [] };
    if (parsed.branches && parsed.branches.length) chapterMapData = { title: parsed.title, branches: parsed.branches };
    dailyMapData = parsed.daily || [];
    var jobs = (window.MapRender ? dailyMapData : []).map(function (d, i) {
      if (!d || !(d.ideas || []).length) return Promise.resolve();
      return svgObjToImg(window.MapRender.buildDailyMapSVG(d)).then(function (png) { dailyPng[i] = png; }, function () {});
    });
    Promise.all(jobs).then(function () {
      showProgress(false);
      renderSessions(!!lowQ);
      showToolbar(true);
    });
  }

  // On load, pick up a job left running (or finished) on a previous visit.
  function resumeJob() {
    var job = loadJob();
    if (!job || !job.jobId) return;
    genRun++;
    var total = job.total || (job.sessions + 2);
    apiGet("api/status?job=" + encodeURIComponent(job.jobId)).then(function (r) {
      var j = r.json || {};
      if (r.status === 404 || j.status === "missing" || j.status === "error") { saveJob(null); return; }
      el("planResult").classList.remove("hidden");
      el("planTitle").textContent = "Your lesson plan";
      setMeta([job.grade, job.subject, job.sessions + " session" + (job.sessions > 1 ? "s" : "")]);
      el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
      if (j.status === "done" && j.results) { renderResults(j.results, j.lowQuality); saveJob(null); loadLibrary(); return; }
      if (j.status === "paused") { handlePaused(job.jobId, total, !!job.selfRunning, j); return; }
      el("planBody").innerHTML = ""; showToolbar(false);
      showProgress(true); setProgress(j.step || 0, total, (j.label || "Picking up where it left off…"));
      driveJob(job.jobId, total, !!job.selfRunning);
    }, function () { /* offline — try again next load */ });
  }

  // Core generation flow (FALLBACK) — used only if background mode is off.
  function runGenerationSync(base, fileParts) {
    var N = base.sessions;
    var STEPS = N + 2;                         // N sessions + chapter summary + mind maps
    lastRun = { base: base, fileParts: fileParts }; // cache for "Make again"

    genRun++;
    var btn = el("generateBtn");
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = "Making your plan…";
    showCancel(true);
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = "";            // the plan itself stays hidden until ALL sessions are done
    currentSessions = []; summaryMarkdown = ""; lastMarkdown = "";
    chapterMapData = null; dailyMapData = []; dailyPng = [];
    var anyTruncated = false;
    var anyLowQuality = false;
    showToolbar(false);                       // buttons stay away until all sessions are done
    showProgress(true);                       // only a progress bar shows during generation
    setProgress(0, STEPS, "Reading your chapter…");
    el("genStatus").classList.add("hidden");
    el("planTitle").textContent = "Your lesson plan";
    setMeta([base.grade, base.subject, N + " session" + (N > 1 ? "s" : "")]);
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    var k = 0;
    function next() {
      if (k >= N) return Promise.resolve();
      k++;
      setProgress(k - 1, STEPS, "Writing session " + k + " of " + N + "… (about half a minute each — please keep this page open)");
      return postGenerateRetry({
        grade: base.grade, subject: base.subject, sessions: N, sessionNo: k,
        chapterNumber: base.chapterNumber, chapterName: base.chapterName,
        password: getPw(), files: fileParts, prior: currentSessions.join("\n\n")
      }, function (tryNo) {
        setProgress(k - 1, STEPS, "Slow connection — trying session " + k + " again (try " + (tryNo + 1) + " of 3)…");
      }).then(function (json) {
        currentSessions.push(json.markdown || "");
        if (json.truncated) anyTruncated = true;
        if (json.lowQuality) anyLowQuality = true;
        setProgress(currentSessions.length, STEPS,
          currentSessions.length + " of " + N + " session" + (N > 1 ? "s" : "") + " ready…");
        return next();
      });
    }

    // After every session, write the whole-chapter summary. It's a bonus sheet,
    // so a failure here never throws away the sessions the teacher already has.
    function makeSummary() {
      if (!currentSessions.length) return Promise.resolve();
      setProgress(N, STEPS, "Almost done — writing the chapter summary…");
      return postGenerateRetry({
        grade: base.grade, subject: base.subject, sessions: N, mode: "summary",
        chapterNumber: base.chapterNumber, chapterName: base.chapterName,
        password: getPw(), files: fileParts, prior: currentSessions.join("\n\n")
      }, function (tryNo) {
        setProgress(N, STEPS, "Slow connection — trying the summary again (try " + (tryNo + 1) + " of 3)…");
      }).then(function (json) {
        summaryMarkdown = json.markdown || "";
        if (json.lowQuality) anyLowQuality = true;
        setProgress(N + 1, STEPS, "Drawing your mind maps…");
      }, function () { /* summary is optional — keep the sessions regardless */ });
    }

    // Last, draw the mind maps (Chapter Learning Map + a daily map per session).
    // Also optional — a failure never throws away the plan the teacher has.
    function makeMaps() {
      if (!currentSessions.length || !window.MapRender) return Promise.resolve();
      setProgress(N + 1, STEPS, "Drawing your mind maps…");
      return postGenerateRetry({
        grade: base.grade, subject: base.subject, sessions: N, mode: "map",
        chapterNumber: base.chapterNumber, chapterName: base.chapterName,
        password: getPw(), files: fileParts, prior: currentSessions.join("\n\n")
      }, function (tryNo) {
        setProgress(N + 1, STEPS, "Slow connection — trying the mind maps again (try " + (tryNo + 1) + " of 3)…");
      }).then(function (json) {
        var parsed = parseMapText(json.markdown || "");
        if (parsed.branches.length) chapterMapData = { title: parsed.title, branches: parsed.branches };
        dailyMapData = parsed.daily || [];
        // Pre-render each daily map to a PNG so the Evening Post PDFs can embed it.
        var jobs = dailyMapData.map(function (d, i) {
          if (!d || !(d.ideas || []).length) return Promise.resolve();
          return svgObjToImg(window.MapRender.buildDailyMapSVG(d)).then(function (png) { dailyPng[i] = png; }, function () {});
        });
        return Promise.all(jobs);
      }, function () { /* maps are optional */ });
    }

    Promise.resolve().then(next).then(makeSummary).then(makeMaps).then(function () {
      showProgress(false);
      renderSessions(anyTruncated || anyLowQuality); // reveal the whole plan at once
      showToolbar(true);                       // only now are Download / Share / Print available
    }).catch(function (err) {
      showProgress(false);
      var msg = err && err.message ? err.message : "Something went wrong. Please tap “Make again”.";
      if (err && err.status === 401) { setPw(""); showGate(true); }   // password changed — sign in again
      if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the plan maker. Please check your internet and tap “Make again”.";
      if (currentSessions.length) {            // show whatever finished, plus the buttons
        renderSessions(anyTruncated || anyLowQuality);
        showToolbar(true);
        msg += "  (" + currentSessions.length + " session(s) are ready below.)";
      }
      setStatus(msg, "error");
    }).then(function () {
      btn.disabled = false; btn.textContent = oldLabel; showCancel(false);
    });
  }

  function chapterTitle() {
    if (!currentSessions.length) return "Lesson plan";
    var m = currentSessions[0].match(/^#\s+(.+)$/m);
    var t = m ? m[1] : "Lesson plan";
    return t.replace(/\s*[—-]\s*Session.*$/i, "").trim();
  }

  // Parse the mind-map outline (PRD §8.3) into { title, branches, daily }.
  // Branches: '## N. label' with '- pointer' and two-space '  - detail' bullets.
  // Daily: under '# Daily Maps', '## Session k: topic' with '- idea' bullets.
  function parseMapText(md) {
    var lines = String(md || "").replace(/\r\n/g, "\n").split("\n");
    var title = "", branches = [], daily = [], section = "", br = null, ptr = null, day = null;
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i], line = raw.trim();
      if (!line) continue;
      var h2 = line.match(/^##\s+(.*)$/);
      if (h2) {
        var t2 = h2[1].trim();
        if (section === "chapter") { br = { label: t2.replace(/^\d+[.)]\s*/, "").trim(), pointers: [] }; branches.push(br); ptr = null; }
        else if (section === "daily") { var dm = t2.match(/^session\s*\d*\s*[:\-—.]?\s*(.*)$/i); day = { topic: ((dm && dm[1]) || t2).trim() || t2, ideas: [] }; daily.push(day); }
        continue;
      }
      var h1 = line.match(/^#\s+(.*)$/);
      if (h1) {
        var t1 = h1[1].trim();
        if (/^chapter\s*map\s*:/i.test(t1)) { section = "chapter"; title = t1.replace(/^chapter\s*map\s*:\s*/i, "").trim(); }
        else if (/daily\s*maps?/i.test(t1)) { section = "daily"; }
        else if (section === "chapter" && !title) { title = t1; }
        continue;
      }
      var b = raw.match(/^(\s*)[-*+]\s+(.*)$/);
      if (b) {
        var indent = b[1].replace(/\t/g, "  ").length, text = b[2].trim();
        if (section === "chapter") {
          if (indent >= 2 && ptr) { ptr.details.push(text); }
          else if (br) { ptr = { label: text, details: [] }; br.pointers.push(ptr); }
        } else if (section === "daily" && day) { day.ideas.push(text); }
      }
    }
    return { title: title || "Chapter", branches: branches, daily: daily };
  }

  // Wrap a map SVG for crisp, responsive on-screen display.
  function mapCard(svg, label) {
    return '<div class="map-card">' + (label ? '<div class="map-card-label">' + esc(label) + "</div>" : "") + svg + "</div>";
  }
  function renderSessions(truncated) {
    lastMarkdown = currentSessions.concat(summaryMarkdown ? [summaryMarkdown] : []).join("\n\n");
    var html = currentSessions.map(function (md, i) {
      var dm = (window.MapRender && dailyMapData[i] && (dailyMapData[i].ideas || []).length)
        ? mapCard(window.MapRender.buildDailyMapSVG(dailyMapData[i]).svg, "") : "";
      return '<section class="plan-session">' + mdToHtml(md) + dm + "</section>";
    }).join("");
    // The Chapter Learning Map opens the plan on screen (its own landscape file too).
    if (window.MapRender && chapterMapData) {
      html = '<section class="plan-session map-screen">' +
        mapCard(window.MapRender.buildChapterMapSVG(chapterMapData).svg, "") + "</section>" + html;
    }
    if (summaryMarkdown) {
      html += '<section class="plan-session plan-summary">' + mdToHtml(summaryMarkdown) + "</section>";
    }
    if (truncated) {
      html = '<div class="trunc-note">⚠️ This plan may be incomplete. Please tap “Make again” for a fresh one.</div>' + html;
    }
    el("planBody").innerHTML = html;
    planTitleText = chapterTitle();
    var N = parseInt(el("sessions").value, 10) || currentSessions.length;
    el("planTitle").textContent = planTitleText;
    setMeta([el("grade").value, el("subject").value, currentSessions.length + " of " + N + " session" + (N > 1 ? "s" : "")]);
    buildFolder();   // assemble the downloadable / shareable file list
  }

  // ---- Safe Markdown renderer (no external dependency) ------------------
  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function inline(text) {
    var t = esc(text);
    t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
    t = t.replace(/(^|[\s(])_([^_\n]+)_(?=[\s).,!?]|$)/g, "$1<em>$2</em>");
    return t;
  }
  function isTableSep(line) { return /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.indexOf("-") !== -1; }
  function cells(line) {
    return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(function (c) { return c.trim(); });
  }
  // Fixed cue-colour key (matches the house-style sample).
  var CUE_LEGEND = '<div class="cues">' +
    '<span class="cue c-green">Concept</span>' +
    '<span class="cue c-blue">New word</span>' +
    '<span class="cue c-purple">Story</span>' +
    '<span class="cue c-orange">Amazing fact</span>' +
    '<span class="cue c-teal">Cross-curricular</span>' +
    "</div>";
  // Map a Part heading to its colour + icon (house style).
  function partKind(t) {
    if (/^part\s*one\b/i.test(t) || /before\s+class/i.test(t)) return { n: 1, ico: "📋" };
    if (/^part\s*two\b/i.test(t) || /during\s+class/i.test(t)) return { n: 2, ico: "🍎" };
    if (/^part\s*three\b/i.test(t) || /after\s+class/i.test(t)) return { n: 3, ico: "🌙" };
    return null;
  }
  function mdToHtml(md) {
    var lines = String(md).replace(/\r\n/g, "\n").split("\n");
    var out = [], i = 0;
    function list(tag, items) {
      out.push("<" + tag + ">" + items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + tag + ">");
    }
    // Collect lines until the next heading of level <= `level` (used to wrap a
    // whole Story / Evening-Post section in a styled box), advancing i.
    function collectUntil(level, stopRe) {
      var buf = [];
      while (i < lines.length) {
        var hm = lines[i].match(/^(#{1,6})\s+/);
        if (hm && hm[1].length <= level) break;
        if (stopRe && stopRe.test(lines[i].trim())) break;
        buf.push(lines[i]); i++;
      }
      return buf;
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        var lv = h[1].length, txt = h[2].trim();
        // Coloured part banner
        var part = partKind(txt);
        if (lv <= 3 && part) {
          out.push('<div class="part part-' + part.n + '"><span class="ico">' + part.ico + "</span> " + inline(txt) + "</div>");
          i++; continue;
        }
        // Step card:  ### 3 min — Title   (optional description line follows)
        var sm = txt.match(/^(\d+)\s*min\b\s*[—\-–·:]\s*(.+)$/i);
        if (lv >= 3 && sm) {
          i++;
          var desc = [];
          while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^#{1,6}\s/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i])) { desc.push(lines[i]); i++; }
          out.push('<div class="step"><div class="t">' + esc(sm[1]) + ' min</div><div><span class="b">' + inline(sm[2]) + "</span>" +
            (desc.length ? '<span class="d">' + inline(desc.join(" ")) + "</span>" : "") + "</div></div>");
          continue;
        }
        // Cue-colour legend (the app supplies the coloured key)
        if (lv >= 3 && /cue\s*colou?rs/i.test(txt)) {
          out.push("<h3>" + inline(txt) + "</h3>" + CUE_LEGEND);
          i++; continue;
        }
        // Story box (warm serif)
        if (lv >= 2 && /^(the\s+)?story\b/i.test(txt)) {
          i++;
          out.push('<div class="story"><div class="label">📖 ' + inline(txt) + "</div>" + mdToHtml(collectUntil(lv, /^(did you know|✨)/i).join("\n")) + "</div>");
          continue;
        }
        // Evening Post box
        if (lv >= 2 && /^evening\s+post/i.test(txt)) {
          i++;
          out.push("<h3>" + inline(txt) + '</h3><div class="post">' + mdToHtml(collectUntil(lv).join("\n")) + "</div>");
          continue;
        }
        out.push("<h" + lv + ">" + inline(txt) + "</h" + lv + ">"); i++; continue;
      }
      if (line.indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1])) {
        var head = cells(line), rows = []; i += 2;
        while (i < lines.length && lines[i].indexOf("|") !== -1 && !/^\s*$/.test(lines[i])) { rows.push(cells(lines[i])); i++; }
        var th = "<thead><tr>" + head.map(function (c) { return "<th>" + inline(c) + "</th>"; }).join("") + "</tr></thead>";
        var tb = "<tbody>" + rows.map(function (r) {
          return "<tr>" + r.map(function (c, ci) {
            return '<td data-label="' + esc(head[ci] || "") + '">' + inline(c) + "</td>";
          }).join("") + "</tr>";
        }).join("") + "</tbody>";
        out.push("<table>" + th + tb + "</table>"); continue;
      }
      if (/^\s*>\s?/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, "")); i++; }
        out.push("<blockquote>" + q.map(function (x) { return x === "" ? "<br/>" : inline(x); }).join(" ") + "</blockquote>"); continue;
      }
      if (/^\s*[-*+]\s+/.test(line)) {
        var ul = [];
        while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) { ul.push(lines[i].replace(/^\s*[-*+]\s+/, "")); i++; }
        list("ul", ul); continue;
      }
      if (/^\s*\d+[.)]\s+/.test(line)) {
        // Preserve the author's starting number. When bullet sub-lists split a
        // numbered run, each piece becomes its own <ol>; without start="N" they
        // would all restart at "1." (the bug seen in Part Two).
        var startM = line.match(/^\s*(\d+)/);
        var start = startM ? parseInt(startM[1], 10) : 1;
        var ol = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
        out.push('<ol start="' + start + '">' + ol.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</ol>");
        continue;
      }
      var para = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) &&
        !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*[-*+]\s+/.test(lines[i]) &&
        !/^\s*\d+[.)]\s+/.test(lines[i]) && !/^\s*>\s?/.test(lines[i]) &&
        !(lines[i].indexOf("|") !== -1 && i + 1 < lines.length && isTableSep(lines[i + 1]))) {
        para.push(lines[i]); i++;
      }
      var ptext = para.join(" ");
      if (/^chapter progress so far\s*:/i.test(ptext)) {
        out.push('<div class="progress">' + inline(ptext) + "</div>");
      } else if (/^(did you know|✨)/i.test(ptext)) {
        out.push('<div class="dyk"><span class="label">✨ Did You Know?</span> ' +
          inline(ptext.replace(/^(did you know\??\s*:?\s*|✨\s*)/i, "")) + "</div>");
      } else {
        out.push("<p>" + inline(ptext) + "</p>");
      }
    }
    return out.join("\n");
  }

  // ---- PDF (real file) --------------------------------------------------
  // Every downloadable/shareable file is a "doc": { title, sections:[md…],
  // hint, shareText }. The same machinery builds the complete plan, the Chapter
  // Summary, and each Evening Post — only the title and section list differ.
  function safeName(s) {
    return String(s).replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "lesson-plan";
  }
  function pdfFilename(doc) { return "DDIS-" + safeName(doc && (doc.hint || doc.title)) + ".pdf"; }

  // Pull the standalone "### Evening Post" section out of a session's markdown,
  // so it can become its own parent-ready file. Returns "" if none is present.
  function extractEveningPost(md) {
    var lines = String(md).replace(/\r\n/g, "\n").split("\n");
    var s = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^###\s+evening\s+post/i.test(lines[i].trim())) { s = i; break; }
    }
    if (s < 0) return "";
    var buf = [lines[s]];
    for (var j = s + 1; j < lines.length; j++) {
      if (/^#{1,3}\s+/.test(lines[j])) break;   // next #/##/### heading closes it
      buf.push(lines[j]);
    }
    return buf.join("\n").trim();
  }

  // Doc builders -----------------------------------------------------------
  function fullDoc() {
    return {
      title: planTitleText,
      sections: currentSessions.concat(summaryMarkdown ? [summaryMarkdown] : []),
      hint: planTitleText,
      shareText: planTitleText + " — lesson plan from Dr. Dasarathan International School."
    };
  }
  function summaryDoc() {
    return {
      title: planTitleText + " — Chapter Summary",
      sections: [summaryMarkdown],
      hint: planTitleText + " Chapter Summary",
      shareText: planTitleText + " — Chapter Summary (Dr. Dasarathan International School)."
    };
  }
  function eveningDoc(i, ep) {
    var k = i + 1;
    // The daily mind map rides inside the Evening Post (PRD §3.8). The <img>
    // carries EXPLICIT width/height — without them html2canvas lays out the rest
    // of the page before the data-URL decodes and drops everything after it.
    var pre = dailyPng[i]
      ? '<div class="pdf-daily-map"><img src="' + dailyPng[i] + '" width="360" height="208" style="width:360px;height:208px" /></div>' : "";
    return {
      title: planTitleText + " — Evening Post (Session " + k + ")",
      sections: [ep], preHtml: pre,
      hint: planTitleText + " Evening Post S" + k,
      shareText: "Today's class update — " + planTitleText + " (Session " + k + "), " +
        "Dr. Dasarathan International School."
    };
  }
  // The Chapter Learning Map is an image doc (landscape) — rendered separately.
  function chapterMapDoc() {
    return {
      kind: "chaptermap",
      title: planTitleText + " — Chapter Learning Map",
      hint: planTitleText + " Chapter Map",
      shareText: planTitleText + " — Chapter Learning Map (Dr. Dasarathan International School)."
    };
  }

  function buildPdfElement(doc) {
    var wrap = document.createElement("div");
    wrap.className = "pdf-doc";
    // Text-only header (no <img>) — keeps html2canvas from rendering a blank page
    // while an image is still decoding.
    var head =
      '<div class="pdf-head">' +
        '<div class="pdf-school">Dr. Dasarathan International School</div>' +
        '<div class="pdf-motto">Inspire… Explore… Excel… · ICSE, Coimbatore</div>' +
        '<div class="pdf-plan">' + esc(doc.title) + '</div>' +
      '</div>';
    var body = doc.sections.map(function (md, idx) {
      var cls = "plan-session" + (idx > 0 ? " plan-summary" : ""); // page-break before extra sections
      return '<section class="' + cls + '"><div class="rendered">' + mdToHtml(md) + '</div></section>';
    }).join("");
    wrap.innerHTML = head + (doc.preHtml || "") + body;
    return wrap;
  }

  // --- Mind-map images ----------------------------------------------------
  // Rasterise an {svg,width,height} object to a PNG data URL (crisp, and safe
  // for html2canvas, which renders <img> reliably but inline SVG unevenly).
  function svgObjToImg(obj, jpeg) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var scale = 2, c = document.createElement("canvas");
        c.width = obj.width * scale; c.height = obj.height * scale;
        var ctx = c.getContext("2d");
        ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, obj.width, obj.height);
        // JPEG for the standalone map (jsPDF stores PNG as a raw bitmap → ~11MB;
        // a high-quality JPEG of the same map is ~300KB and still crisp at 2×).
        resolve(jpeg ? c.toDataURL("image/jpeg", 0.94) : c.toDataURL("image/png"));
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(obj.svg);
    });
  }
  // Build the Chapter Learning Map as a one-page A4 LANDSCAPE PDF. We obtain a
  // jsPDF instance via a tiny blank render (the bundle exposes only html2pdf),
  // then place the map ourselves so it is always contained on a single page.
  function chapterMapPdfBlob() {
    if (!window.MapRender || !chapterMapData) return Promise.reject(new Error("no map"));
    var m = window.MapRender.buildChapterMapSVG(chapterMapData);
    return svgObjToImg(m, true).then(function (png) {
      var tiny = document.createElement("div");
      tiny.style.cssText = "width:8px;height:8px;background:#fff";
      document.body.appendChild(tiny);
      return window.html2pdf().set({
        jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        html2canvas: { scale: 1, backgroundColor: "#ffffff" }
      }).from(tiny).toPdf().get("pdf").then(function (pdf) {
        if (tiny.parentNode) tiny.parentNode.removeChild(tiny);
        var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
        var mg = 8, top = 20;
        pdf.setFont("helvetica", "bold"); pdf.setFontSize(13); pdf.setTextColor(27, 58, 91);
        pdf.text("Dr. Dasarathan International School", mg, 12);
        pdf.setFont("helvetica", "italic"); pdf.setFontSize(9); pdf.setTextColor(120, 130, 148);
        pdf.text("Inspire… Explore… Excel… · ICSE, Coimbatore", mg, 17);
        var availW = pw - mg * 2, availH = ph - top - mg, ar = m.width / m.height;
        var dw = availW, dh = dw / ar; if (dh > availH) { dh = availH; dw = dh * ar; }
        pdf.addImage(png, "JPEG", (pw - dw) / 2, top + (availH - dh) / 2, dw, dh);
        addFooters(pdf, planTitleText + " — Chapter Learning Map");
        return pdf.output("blob");
      });
    });
  }
  function saveBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function shareBlob(blob, name, title, text) {
    var file = new File([blob], name, { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: title, text: text }).catch(function () {});
    } else {
      saveBlob(blob, name);
      window.open("https://wa.me/?text=" + encodeURIComponent(text + " (The PDF has been saved to your device — attach it in WhatsApp.)"), "_blank");
    }
  }
  // Draw a thin footer on every page: school · title on the left, version ·
  // date · page number on the right (house-style requirement).
  function addFooters(pdf, title) {
    try {
      var total = pdf.internal.getNumberOfPages();
      var w = pdf.internal.pageSize.getWidth();
      var h = pdf.internal.pageSize.getHeight();
      var months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      var dt = new Date();
      var dateStr = months[dt.getMonth()] + " " + dt.getFullYear();
      var left = "Dr. Dasarathan International School · " + title;
      if (left.length > 72) left = left.slice(0, 71) + "…";
      for (var p = 1; p <= total; p++) {
        pdf.setPage(p);
        pdf.setDrawColor(225, 228, 235); pdf.setLineWidth(0.2);
        pdf.line(10, h - 9, w - 10, h - 9);
        pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.setTextColor(150, 150, 150);
        pdf.text(left, 10, h - 5);
        pdf.text("Framework v1.1 · " + dateStr + "  ·  Page " + p + " of " + total, w - 10, h - 5, { align: "right" });
      }
    } catch (e) { /* footer is non-critical — never block the download */ }
  }
  function makePdfWorker(doc) {
    // html2canvas only captures elements in NORMAL document flow (fixed/absolute/
    // off-screen render blank) AND mis-places the capture when the target sits in
    // a flex/centered parent (clipped edges + top gap). So the plan is a plain
    // top-level block at x=0, and the "Preparing…" cover is a SEPARATE fixed
    // overlay on top — never the plan's parent.
    var cover = document.createElement("div");
    cover.className = "pdf-stage";
    cover.innerHTML = '<div class="pdf-stage-msg">Preparing your file…</div>';
    document.body.appendChild(cover);
    var element = buildPdfElement(doc);
    // Mount at the very TOP of the document and scroll to origin: when the
    // captured element sits far down a long page, html2canvas leaks its offset
    // into the canvas as a big blank top margin. Prepending + scroll(0,0) keeps
    // the element at y≈0 so capture starts at the real content.
    var prevScroll = window.scrollY || 0;
    document.body.insertBefore(element, document.body.firstChild);
    window.scrollTo(0, 0);
    var opt = {
      margin: [10, 10, 12, 10],
      filename: pdfFilename(doc),
      image: { type: "jpeg", quality: 0.85 },   // ~half the file size, still crisp for text
      // windowWidth pins the capture to the document's own width (760) on every
      // device, so a phone's narrow screen can't trigger the mobile layout or clip
      // the right edge. Must equal the .pdf-doc width exactly — 800 left slack that
      // re-introduced the right-edge clip; a narrow real viewport produced blank,
      // stacked, many-page output.
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true, x: 0, y: 0, scrollX: 0, scrollY: 0, windowWidth: 760, width: 760 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    // Render to the jsPDF instance, stamp footers on every page, then the caller
    // continues with .save() / .outputPdf("blob").
    var worker = window.html2pdf().set(opt).from(element).toPdf().get("pdf").then(function (pdf) {
      addFooters(pdf, doc.title);
    });
    return { worker: worker, cleanup: function () {
      if (element.parentNode) document.body.removeChild(element);
      if (cover.parentNode) document.body.removeChild(cover);
      window.scrollTo(0, prevScroll);
    } };
  }
  function docReady(doc) {
    if (!doc || !window.html2pdf) return false;
    if (doc.kind === "chaptermap") return !!chapterMapData;
    return doc.sections && doc.sections.filter(function (s) { return s && s.trim(); }).length;
  }
  function downloadDoc(doc) {
    if (!docReady(doc)) return;
    if (doc.kind === "chaptermap") {
      chapterMapPdfBlob().then(function (blob) { saveBlob(blob, pdfFilename(doc)); }, function () {});
      return;
    }
    var j = makePdfWorker(doc);
    j.worker.save().then(j.cleanup, j.cleanup);
  }
  function shareDoc(doc) {
    if (!docReady(doc)) return;
    var name = pdfFilename(doc);
    if (doc.kind === "chaptermap") {
      chapterMapPdfBlob().then(function (blob) { shareBlob(blob, name, doc.title, doc.shareText); }, function () {});
      return;
    }
    var j = makePdfWorker(doc);
    j.worker.outputPdf("blob").then(function (blob) {
      j.cleanup();
      shareBlob(blob, name, doc.title, doc.shareText);
    }, function () { j.cleanup(); });
  }

  // ---- Chapter folder ----------------------------------------------------
  // Build the list of files the teacher can open or share. No extra Gemini
  // calls — every file comes from the markdown already generated.
  var folderFiles = [];
  function buildFolder() {
    folderFiles = [];
    var n = currentSessions.length;
    folderFiles.push({
      ico: "📘", name: "Complete Lesson Plan",
      sub: n + " session" + (n > 1 ? "s" : "") + (summaryMarkdown ? " + summary" : "") + " · for you",
      doc: fullDoc(),
      acts: [{ act: "download", label: "Download", primary: true }, { act: "print", label: "Print" }]
    });
    if (chapterMapData) {
      folderFiles.push({
        ico: "🗺️", name: "Chapter Learning Map",
        sub: "A colourful picture of the chapter",
        doc: chapterMapDoc(),
        acts: [{ act: "download", label: "Download", primary: true }, { act: "share", label: "Share" }]
      });
    }
    if (summaryMarkdown) {
      folderFiles.push({
        ico: "📝", name: "Chapter Summary",
        sub: "Revision · teacher & child",
        doc: summaryDoc(),
        acts: [{ act: "download", label: "Download", primary: true }, { act: "share", label: "Share" }]
      });
    }
    for (var i = 0; i < currentSessions.length; i++) {
      var ep = extractEveningPost(currentSessions[i]);
      if (!ep) continue;
      folderFiles.push({
        ico: "💌", name: "Evening Post · Session " + (i + 1),
        sub: "For parents · WhatsApp",
        doc: eveningDoc(i, ep),
        acts: [{ act: "share", label: "Share", primary: true }, { act: "download", label: "Download" }]
      });
    }
    el("filesList").innerHTML = folderFiles.map(function (f, idx) {
      var acts = f.acts.map(function (a) {
        return '<button type="button" class="btn small ' + (a.primary ? "primary" : "ghost") +
          '" data-i="' + idx + '" data-act="' + a.act + '">' + a.label + "</button>";
      }).join("");
      return '<div class="file-row">' +
        '<div class="file-info"><span class="file-ico">' + f.ico + '</span>' +
        '<span class="file-text"><span class="file-name">' + esc(f.name) + '</span>' +
        '<span class="file-sub">' + esc(f.sub) + "</span></span></div>" +
        '<div class="file-acts">' + acts + "</div></div>";
    }).join("");
  }
  function onFileAct(e) {
    var b = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!b) return;
    var f = folderFiles[parseInt(b.getAttribute("data-i"), 10)];
    if (!f) return;
    var act = b.getAttribute("data-act");
    if (act === "print") { window.print(); return; }
    if (act === "download") { downloadDoc(f.doc); return; }
    if (act === "share") { shareDoc(f.doc); return; }
  }

  // ---- Paused session → "Retry this session" ---------------------------
  // A session used up its one automatic retry. We keep every finished session,
  // show them below, and offer a button to try just the stuck one again.
  function hideRetryBanner() { var b = el("retryBanner"); if (b) { b.classList.add("hidden"); b.innerHTML = ""; } }
  function showRetryBanner(jobId, sessionNo) {
    var b = el("retryBanner"); if (!b) return;
    b.innerHTML =
      '<div class="retry-msg">Session ' + sessionNo + ' could not be written just now. ' +
      'Everything else is ready below. You can retry just this one session.</div>' +
      '<button type="button" class="btn small primary" id="retryStepBtn">Retry session ' + sessionNo + '</button>';
    b.classList.remove("hidden");
    var rb = el("retryStepBtn");
    if (rb) rb.addEventListener("click", function () { resumeStep(jobId, sessionNo); });
  }
  function resumeStep(jobId, sessionNo) {
    genRun++;
    var job = loadJob() || {};
    var total = job.total || 0, selfRunning = !!job.selfRunning;
    hideRetryBanner(); showCancel(true);
    showProgress(true); setProgress(0, total, "Trying that session again…");
    var btn = el("generateBtn"); btn.disabled = true; btn.textContent = "Making your plan…";
    apiPost("api/step", { job: jobId, resume: true }).then(function () {
      driveJob(jobId, total, selfRunning);
    }, function () {
      showProgress(false); setStatus("Couldn't reach the plan maker. Please try again.", "error"); resetGenBtn();
      showRetryBanner(jobId, sessionNo);
    });
  }
  // Land in the paused state: show whatever finished, then the retry banner.
  function handlePaused(jobId, total, selfRunning, j) {
    function proceed(jj) {
      showProgress(false);
      if (jj.results && jj.results.sessions && jj.results.sessions.length) { renderResults(jj.results, jj.lowQuality); }
      else { showToolbar(false); el("planBody").innerHTML = ""; }
      var n = (jj.failedStep != null ? jj.failedStep : (jj.step || 0)) + 1;
      showRetryBanner(jobId, n);
      resetGenBtn();
    }
    if (j && j.results) { proceed(j); return; }
    apiGet("api/status?job=" + encodeURIComponent(jobId)).then(function (r) { proceed(r.json || j || {}); }, function () { proceed(j || {}); });
  }

  // ---- My Chapters library ---------------------------------------------
  var libItems = [];
  function libDate(ms) {
    try { return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }); }
    catch (e) { return ""; }
  }
  function setSelect(id, val) {
    var s = el(id); if (!s || val == null) return;
    for (var o = 0; o < s.options.length; o++) { if (s.options[o].value === val) { s.value = val; return; } }
  }
  function loadLibrary() {
    var listEl = el("libList"); if (!listEl) return;
    var loading = el("libLoading"), empty = el("libEmpty");
    loading.classList.remove("hidden"); empty.classList.add("hidden");
    apiGet("api/library?pw=" + encodeURIComponent(getPw())).then(function (r) {
      loading.classList.add("hidden");
      if (r.status === 401 || r.status === 503 || !r.json) { listEl.innerHTML = ""; return; }
      renderLibrary((r.json && r.json.items) || []);
    }, function () { loading.classList.add("hidden"); });
  }
  function renderLibrary(items) {
    libItems = items || [];
    var listEl = el("libList"), empty = el("libEmpty");
    if (!libItems.length) { listEl.innerHTML = ""; empty.classList.remove("hidden"); return; }
    empty.classList.add("hidden");
    listEl.innerHTML = libItems.map(function (it) {
      var n = it.sessions || 0;
      var meta = [it.grade, it.subject, n + " session" + (n > 1 ? "s" : ""), libDate(it.createdAt)]
        .filter(Boolean).join(" · ");
      return '<div class="lib-row">' +
        '<div class="lib-info"><span class="lib-ico">📘</span>' +
        '<span class="lib-text"><span class="lib-name">' + esc(it.title || "Chapter") + '</span>' +
        '<span class="lib-sub">' + esc(meta) + "</span></span></div>" +
        '<div class="lib-acts">' +
        '<button type="button" class="btn small primary" data-libact="open" data-id="' + esc(it.id) + '">Open</button>' +
        '<button type="button" class="btn small ghost" data-libact="delete" data-id="' + esc(it.id) + '">Delete</button>' +
        "</div></div>";
    }).join("");
  }
  function openChapter(id) {
    var loading = el("libLoading"); loading.classList.remove("hidden");
    apiGet("api/library?id=" + encodeURIComponent(id) + "&pw=" + encodeURIComponent(getPw())).then(function (r) {
      loading.classList.add("hidden");
      if (!r.ok || !r.json || !r.json.results) { setStatus("That chapter could not be opened.", "warn"); return; }
      var it = r.json;
      setSelect("grade", it.grade); setSelect("subject", it.subject);
      hideRetryBanner(); showProgress(false); el("genStatus").classList.add("hidden");
      el("planResult").classList.remove("hidden");
      el("planTitle").textContent = it.title || "Your lesson plan";
      renderResults(it.results, false);
      el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
    }, function () { loading.classList.add("hidden"); setStatus("Couldn't reach the library. Please try again.", "warn"); });
  }
  function deleteChapter(id) {
    if (!window.confirm("Delete this chapter from the library? This cannot be undone.")) return;
    apiPost("api/library?id=" + encodeURIComponent(id), { action: "delete", id: id, password: getPw() })
      .then(function () { loadLibrary(); }, function () {});
  }
  function onLibAct(e) {
    var b = e.target.closest ? e.target.closest("button[data-libact]") : null;
    if (!b) return;
    var id = b.getAttribute("data-id"), act = b.getAttribute("data-libact");
    if (act === "open") openChapter(id);
    else if (act === "delete") deleteChapter(id);
  }

  // ---- Wiring -----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    if (window.pdfjsLib) {                     // point pdf.js at its vendored worker
      try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "assets/vendor/pdf.worker.min.js"; } catch (e) {}
    }
    loadLastChoice();
    initLoginGate();
    resumeJob();                               // pick up a chapter still cooking from a previous visit
    loadLibrary();                             // show the shared library of saved chapters
    el("loginForm").addEventListener("submit", handleLogin);
    el("chapter-form").addEventListener("submit", handleSubmit);
    el("regenBtn").addEventListener("click", regenerate);
    el("cancelBtn").addEventListener("click", cancelGeneration);
    el("filesList").addEventListener("click", onFileAct);
    el("libRefresh").addEventListener("click", loadLibrary);
    el("libList").addEventListener("click", onLibAct);
    el("chapterFile").addEventListener("change", function () {
      if (el("chapterFile").files.length) el("field-chapterFile").classList.remove("invalid");
    });
  });
})();
