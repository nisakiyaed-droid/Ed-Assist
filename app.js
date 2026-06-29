/* Ed-Assist — Lesson Plan Creator
 * Free template engine. Generates a structured lesson plan from a few inputs.
 *
 * NOTE FOR LATER: To add AI-powered plans (Claude), replace the call to
 * buildPlanFromTemplate() inside handleGenerate() with an async call to a
 * small backend endpoint that talks to the Anthropic API. The render code
 * below works with any plan object that matches the same shape, so the UI
 * does not need to change.
 */

(function () {
  "use strict";

  // ----- Helpers ---------------------------------------------------------

  function el(id) { return document.getElementById(id); }

  function titleCase(s) {
    return s.replace(/\w\S*/g, function (t) {
      return t.charAt(0).toUpperCase() + t.slice(1);
    });
  }

  function cleanList(text) {
    return (text || "")
      .split(/[\n;]+/)
      .map(function (s) { return s.trim().replace(/^[-•*]\s*/, ""); })
      .filter(Boolean);
  }

  // ----- The template engine --------------------------------------------

  // Build the lesson's learning objectives.
  function buildObjectives(topic, goals, style) {
    var custom = cleanList(goals);
    if (custom.length) {
      return custom.map(function (g) {
        // Make sure each reads like an objective.
        return /^(explain|describe|identify|analyze|apply|create|compare|evaluate|understand|define|list|demonstrate)/i.test(g)
          ? g
          : "Be able to " + g.charAt(0).toLowerCase() + g.slice(1);
      });
    }
    // Default objectives derived from the topic + Bloom's-style verbs.
    var verbs = {
      "hands-on":   ["Demonstrate", "Apply", "Explain"],
      "discussion": ["Discuss", "Evaluate", "Explain"],
      "direct":     ["Define", "Describe", "Identify"],
      "balanced":   ["Explain", "Identify", "Apply"]
    }[style] || ["Explain", "Identify", "Apply"];

    return [
      verbs[0] + " the key ideas behind " + topic + ".",
      verbs[1] + " the main parts, terms, or steps involved in " + topic + ".",
      verbs[2] + " what they learn about " + topic + " to a real example or question."
    ];
  }

  function buildMaterials(style) {
    var base = ["Whiteboard or projector", "Student notebooks / handouts", "Pens and highlighters"];
    var byStyle = {
      "hands-on": ["Activity materials or worksheets", "Group task cards"],
      "discussion": ["Discussion prompt cards", "Timer for talk rotations"],
      "direct": ["Slide deck or printed notes", "Guided practice sheet"],
      "balanced": ["Short worksheet or quiz", "Optional visual aid / short video"]
    };
    return base.concat(byStyle[style] || byStyle.balanced);
  }

  // Build a time-boxed lesson flow that scales to the chosen duration.
  function buildTimeline(topic, duration, style) {
    var d = parseInt(duration, 10) || 45;

    // Proportional split of the lesson (sums to 1).
    var split = {
      "hands-on":   { hook: .10, intro: .15, main: .45, practice: .20, close: .10 },
      "discussion": { hook: .10, intro: .15, main: .25, practice: .40, close: .10 },
      "direct":     { hook: .08, intro: .27, main: .35, practice: .22, close: .08 },
      "balanced":   { hook: .11, intro: .22, main: .34, practice: .22, close: .11 }
    }[style] || { hook: .11, intro: .22, main: .34, practice: .22, close: .11 };

    var labels = {
      hook: ["Warm-up / hook", "Spark curiosity: ask a quick question, show an image, or pose a puzzle about " + topic + "."],
      intro: ["Introduce the concept", "Teach the core idea of " + topic + " with clear examples. Check understanding as you go."],
      main: ["Main activity", style === "discussion"
        ? "Guided discussion exploring " + topic + " in pairs or as a class."
        : "Hands-on or worked exploration of " + topic + " — students engage directly with the material."],
      practice: ["Guided / independent practice", "Students apply " + topic + " through questions or a short task. Circulate and support."],
      close: ["Wrap-up & check", "Recap the key points, take questions, and do a quick exit check on " + topic + "."]
    };

    var order = ["hook", "intro", "main", "practice", "close"];
    var mins = order.map(function (k) { return Math.max(2, Math.round(d * split[k])); });

    // Adjust rounding so the times sum exactly to the duration.
    var diff = d - mins.reduce(function (a, b) { return a + b; }, 0);
    mins[2] += diff; // absorb into the main activity

    var clock = 0;
    return order.map(function (k, i) {
      var start = clock;
      clock += mins[i];
      return {
        time: mins[i] + " min",
        range: fmt(start) + "–" + fmt(clock),
        title: labels[k][0],
        detail: labels[k][1]
      };
    });

    function fmt(m) {
      var h = Math.floor(m / 60), mm = m % 60;
      return h > 0 ? h + "h" + (mm ? String(mm).padStart(2, "0") : "") : m + "m";
    }
  }

  function buildDifferentiation(topic) {
    return [
      "Support: provide a sentence starter, worked example, or vocabulary list for " + topic + ".",
      "Stretch: ask advanced students to explain " + topic + " in their own words or connect it to another topic.",
      "Check-ins: pause at key moments to confirm understanding before moving on."
    ];
  }

  function buildAssessment(topic, style) {
    var exit = style === "discussion"
      ? "One thing you learned and one question you still have about " + topic + "."
      : "A 2–3 question exit ticket on the key ideas of " + topic + ".";
    return [
      "Informal: questioning and observation during the lesson.",
      "Exit check: " + exit,
      "Optional: short quiz or task to grade understanding of " + topic + "."
    ];
  }

  function buildHomework(topic, grade) {
    var g = grade ? " (" + grade + ")" : "";
    return "Ask students" + g + " to write a short summary of " + topic +
      " in their own words, or find one real-world example of it to share next lesson.";
  }

  // Assemble the full plan object.
  function buildPlanFromTemplate(input) {
    var topic = titleCase(input.topic.trim());
    return {
      title: "Lesson Plan: " + topic,
      meta: {
        subject: input.subject || "—",
        grade: input.grade || "All levels",
        duration: (parseInt(input.duration, 10) || 45) + " min",
        style: titleCase(input.style.replace("-", " "))
      },
      objectives: buildObjectives(topic, input.goals, input.style),
      materials: buildMaterials(input.style),
      timeline: buildTimeline(topic, input.duration, input.style),
      differentiation: buildDifferentiation(topic),
      assessment: buildAssessment(topic, input.style),
      homework: buildHomework(topic, input.grade)
    };
  }

  // ----- Rendering -------------------------------------------------------

  function listSection(title, items) {
    return '<div class="plan-section"><h4>' + title + "</h4><ul>" +
      items.map(function (i) { return "<li>" + escapeHtml(i) + "</li>"; }).join("") +
      "</ul></div>";
  }

  function renderPlan(plan) {
    var timeline = plan.timeline.map(function (t) {
      return '<div class="timeline-item">' +
        '<div class="timeline-time">' + escapeHtml(t.time) + "</div>" +
        '<div class="timeline-body"><strong>' + escapeHtml(t.title) + "</strong>" +
        "<span>" + escapeHtml(t.detail) + "</span></div></div>";
    }).join("");

    var chips = [plan.meta.subject, plan.meta.grade, plan.meta.duration, plan.meta.style]
      .map(function (c) { return '<span class="chip">' + escapeHtml(c) + "</span>"; })
      .join("");

    return '<div class="plan">' +
      '<div class="plan-header"><h3>' + escapeHtml(plan.title) + "</h3>" +
      '<div class="plan-meta">' + chips + "</div></div>" +
      listSection("Learning objectives", plan.objectives) +
      listSection("Materials", plan.materials) +
      '<div class="plan-section"><h4>Lesson flow</h4><div class="timeline">' + timeline + "</div></div>" +
      listSection("Differentiation", plan.differentiation) +
      listSection("Assessment", plan.assessment) +
      '<div class="plan-section"><h4>Homework / extension</h4><p>' + escapeHtml(plan.homework) + "</p></div>" +
      "</div>";
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Plain-text version for the Copy button.
  function planToText(plan) {
    var lines = [];
    lines.push(plan.title.toUpperCase());
    lines.push(plan.meta.subject + " · " + plan.meta.grade + " · " + plan.meta.duration + " · " + plan.meta.style);
    lines.push("");
    lines.push("LEARNING OBJECTIVES");
    plan.objectives.forEach(function (o) { lines.push("  • " + o); });
    lines.push("");
    lines.push("MATERIALS");
    plan.materials.forEach(function (m) { lines.push("  • " + m); });
    lines.push("");
    lines.push("LESSON FLOW");
    plan.timeline.forEach(function (t) { lines.push("  [" + t.time + "] " + t.title + " — " + t.detail); });
    lines.push("");
    lines.push("DIFFERENTIATION");
    plan.differentiation.forEach(function (d) { lines.push("  • " + d); });
    lines.push("");
    lines.push("ASSESSMENT");
    plan.assessment.forEach(function (a) { lines.push("  • " + a); });
    lines.push("");
    lines.push("HOMEWORK / EXTENSION");
    lines.push("  " + plan.homework);
    return lines.join("\n");
  }

  // ----- Wiring ----------------------------------------------------------

  var currentPlan = null;

  function handleGenerate(e) {
    if (e) e.preventDefault();
    var topic = el("topic").value.trim();
    if (!topic) { el("topic").focus(); return; }

    var input = {
      topic: topic,
      subject: el("subject").value.trim(),
      grade: el("grade").value.trim(),
      duration: el("duration").value,
      style: el("style").value,
      goals: el("goals").value.trim()
    };

    // --- This is the line to swap for AI later ---
    currentPlan = buildPlanFromTemplate(input);

    el("output").innerHTML = renderPlan(currentPlan);
    el("copy-btn").disabled = false;
    el("print-btn").disabled = false;
    el("output-title").textContent = "Your lesson plan";
  }

  function fillExample() {
    el("topic").value = "Photosynthesis";
    el("subject").value = "Biology";
    el("grade").value = "Grade 7";
    el("duration").value = "45";
    el("style").value = "hands-on";
    el("goals").value = "Explain how plants make food\nIdentify what plants need to grow";
    handleGenerate();
  }

  function copyPlan() {
    if (!currentPlan) return;
    var text = planToText(currentPlan);
    navigator.clipboard.writeText(text).then(function () {
      var btn = el("copy-btn");
      var old = btn.textContent;
      btn.textContent = "Copied ✓";
      setTimeout(function () { btn.textContent = old; }, 1500);
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    el("lesson-form").addEventListener("submit", handleGenerate);
    el("example-btn").addEventListener("click", fillExample);
    el("copy-btn").addEventListener("click", copyPlan);
    el("print-btn").addEventListener("click", function () { window.print(); });
  });
})();
