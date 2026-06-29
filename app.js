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
      if (ok) { setPw(pw); showGate(false); }
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

  // ---- Status + state ---------------------------------------------------
  function setStatus(text, kind) {
    var s = el("genStatus");
    s.className = "gen-status " + (kind || "");
    s.textContent = text;
    s.classList.remove("hidden");
  }
  function showToolbar(on) { el("toolbarActions").classList.toggle("hidden", !on); }
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

    var total = 0;
    for (var i = 0; i < files.length; i++) total += files[i].size;
    if (total > MAX_BYTES) {
      el("planResult").classList.remove("hidden"); el("planBody").innerHTML = ""; showToolbar(false);
      setStatus("Your file is " + (total / 1048576).toFixed(1) + " MB. Please keep it under 3 MB — try a smaller or shorter chapter PDF.", "warn");
      el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    saveLastChoice();                         // remember grade / subject / sessions
    var N = parseInt(el("sessions").value, 10) || 1;
    var base = {
      grade: el("grade").value, subject: el("subject").value, sessions: N,
      chapterNumber: el("chapterNumber").value.trim(),
      chapterName: el("chapterName").value.trim()
    };

    var jobs = [];
    for (var j = 0; j < files.length; j++) jobs.push(fileToInline(files[j]));
    Promise.all(jobs).then(function (fileParts) {
      runGeneration(base, fileParts);
    });
  }

  // Re-run the last generation with the SAME inputs, reusing the already-read
  // file parts so we never read the file from disk again.
  function regenerate() {
    if (!lastRun) return;
    runGeneration(lastRun.base, lastRun.fileParts);
  }

  // Core generation flow — used by both Generate and "Make again".
  function runGeneration(base, fileParts) {
    var N = base.sessions;
    lastRun = { base: base, fileParts: fileParts }; // cache for "Make again"

    var btn = el("generateBtn");
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = "Making your plan…";
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = "";            // the plan itself stays hidden until ALL sessions are done
    currentSessions = []; lastMarkdown = "";
    var anyTruncated = false;
    var anyLowQuality = false;
    showToolbar(false);                       // buttons stay away until all sessions are done
    showProgress(true);                       // only a progress bar shows during generation
    setProgress(0, N, "Reading your chapter…");
    el("genStatus").classList.add("hidden");
    el("planTitle").textContent = "Your lesson plan";
    setMeta([base.grade, base.subject, N + " session" + (N > 1 ? "s" : "")]);
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    var k = 0;
    function next() {
      if (k >= N) return Promise.resolve();
      k++;
      setProgress(k - 1, N, "Writing session " + k + " of " + N + "… (about half a minute each — please keep this page open)");
      return postGenerateRetry({
        grade: base.grade, subject: base.subject, sessions: N, sessionNo: k,
        chapterNumber: base.chapterNumber, chapterName: base.chapterName,
        password: getPw(), files: fileParts, prior: currentSessions.join("\n\n")
      }, function (tryNo) {
        setProgress(k - 1, N, "Slow connection — trying session " + k + " again (try " + (tryNo + 1) + " of 3)…");
      }).then(function (json) {
        currentSessions.push(json.markdown || "");
        if (json.truncated) anyTruncated = true;
        if (json.lowQuality) anyLowQuality = true;
        setProgress(currentSessions.length, N,
          currentSessions.length + " of " + N + " session" + (N > 1 ? "s" : "") + " ready" +
          (currentSessions.length < N ? "…" : ""));
        return next();
      });
    }

    Promise.resolve().then(next).then(function () {
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
      btn.disabled = false; btn.textContent = oldLabel;
    });
  }

  function chapterTitle() {
    if (!currentSessions.length) return "Lesson plan";
    var m = currentSessions[0].match(/^#\s+(.+)$/m);
    var t = m ? m[1] : "Lesson plan";
    return t.replace(/\s*[—-]\s*Session.*$/i, "").trim();
  }

  function renderSessions(truncated) {
    lastMarkdown = currentSessions.join("\n\n");
    var html = currentSessions.map(function (md) {
      return '<section class="plan-session">' + mdToHtml(md) + "</section>";
    }).join("");
    if (truncated) {
      html = '<div class="trunc-note">⚠️ This plan may be incomplete. Please tap “Make again” for a fresh one.</div>' + html;
    }
    el("planBody").innerHTML = html;
    planTitleText = chapterTitle();
    var N = parseInt(el("sessions").value, 10) || currentSessions.length;
    el("planTitle").textContent = planTitleText;
    setMeta([el("grade").value, el("subject").value, currentSessions.length + " of " + N + " session" + (N > 1 ? "s" : "")]);
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
  function pdfFilename() {
    var t = planTitleText.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-").slice(0, 60) || "lesson-plan";
    return "DDIS-" + t + ".pdf";
  }
  function buildPdfElement() {
    var wrap = document.createElement("div");
    wrap.className = "pdf-doc";
    // Text-only header (no <img>) — keeps html2canvas from rendering a blank page
    // while an image is still decoding.
    var head =
      '<div class="pdf-head">' +
        '<div class="pdf-school">Dr. Dasarathan International School</div>' +
        '<div class="pdf-motto">Inspire… Explore… Excel… · ICSE, Coimbatore</div>' +
        '<div class="pdf-plan">' + esc(planTitleText) + '</div>' +
      '</div>';
    var body = currentSessions.map(function (md) {
      return '<section class="plan-session"><div class="rendered">' + mdToHtml(md) + '</div></section>';
    }).join("");
    wrap.innerHTML = head + body;
    return wrap;
  }
  // Draw a thin footer on every page: school · chapter on the left, version ·
  // date · page number on the right (house-style requirement).
  function addFooters(pdf) {
    try {
      var total = pdf.internal.getNumberOfPages();
      var w = pdf.internal.pageSize.getWidth();
      var h = pdf.internal.pageSize.getHeight();
      var months = ["January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"];
      var dt = new Date();
      var dateStr = months[dt.getMonth()] + " " + dt.getFullYear();
      var left = "Dr. Dasarathan International School · " + planTitleText;
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
  function makePdfWorker() {
    // html2canvas only captures elements in NORMAL document flow (fixed/absolute/
    // off-screen render blank) AND mis-places the capture when the target sits in
    // a flex/centered parent (clipped edges + top gap). So the plan is a plain
    // top-level block at x=0, and the "Preparing…" cover is a SEPARATE fixed
    // overlay on top — never the plan's parent.
    var cover = document.createElement("div");
    cover.className = "pdf-stage";
    cover.innerHTML = '<div class="pdf-stage-msg">Preparing your PDF…</div>';
    document.body.appendChild(cover);
    var element = buildPdfElement();
    // Mount at the very TOP of the document and scroll to origin: when the
    // captured element sits far down a long page, html2canvas leaks its offset
    // into the canvas as a big blank top margin. Prepending + scroll(0,0) keeps
    // the element at y≈0 so capture starts at the real content.
    var prevScroll = window.scrollY || 0;
    document.body.insertBefore(element, document.body.firstChild);
    window.scrollTo(0, 0);
    var opt = {
      margin: [10, 10, 12, 10],
      filename: pdfFilename(),
      image: { type: "jpeg", quality: 0.96 },
      // windowWidth pins the capture to the document's own width (760) on every
      // device, so a phone's narrow screen can't trigger the mobile layout or clip
      // the right edge. Must equal the .pdf-doc width exactly — 800 left slack that
      // re-introduced the right-edge clip; a narrow real viewport produced blank,
      // stacked, many-page output.
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true, scrollX: 0, scrollY: 0, windowWidth: 760 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    // Render to the jsPDF instance, stamp footers on every page, then the caller
    // continues with .save() / .outputPdf("blob").
    var worker = window.html2pdf().set(opt).from(element).toPdf().get("pdf").then(addFooters);
    return { worker: worker, cleanup: function () {
      if (element.parentNode) document.body.removeChild(element);
      if (cover.parentNode) document.body.removeChild(cover);
      window.scrollTo(0, prevScroll);
    } };
  }
  function downloadPdf() {
    if (!currentSessions.length || !window.html2pdf) return;
    var j = makePdfWorker();
    j.worker.save().then(j.cleanup, j.cleanup);
  }
  function sharePdf() {
    if (!currentSessions.length || !window.html2pdf) return;
    var j = makePdfWorker();
    j.worker.outputPdf("blob").then(function (blob) {
      j.cleanup();
      var file = new File([blob], pdfFilename(), { type: "application/pdf" });
      var text = planTitleText + " — lesson plan from Dr. Dasarathan International School.";
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: planTitleText, text: text }).catch(function () {});
      } else {
        // Fallback: save the PDF, then open WhatsApp to attach it.
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a"); a.href = url; a.download = pdfFilename();
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
        window.open("https://wa.me/?text=" + encodeURIComponent(text + " (The PDF has been saved to your device — attach it in WhatsApp.)"), "_blank");
      }
    }, function () { j.cleanup(); });
  }

  // ---- Wiring -----------------------------------------------------------
  document.addEventListener("DOMContentLoaded", function () {
    loadLastChoice();
    initLoginGate();
    el("loginForm").addEventListener("submit", handleLogin);
    el("chapter-form").addEventListener("submit", handleSubmit);
    el("pdfBtn").addEventListener("click", downloadPdf);
    el("waBtn").addEventListener("click", sharePdf);
    el("printPlanBtn").addEventListener("click", function () { window.print(); });
    el("regenBtn").addEventListener("click", regenerate);
    el("chapterFile").addEventListener("change", function () {
      if (el("chapterFile").files.length) el("field-chapterFile").classList.remove("invalid");
    });
  });
})();
