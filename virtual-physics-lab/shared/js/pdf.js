/* ============================================================
   pdf.js — a small PDF writer, so any experiment can hand the
   student a finished document without a build step, a server
   or a third-party library.

   It covers what a laboratory record needs: headings, wrapped
   paragraphs, tables that break across pages, JPEG figures,
   page furniture. Text is set in the base-14 fonts, with Greek
   letters taken from Symbol and superscripts drawn raised, so
   ωe′, Σ⁺, ν̃ and Å come out right without embedding a font.

     var doc = VLabPDF.create({ title: "…", author: "…" });
     doc.heading("Observations", 2);
     doc.paragraph("…");
     doc.table({ rows: [["a","b"],["1","2"]], caption: "Table 1" });
     doc.save("record.pdf");
   ============================================================ */

(function (root) {
  "use strict";

  /* ---------- font metrics (units of 1/1000 em) ---------- */

  var HELV = { " ": 278, "!": 278, '"': 355, "#": 556, "$": 556, "%": 889, "&": 667, "'": 191, "(": 333, ")": 333, "*": 389, "+": 584, ",": 278, "-": 333, ".": 278, "/": 278, ":": 278, ";": 278, "<": 584, "=": 584, ">": 584, "?": 556, "@": 1015, "[": 278, "\\": 278, "]": 278, "^": 469, "_": 556, "`": 333, "{": 334, "|": 260, "}": 334, "~": 584 };
  "0123456789".split("").forEach(function (c) { HELV[c] = 556; });
  var UP = { A: 667, B: 667, C: 722, D: 722, E: 667, F: 611, G: 778, H: 722, I: 278, J: 500, K: 667, L: 556, M: 833, N: 722, O: 778, P: 667, Q: 778, R: 722, S: 667, T: 611, U: 722, V: 667, W: 944, X: 667, Y: 667, Z: 611 };
  var LOW = { a: 556, b: 556, c: 500, d: 556, e: 556, f: 278, g: 556, h: 556, i: 222, j: 222, k: 500, l: 222, m: 833, n: 556, o: 556, p: 556, q: 556, r: 333, s: 500, t: 278, u: 556, v: 500, w: 722, x: 500, y: 500, z: 500 };
  Object.keys(UP).forEach(function (k) { HELV[k] = UP[k]; });
  Object.keys(LOW).forEach(function (k) { HELV[k] = LOW[k]; });

  var BOLD = {};
  Object.keys(HELV).forEach(function (k) { BOLD[k] = HELV[k]; });
  var BOLD_UP = { A: 722, B: 722, J: 556, K: 722, L: 611, S: 667 };
  var BOLD_LOW = { a: 556, b: 611, c: 556, d: 611, e: 556, f: 333, g: 611, h: 611, i: 278, j: 278, k: 556, l: 278, m: 889, n: 611, o: 611, p: 611, q: 611, r: 389, s: 556, t: 333, u: 611, v: 556, w: 778, x: 556, y: 556, z: 500 };
  Object.keys(BOLD_UP).forEach(function (k) { BOLD[k] = BOLD_UP[k]; });
  Object.keys(BOLD_LOW).forEach(function (k) { BOLD[k] = BOLD_LOW[k]; });

  function width1000(ch, font) {
    if (font === "F4") return 600;                       // Symbol, near enough
    var t = font === "F2" ? BOLD : HELV;
    var w = t[ch];
    if (w !== undefined) return w;
    var c = ch.charCodeAt(0);
    if (c >= 0xa0) return 556;
    return 500;
  }

  /* ---------- character mapping ---------- */

  var GREEK = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "h", "θ": "q", "ι": "i",
    "κ": "k", "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s",
    "τ": "t", "υ": "u", "φ": "f", "χ": "c", "ψ": "y", "ω": "w",
    "Γ": "G", "Δ": "D", "Θ": "Q", "Λ": "L", "Ξ": "X", "Π": "P", "Σ": "S", "Φ": "F", "Ψ": "Y", "Ω": "W",
    "\u2206": "D", "\u2211": "S", "\u220f": "P", "\u03d5": "f"
  };
  var SYM = { "→": "\u00ae", "←": "\u00ac", "≤": "\u00a3", "≥": "\u00b3", "≠": "\u00b9", "∞": "\u00a5", "√": "\u00d6", "≈": "\u00bb" };
  var SUP = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁺": "+", "⁻": "-", "ⁿ": "n" };
  var SUB = { "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4", "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9" };
  var WIN = {
    "−": "-", "–": "-", "—": "-", "‑": "-", "\u00a0": " ", "\u2009": " ", "\u202f": " ",
    "⁄": "/", "∕": "/", "∼": "~", "‰": "\u0089", "†": "\u0086", "‡": "\u0087",
    "’": "\u0092", "‘": "\u0091", "“": "\u0093", "”": "\u0094",
    "′": "'", "″": '"', "•": "\u0095", "…": "\u0085", "€": "\u0080", "™": "\u0099"
  };

  /* text → runs: {f, size, rise, dx, s} where dx is a pen offset in points */
  function runsFor(text, size, style) {
    text = String(text == null ? "" : text);
    var base = style === "b" ? "F2" : style === "i" ? "F3" : "F1";
    var runs = [], buf = "", bufFont = base;

    function flush() {
      if (buf) { runs.push({ f: bufFont, size: size, rise: 0, dx: 0, s: buf }); buf = ""; }
    }
    function push(ch, font) {
      if (font !== bufFont) { flush(); bufFont = font; }
      buf += ch;
    }

    for (var i = 0; i < text.length; i++) {
      var ch = text[i], code = text.charCodeAt(i);

      if (code === 0x0303 || code === 0x0304) {            // combining tilde / macron
        var prev = lastGlyph(runs, buf, bufFont, size);
        flush();
        var mark = code === 0x0303 ? "~" : "-";
        var mw = width1000(mark, "F1") / 1000 * size * 0.8;
        runs.push({ f: "F1", size: size * 0.8, rise: size * 0.30, dx: -(prev / 2 + mw / 2), s: mark });
        runs.push({ f: base, size: size, rise: 0, dx: prev / 2 - mw / 2, s: "" });
        bufFont = base;
        continue;
      }
      if (GREEK[ch]) { push(GREEK[ch], "F4"); continue; }
      if (SYM[ch]) { push(SYM[ch], "F4"); continue; }
      if (SUP[ch] || SUB[ch]) {
        flush();
        var up = !!SUP[ch];
        runs.push({
          f: base, size: size * 0.65, rise: up ? size * 0.33 : -size * 0.16,
          dx: 0, s: up ? SUP[ch] : SUB[ch]
        });
        bufFont = base;
        continue;
      }
      if (WIN[ch]) { push(WIN[ch], bufFont === "F4" ? base : bufFont); continue; }
      if (code >= 0x300 && code < 0x370) continue;      // other combining marks: drop
      if (code > 0xff) { push("?", base); continue; }   // anything else we cannot set
      push(ch, code < 0x80 || code >= 0xa0 ? (bufFont === "F4" ? base : bufFont) : base);
    }
    flush();
    return runs.filter(function (r) { return r.s !== "" || r.dx; });
  }

  function lastGlyph(runs, buf, font, size) {
    if (buf) return width1000(buf[buf.length - 1], font) / 1000 * size;
    for (var i = runs.length - 1; i >= 0; i--) {
      if (runs[i].s) return width1000(runs[i].s.slice(-1), runs[i].f) / 1000 * runs[i].size;
    }
    return size * 0.5;
  }

  function runsWidth(runs) {
    var w = 0;
    runs.forEach(function (r) {
      w += r.dx;
      for (var i = 0; i < r.s.length; i++) w += width1000(r.s[i], r.f) / 1000 * r.size;
    });
    return w;
  }

  function textWidth(text, size, style) { return runsWidth(runsFor(text, size, style)); }

  function esc(s) { return s.replace(/([\\()])/g, "\\$1"); }

  /* ---------- the document ---------- */

  function create(opts) {
    opts = opts || {};
    var W = 595.28, H = 841.89;
    var M = opts.margin === undefined ? 56 : opts.margin;
    var CW = W - 2 * M;

    var pages = [], cur = null, y = 0;
    var images = [], imgIndex = {};
    var doc = {};

    var INK = "0.08 0.13 0.16 rg", GREY = "0.35 0.42 0.45 rg", RULE = "0.76 0.80 0.77 RG";

    function newPage() {
      cur = { ops: [] };
      pages.push(cur);
      y = H - M;
      if (opts.header) {
        cur.ops.push(op(GREY));
        drawRuns(runsFor(opts.header, 8, "i"), M, H - M + 22);
        cur.ops.push(op(RULE), op("0.5 w"), op(M + " " + (H - M + 16) + " m " + (W - M) + " " + (H - M + 16) + " l S"), op(INK));
      }
    }
    function op(s) { return s; }

    function space(n) {
      if (y - n < M + 26) { newPage(); return; }
      y -= n;
    }
    function need(h) { if (y - h < M + 26) newPage(); }

    function drawRuns(runs, x, baseline) {
      var pen = x;
      runs.forEach(function (r) {
        pen += r.dx;
        if (r.s) {
          cur.ops.push("BT /" + r.f + " " + fixed(r.size) + " Tf 1 0 0 1 " + fixed(pen) + " " +
            fixed(baseline + r.rise) + " Tm (" + esc(r.s) + ") Tj ET");
          for (var i = 0; i < r.s.length; i++) pen += width1000(r.s[i], r.f) / 1000 * r.size;
        }
      });
      return pen;
    }

    function fixed(n) { return (Math.round(n * 100) / 100).toString(); }

    /* wrap a string into lines no wider than maxw */
    function wrap(text, size, style, maxw) {
      var words = String(text == null ? "" : text).split(/\s+/).filter(Boolean);
      var lines = [], line = "";
      words.forEach(function (word) {
        var trial = line ? line + " " + word : word;
        if (textWidth(trial, size, style) <= maxw || !line) line = trial;
        else { lines.push(line); line = word; }
      });
      if (line) lines.push(line);
      return lines.length ? lines : [""];
    }

    /* ---------- public drawing ---------- */

    doc.heading = function (text, level) {
      var size = level === 1 ? 16 : level === 3 ? 10.5 : 12.5;
      space(level === 1 ? 6 : 12);
      need(size + 10);
      cur.ops.push(INK);
      drawRuns(runsFor(text, size, "b"), M, y - size);
      y -= size + 4;
      if (level !== 3) {
        cur.ops.push(RULE, "0.6 w", M + " " + fixed(y) + " m " + (W - M) + " " + fixed(y) + " l S");
        y -= 8;
      } else y -= 2;
      return doc;
    };

    doc.paragraph = function (text, o) {
      o = o || {};
      var size = o.size || 9.5, lh = size * 1.42;
      var style = o.style || "n";
      var indent = o.indent || 0;
      var lines = wrap(text, size, style, CW - indent);
      cur.ops.push(o.grey ? GREY : INK);
      lines.forEach(function (ln) {
        need(lh);
        drawRuns(runsFor(ln, size, style), M + indent, y - size);
        y -= lh;
      });
      y -= 4;
      return doc;
    };

    doc.kv = function (pairs, o) {
      o = o || {};
      var size = o.size || 9.5, lh = size * 1.5;
      var labw = 0;
      pairs.forEach(function (p) { labw = Math.max(labw, textWidth(p[0], size, "n")); });
      labw = Math.min(labw + 14, CW * 0.45);
      pairs.forEach(function (p) {
        need(lh);
        cur.ops.push(GREY);
        drawRuns(runsFor(p[0], size, "n"), M, y - size);
        cur.ops.push(INK);
        drawRuns(runsFor(String(p[1]), size, "b"), M + labw, y - size);
        y -= lh;
      });
      y -= 4;
      return doc;
    };

    doc.table = function (spec) {
      var rows = (spec.rows || []).map(function (r) { return r.map(function (c) { return c == null ? "" : String(c); }); });
      if (!rows.length) return doc;
      var size = spec.size || 8.6, pad = 4, lh = size * 1.32;
      var header = spec.header !== false;
      var n = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);

      // natural widths, then squeeze to the text column
      var nat = [];
      for (var c = 0; c < n; c++) {
        var w = 0;
        rows.forEach(function (r) { w = Math.max(w, textWidth(r[c] || "", size, "n")); });
        nat.push(w + 2 * pad);
      }
      var total = nat.reduce(function (a, b) { return a + b; }, 0);
      var cols = nat.map(function (w) { return total > CW ? w / total * CW : w; });
      if (total < CW && spec.stretch !== false) {
        var extra = (CW - total) / n;
        cols = cols.map(function (w) { return w + extra; });
      }

      if (spec.caption) {
        space(6);
        need(size + 8);
        cur.ops.push(INK);
        drawRuns(runsFor(spec.caption, 9, "i"), M, y - 9);
        y -= 15;
      }

      function drawRow(cells, isHead) {
        var wrapped = cells.map(function (t, i) { return wrap(t, size, isHead ? "b" : "n", cols[i] - 2 * pad); });
        var lines = wrapped.reduce(function (m, w) { return Math.max(m, w.length); }, 1);
        var h = lines * lh + 2 * pad - (lh - size) * 0.4;
        if (y - h < M + 26) {
          newPage();
          if (header && !isHead) drawRow(rows[0], true);
        }
        var x = M;
        if (isHead) {
          cur.ops.push("0.93 0.95 0.93 rg", fixed(M) + " " + fixed(y - h) + " " + fixed(CW) + " " + fixed(h) + " re f");
        }
        cur.ops.push(RULE, "0.5 w");
        for (var i = 0; i < n; i++) {
          cur.ops.push(fixed(x) + " " + fixed(y - h) + " " + fixed(cols[i]) + " " + fixed(h) + " re S");
          x += cols[i];
        }
        cur.ops.push(INK);
        x = M;
        wrapped.forEach(function (ws, i) {
          var right = i > 0 && spec.alignRight !== false;
          ws.forEach(function (ln, k) {
            var tw = textWidth(ln, size, isHead ? "b" : "n");
            var tx = right ? x + cols[i] - pad - tw : x + pad;
            drawRuns(runsFor(ln, size, isHead ? "b" : "n"), tx, y - pad - size - k * lh);
          });
          x += cols[i];
        });
        y -= h;
      }

      rows.forEach(function (r, i) {
        while (r.length < n) r.push("");
        drawRow(r, header && i === 0);
      });
      y -= 8;
      return doc;
    };

    /* dataUrl must be image/jpeg; w and h are its pixel dimensions */
    doc.image = function (spec) {
      var data = spec.dataUrl || "";
      var comma = data.indexOf(",");
      if (comma < 0) return doc;
      var key = spec.key || ("img" + images.length);
      if (imgIndex[key] === undefined) {
        imgIndex[key] = images.length;
        images.push({ name: "Im" + images.length, bytes: b64ToBinary(data.slice(comma + 1)), w: spec.w, h: spec.h });
      }
      var im = images[imgIndex[key]];
      /* A wide strip earns the full width; a squarer figure would tower over
         the page, so it is held back a little. */
      var natural = spec.width || (im.w / im.h < 1.7 ? CW * 0.72 : CW);
      var drawW = Math.min(CW, natural);
      var drawH = drawW * im.h / im.w;
      if (drawH > H - 2 * M - 40) { drawH = H - 2 * M - 40; drawW = drawH * im.w / im.h; }
      need(drawH + 14);
      cur.ops.push("q " + fixed(drawW) + " 0 0 " + fixed(drawH) + " " + fixed(M) + " " + fixed(y - drawH) + " cm /" + im.name + " Do Q");
      y -= drawH + 4;
      if (spec.caption) {
        cur.ops.push(GREY);
        drawRuns(runsFor(spec.caption, 8.5, "i"), M, y - 9);
        y -= 14;
        cur.ops.push(INK);
      }
      y -= 6;
      return doc;
    };

    doc.spacer = function (n) { space(n || 10); return doc; };
    doc.pageBreak = function () { newPage(); return doc; };
    doc.y = function () { return y; };

    /* ---------- assembly ---------- */

    function footers() {
      pages.forEach(function (p, i) {
        var label = (opts.footer || "") + (opts.footer ? "   ·   " : "") + "Page " + (i + 1) + " of " + pages.length;
        var runs = runsFor(label, 8, "n");
        var wpx = runsWidth(runs);
        p.ops.push("0.45 0.52 0.55 rg");
        var pen = W - M - wpx;
        runs.forEach(function (r) {
          pen += r.dx;
          if (r.s) {
            p.ops.push("BT /" + r.f + " " + fixed(r.size) + " Tf 1 0 0 1 " + fixed(pen) + " " + fixed(M - 22) + " Tm (" + esc(r.s) + ") Tj ET");
            for (var k = 0; k < r.s.length; k++) pen += width1000(r.s[k], r.f) / 1000 * r.size;
          }
        });
      });
    }

    doc.bytes = function () {
      footers();
      var objs = [], out = "";
      function add(s) { objs.push(s); return objs.length; }         // returns object number

      var fontIds = {
        F1: add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"),
        F2: add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"),
        F3: add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>"),
        F4: add("<< /Type /Font /Subtype /Type1 /BaseFont /Symbol >>")
      };
      var imgIds = images.map(function (im) {
        return add("<< /Type /XObject /Subtype /Image /Width " + im.w + " /Height " + im.h +
          " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + im.bytes.length +
          " >>\nstream\n" + im.bytes + "\nendstream");
      });

      var res = "<< /Font << " + Object.keys(fontIds).map(function (k) { return "/" + k + " " + fontIds[k] + " 0 R"; }).join(" ") + " >>";
      if (images.length) {
        res += " /XObject << " + images.map(function (im, i) { return "/" + im.name + " " + imgIds[i] + " 0 R"; }).join(" ") + " >>";
      }
      res += " >>";
      var resId = add(res);

      var pagesId = objs.length + 1 + pages.length * 2 + 1;   // placeholder, fixed below
      var pageIds = [], contentIds = [];
      pages.forEach(function (p) {
        var stream = p.ops.join("\n");
        contentIds.push(add("<< /Length " + stream.length + " >>\nstream\n" + stream + "\nendstream"));
      });
      pages.forEach(function (p, i) {
        pageIds.push(add("<< /Type /Page /Parent PAGESREF /MediaBox [0 0 " + W + " " + H + "] /Resources " +
          resId + " 0 R /Contents " + contentIds[i] + " 0 R >>"));
      });
      var pagesObj = add("<< /Type /Pages /Count " + pages.length + " /Kids [" +
        pageIds.map(function (id) { return id + " 0 R"; }).join(" ") + "] >>");
      objs = objs.map(function (s) { return s.split("PAGESREF").join(pagesObj + " 0 R"); });

      var infoId = add("<< /Title (" + esc(opts.title || "Laboratory record") + ") /Author (" +
        esc(opts.author || "") + ") /Subject (" + esc(opts.subject || "") + ") /Producer (Virtual Physics Laboratory) >>");
      var catalogId = add("<< /Type /Catalog /Pages " + pagesObj + " 0 R >>");

      out = "%PDF-1.4\n%\u00e2\u00e3\u00cf\u00d3\n";
      var offsets = [0];
      objs.forEach(function (body, i) {
        offsets.push(out.length);
        out += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
      });
      var xref = out.length;
      out += "xref\n0 " + (objs.length + 1) + "\n0000000000 65535 f \n";
      for (var i = 1; i <= objs.length; i++) {
        out += ("0000000000" + offsets[i]).slice(-10) + " 00000 n \n";
      }
      out += "trailer\n<< /Size " + (objs.length + 1) + " /Root " + catalogId + " 0 R /Info " + infoId +
        " 0 R >>\nstartxref\n" + xref + "\n%%EOF";

      var bytes = new Uint8Array(out.length);
      for (var k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 0xff;
      return bytes;
    };

    doc.blob = function () { return new Blob([doc.bytes()], { type: "application/pdf" }); };

    doc.save = function (filename) {
      var url = URL.createObjectURL(doc.blob());
      var a = document.createElement("a");
      a.href = url; a.download = filename || "record.pdf";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
    };

    newPage();
    return doc;
  }

  function b64ToBinary(b64) {
    var raw = typeof atob === "function"
      ? atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    return raw;
  }

  root.VLabPDF = { create: create, textWidth: textWidth };
  if (typeof module !== "undefined" && module.exports) module.exports = root.VLabPDF;

})(typeof window !== "undefined" ? window : globalThis);
