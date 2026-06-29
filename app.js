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

  function postGenerate(payload) {
    return fetch("api/generate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    }).then(function (res) {
      return res.text().then(function (raw) {
        var json; try { json = JSON.parse(raw); } catch (e) { json = null; }
        if (!res.ok || !json) {
          if (res.status === 404 || res.status === 405 || !json) {
            throw new Error("This page shows the planner, but the school's generator isn't connected here yet. Please open the school's Lesson Planner link (the one set up on Vercel).");
          }
          throw new Error((json && json.error) || ("Request failed (" + res.status + ")."));
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
      setStatus("Your upload is " + (total / 1048576).toFixed(1) + " MB. Please keep it under 3 MB — try a PDF, or fewer / smaller photos.", "warn");
      el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var N = parseInt(el("sessions").value, 10) || 1;
    var base = { grade: el("grade").value, subject: el("subject").value, sessions: N };

    var btn = el("generateBtn");
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = "Generating…";
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = "";            // the plan itself stays hidden until ALL sessions are done
    currentSessions = []; lastMarkdown = "";
    var anyTruncated = false;
    showToolbar(false);                       // buttons stay away until all sessions are done
    showProgress(true);                       // only a progress bar shows during generation
    setProgress(0, N, "Reading your chapter…");
    el("genStatus").classList.add("hidden");
    el("planTitle").textContent = base.grade + " · " + base.subject + " · " + N + " session" + (N > 1 ? "s" : "");
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    var jobs = [];
    for (var j = 0; j < files.length; j++) jobs.push(fileToInline(files[j]));

    Promise.all(jobs).then(function (fileParts) {
      var k = 0;
      function next() {
        if (k >= N) return Promise.resolve();
        k++;
        setProgress(k - 1, N, "Writing session " + k + " of " + N + "… (about half a minute each — please keep this page open)");
        return postGenerateRetry({
          grade: base.grade, subject: base.subject, sessions: N, sessionNo: k,
          files: fileParts, prior: currentSessions.join("\n\n")
        }, function (tryNo) {
          setProgress(k - 1, N, "Connection hiccup — retrying session " + k + " (try " + (tryNo + 1) + " of 3)…");
        }).then(function (json) {
          currentSessions.push(json.markdown || "");
          if (json.truncated) anyTruncated = true;
          setProgress(currentSessions.length, N,
            currentSessions.length + " of " + N + " session" + (N > 1 ? "s" : "") + " ready" +
            (currentSessions.length < N ? "…" : ""));
          return next();
        });
      }
      return next();
    }).then(function () {
      showProgress(false);
      renderSessions(anyTruncated);           // reveal the whole plan at once
      showToolbar(true);                       // only now are Download / Share / Print available
    }).catch(function (err) {
      showProgress(false);
      var msg = err && err.message ? err.message : "Something went wrong.";
      if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the planner. Please check your internet and try again.";
      if (currentSessions.length) {            // show whatever finished, plus the buttons
        renderSessions(anyTruncated);
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
      html = '<div class="trunc-note">⚠️ A session may have stopped early. You can press Generate again if needed.</div>' + html;
    }
    el("planBody").innerHTML = html;
    planTitleText = chapterTitle();
    var N = parseInt(el("sessions").value, 10) || currentSessions.length;
    el("planTitle").textContent = planTitleText + " · " + currentSessions.length + "/" + N + " sessions";
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
  function mdToHtml(md) {
    var lines = String(md).replace(/\r\n/g, "\n").split("\n");
    var out = [], i = 0;
    function list(tag, items) {
      out.push("<" + tag + ">" + items.map(function (x) { return "<li>" + inline(x) + "</li>"; }).join("") + "</" + tag + ">");
    }
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }
      if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("<hr/>"); i++; continue; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { var lv = h[1].length; out.push("<h" + lv + ">" + inline(h[2]) + "</h" + lv + ">"); i++; continue; }
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
      out.push("<p>" + inline(para.join(" ")) + "</p>");
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
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true, scrollX: 0, scrollY: 0 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    var worker = window.html2pdf().set(opt).from(element);
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
    el("chapter-form").addEventListener("submit", handleSubmit);
    el("pdfBtn").addEventListener("click", downloadPdf);
    el("waBtn").addEventListener("click", sharePdf);
    el("printPlanBtn").addEventListener("click", function () { window.print(); });
    el("chapterFile").addEventListener("change", function () {
      if (el("chapterFile").files.length) el("field-chapterFile").classList.remove("invalid");
    });
  });
})();
