/* Mind-map renderer (house style, PRD §8.3). Pure SVG so it is crisp, vector,
 * colour-zoned and readable in black & white. Two maps:
 *   buildChapterMapSVG(map)  — A4 landscape, 4-level tree left→right
 *   buildDailyMapSVG(daily)  — radial: topic centre + 3-4 ideas around it
 * Exposed on window.MapRender for the app; also module.exports for tests. */
(function (root) {
  "use strict";

  // House palette — green lead with blue/purple/teal/orange zones (PRD §8.2).
  var ZONES = ["#2f7d34", "#2f6fd0", "#7a3ea8", "#0d8c8c", "#cf6a1a"];
  var INK = "#1b2230";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  // Light tint of a hex colour (mix toward white) so fills read in B&W and keep
  // dark text legible.
  function tint(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.round(r + (255 - r) * amt); g = Math.round(g + (255 - g) * amt); b = Math.round(b + (255 - b) * amt);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  // Greedy word-wrap to a max character count per line, capped at maxLines.
  function wrap(text, maxChars, maxLines) {
    var words = String(text || "").split(/\s+/), lines = [], cur = "";
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!cur) { cur = w; }
      else if ((cur + " " + w).length <= maxChars) { cur += " " + w; }
      else { lines.push(cur); cur = w; if (lines.length === maxLines - 1) break; }
    }
    if (cur && lines.length < maxLines) lines.push(cur);
    if (lines.length === maxLines && (cur || words.length)) {
      var last = lines[maxLines - 1];
      if (last.length > maxChars) lines[maxLines - 1] = last.slice(0, maxChars - 1) + "…";
    }
    return lines;
  }
  function tspans(lines, x, yMid, lh, fs, weight, color) {
    var total = lines.length, y0 = yMid - ((total - 1) * lh) / 2;
    return lines.map(function (ln, i) {
      return '<text x="' + x + '" y="' + (y0 + i * lh) + '" text-anchor="middle" ' +
        'dominant-baseline="central" font-size="' + fs + '" font-weight="' + weight +
        '" fill="' + color + '" font-family="Inter,Segoe UI,Arial,sans-serif">' + esc(ln) + "</text>";
    }).join("");
  }
  function nodeBox(x, y, w, h, fill, stroke, sw, rx) {
    return '<rect x="' + (x - w / 2) + '" y="' + (y - h / 2) + '" width="' + w + '" height="' + h +
      '" rx="' + (rx || 12) + '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>';
  }
  // Smooth left→right connector between two points.
  function connector(x1, y1, x2, y2, color, sw) {
    var mx = (x1 + x2) / 2;
    return '<path d="M ' + x1 + ' ' + y1 + ' C ' + mx + ' ' + y1 + ', ' + mx + ' ' + y2 + ', ' + x2 + ' ' + y2 +
      '" fill="none" stroke="' + color + '" stroke-width="' + (sw || 2) + '" stroke-linecap="round"/>';
  }

  // --- Chapter Learning Map: 4-level tidy tree, left to right -------------
  function buildChapterMapSVG(map) {
    var title = map.title || "Chapter";
    var branches = (map.branches || []).filter(Boolean);
    // Column centres and box widths per level.
    var COLX = [120, 360, 620, 880], COLW = [180, 210, 200, 196];
    var ROW = 50, PAD_TOP = 90, PAD_BOTTOM = 30, W = 1040;

    // Build the node tree with zone colours, then tidy-layout the y positions.
    var cursor = PAD_TOP;
    function leaf(n) { n.y = cursor + ROW / 2; cursor += ROW; }
    function place(n, kids) {
      if (!kids || !kids.length) { leaf(n); return; }
      kids.forEach(function (k) { place(k, k.kids); });
      n.y = (kids[0].y + kids[kids.length - 1].y) / 2;
    }
    branches.forEach(function (br, i) {
      br.color = ZONES[i % ZONES.length];
      br.kids = (br.pointers || []).map(function (p) {
        return { label: p.label, color: br.color, kids: (p.details || []).map(function (d) { return { label: d, color: br.color, kids: null }; }) };
      });
    });
    var rootKids = branches.map(function (b) { return { _branch: b, color: b.color, kids: b.kids }; });
    rootKids.forEach(function (rk) { place(rk, rk.kids); });
    var root = { y: rootKids.length ? (rootKids[0].y + rootKids[rootKids.length - 1].y) / 2 : PAD_TOP + ROW };
    var H = Math.max(cursor + PAD_BOTTOM, 300);

    var svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter,Segoe UI,Arial,sans-serif">');
    svg.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    // Title strip
    svg.push('<text x="' + (W / 2) + '" y="40" text-anchor="middle" font-size="26" font-weight="800" fill="' + INK + '">' + esc(title) + "</text>");
    svg.push('<text x="' + (W / 2) + '" y="64" text-anchor="middle" font-size="13" font-weight="600" fill="#7a8294">Chapter Learning Map</text>');

    // Connectors first (behind nodes).
    rootKids.forEach(function (rk) {
      var b = rk._branch;
      svg.push(connector(COLX[0] + COLW[0] / 2, root.y, COLX[1] - COLW[1] / 2, rk.y, b.color, 3));
      (rk.kids || []).forEach(function (p) {
        svg.push(connector(COLX[1] + COLW[1] / 2, rk.y, COLX[2] - COLW[2] / 2, p.y, b.color, 2));
        (p.kids || []).forEach(function (d) {
          svg.push(connector(COLX[2] + COLW[2] / 2, p.y, COLX[3] - COLW[3] / 2, d.y, b.color, 1.5));
        });
      });
    });

    // Root (chapter) node — green.
    svg.push(nodeBox(COLX[0], root.y, COLW[0], 64, ZONES[0], "#1f5223", 2, 16));
    svg.push(tspans(wrap(title, 16, 3), COLX[0], root.y, 18, 15, 800, "#ffffff"));

    // Branch / pointer / detail nodes.
    rootKids.forEach(function (rk, i) {
      var b = rk._branch, c = b.color;
      // numbered branch
      svg.push(nodeBox(COLX[1], rk.y, COLW[1], 46, tint(c, 0.82), c, 2.5, 12));
      svg.push('<circle cx="' + (COLX[1] - COLW[1] / 2 + 16) + '" cy="' + rk.y + '" r="11" fill="' + c + '"/>');
      svg.push('<text x="' + (COLX[1] - COLW[1] / 2 + 16) + '" y="' + rk.y + '" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="800" fill="#ffffff">' + (i + 1) + "</text>");
      svg.push(tspans(wrap(b.label, 20, 2), COLX[1] + 10, rk.y, 16, 13.5, 700, INK));
      (rk.kids || []).forEach(function (p) {
        svg.push(nodeBox(COLX[2], p.y, COLW[2], 40, tint(c, 0.9), c, 1.6, 11));
        svg.push(tspans(wrap(p.label, 22, 2), COLX[2], p.y, 15, 13, 600, INK));
        (p.kids || []).forEach(function (d) {
          svg.push(nodeBox(COLX[3], d.y, COLW[3], 34, "#ffffff", tint(c, 0.35), 1.4, 16));
          svg.push(tspans(wrap(d.label, 26, 2), COLX[3], d.y, 14, 12, 500, INK));
        });
      });
    });

    svg.push("</svg>");
    return { svg: svg.join(""), width: W, height: H };
  }

  // --- Daily session map: radial topic + 3-4 ideas ------------------------
  function buildDailyMapSVG(daily) {
    var topic = daily.topic || "Today";
    var ideas = (daily.ideas || []).filter(Boolean).slice(0, 4);
    var W = 520, H = 300, cx = W / 2, cy = H / 2 + 6;
    var svg = [];
    svg.push('<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" font-family="Inter,Segoe UI,Arial,sans-serif">');
    svg.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"/>');
    svg.push('<text x="' + cx + '" y="26" text-anchor="middle" font-size="13" font-weight="700" fill="#7a8294">Today’s Mind Map</text>');
    // ideas around the centre
    var R = 165, n = ideas.length || 1;
    // spread across a fan so labels don't collide (top + bottom)
    var positions = [];
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (i + 0.5) / n * Math.PI * 2; // even around circle
      positions.push({ x: cx + Math.cos(ang) * R, y: cy + Math.sin(ang) * (R * 0.62) });
    }
    positions.forEach(function (pos, i) {
      var c = ZONES[(i + 1) % ZONES.length];
      svg.push(connector(cx, cy, pos.x, pos.y, c, 2.5));
    });
    positions.forEach(function (pos, i) {
      var c = ZONES[(i + 1) % ZONES.length];
      svg.push(nodeBox(pos.x, pos.y, 150, 50, tint(c, 0.84), c, 2, 14));
      svg.push(tspans(wrap(ideas[i] || "", 18, 2), pos.x, pos.y, 16, 13, 600, INK));
    });
    // centre topic
    svg.push('<circle cx="' + cx + '" cy="' + cy + '" r="58" fill="' + ZONES[0] + '" stroke="#1f5223" stroke-width="2"/>');
    svg.push(tspans(wrap(topic, 12, 3), cx, cy, 16, 13.5, 800, "#ffffff"));
    svg.push("</svg>");
    return { svg: svg.join(""), width: W, height: H };
  }

  var api = { buildChapterMapSVG: buildChapterMapSVG, buildDailyMapSVG: buildDailyMapSVG, ZONES: ZONES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.MapRender = api;
})(typeof window !== "undefined" ? window : null);
