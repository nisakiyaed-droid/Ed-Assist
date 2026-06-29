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
  function setButtonsEnabled(on) {
    el("pdfBtn").disabled = !on;
    el("waBtn").disabled = !on;
    el("printPlanBtn").disabled = !on;
  }

  // ---- Generate ---------------------------------------------------------
  var planTitleText = "Lesson plan";

  function handleSubmit(e) {
    e.preventDefault();
    var files = el("chapterFile").files;
    var field = el("field-chapterFile");
    if (!files || !files.length) {
      field.classList.add("invalid");
      el("chapterFile").focus();
      return;
    }
    field.classList.remove("invalid");

    var total = 0;
    for (var i = 0; i < files.length; i++) total += files[i].size;
    if (total > MAX_BYTES) {
      el("planResult").classList.remove("hidden");
      el("planBody").innerHTML = "";
      setButtonsEnabled(false);
      setStatus("Your upload is " + (total / 1048576).toFixed(1) + " MB. Please keep it under 3 MB — try a PDF, or fewer / smaller photos.", "warn");
      el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    var data = {
      grade: el("grade").value,
      subject: el("subject").value,
      sessions: el("sessions").value,
      sessionNo: el("sessionNo").value
    };

    var btn = el("generateBtn");
    btn.disabled = true;
    var oldLabel = btn.textContent;
    btn.textContent = "Generating…";
    el("planResult").classList.remove("hidden");
    el("planBody").innerHTML = "";
    setButtonsEnabled(false);
    el("planTitle").textContent = data.grade + " · " + data.subject + " · Session " + data.sessionNo;
    setStatus("Reading your chapter and writing the plan… this can take up to a minute.", "busy");
    el("planResult").scrollIntoView({ behavior: "smooth", block: "start" });

    var jobs = [];
    for (var j = 0; j < files.length; j++) jobs.push(fileToInline(files[j]));

    Promise.all(jobs).then(function (parts) {
      data.files = parts;
      return fetch("api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
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
    }).then(function (json) {
      el("genStatus").classList.add("hidden");
      renderPlan(json.markdown, json.truncated);
      setButtonsEnabled(true);
    }).catch(function (err) {
      var msg = err && err.message ? err.message : "Something went wrong.";
      if (/Failed to fetch|NetworkError/i.test(msg)) msg = "Couldn't reach the planner. Please check your internet and try again.";
      setStatus(msg, "error");
    }).then(function () {
      btn.disabled = false;
      btn.textContent = oldLabel;
    });
  }

  var lastMarkdown = "";
  function renderPlan(markdown, truncated) {
    lastMarkdown = markdown || "";
    var banner = truncated
      ? '<div class="trunc-note">⚠️ This plan may have stopped early. You can press Generate again, or pick a shorter session.</div>'
      : "";
    el("planBody").innerHTML = banner + mdToHtml(lastMarkdown);
    var h1 = el("planBody").querySelector("h1");
    planTitleText = h1 ? h1.textContent : "Lesson plan";
    el("planTitle").textContent = planTitleText;
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
        var ol = [];
        while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { ol.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
        list("ol", ol); continue;
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
    wrap.innerHTML =
      '<div class="pdf-head">' +
        '<img src="assets/school-mark.png" alt="" />' +
        '<div><div class="pdf-school">Dr. Dasarathan International School</div>' +
        '<div class="pdf-motto">Inspire… Explore… Excel… · ICSE, Coimbatore</div></div>' +
      '</div>' +
      '<div class="rendered">' + mdToHtml(lastMarkdown) + '</div>';
    return wrap;
  }
  function makePdfWorker() {
    var element = buildPdfElement();
    document.body.appendChild(element);
    var opt = {
      margin: [10, 10, 12, 10],
      filename: pdfFilename(),
      image: { type: "jpeg", quality: 0.96 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff", useCORS: true, windowWidth: 800 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] }
    };
    var worker = window.html2pdf().set(opt).from(element);
    return { worker: worker, cleanup: function () { document.body.removeChild(element); } };
  }
  function downloadPdf() {
    if (!lastMarkdown || !window.html2pdf) return;
    var j = makePdfWorker();
    j.worker.save().then(j.cleanup, j.cleanup);
  }
  function sharePdf() {
    if (!lastMarkdown || !window.html2pdf) return;
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
