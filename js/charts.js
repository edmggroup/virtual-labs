/* ============================================================
   charts.js — small dependency-free SVG plotting used for the
   report graphs (Birge–Sponer, Hartmann calibration curve and
   the calibrated spectrum). Everything is exportable as SVG or
   PNG.
   ============================================================ */

(function (root) {
  "use strict";

  var INK = "#14212a", RULE = "#c2ccc4", ACC = "#0e6e6b", RED = "#c2352c";

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function nice(x, n) { return Number(x).toFixed(n === undefined ? 2 : n); }

  function axes(o) {
    var g = "";
    var x0 = o.pad.l, x1 = o.w - o.pad.r, y0 = o.h - o.pad.b, y1 = o.pad.t;
    g += '<rect x="0" y="0" width="' + o.w + '" height="' + o.h + '" fill="#ffffff"/>';
    // grid
    o.xticks.forEach(function (t) {
      var x = o.X(t);
      g += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + y1 + '" stroke="' + RULE + '" stroke-width="0.5" stroke-dasharray="2 3"/>';
      g += '<line x1="' + x + '" y1="' + y0 + '" x2="' + x + '" y2="' + (y0 + 5) + '" stroke="' + INK + '"/>';
      g += '<text x="' + x + '" y="' + (y0 + 18) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="middle">' + esc(o.xfmt ? o.xfmt(t) : t) + '</text>';
    });
    o.yticks.forEach(function (t) {
      var y = o.Y(t);
      g += '<line x1="' + x0 + '" y1="' + y + '" x2="' + x1 + '" y2="' + y + '" stroke="' + RULE + '" stroke-width="0.5" stroke-dasharray="2 3"/>';
      g += '<line x1="' + (x0 - 5) + '" y1="' + y + '" x2="' + x0 + '" y2="' + y + '" stroke="' + INK + '"/>';
      g += '<text x="' + (x0 - 9) + '" y="' + (y + 4) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + esc(o.yfmt ? o.yfmt(t) : t) + '</text>';
    });
    g += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x1 + '" y2="' + y0 + '" stroke="' + INK + '" stroke-width="1.2"/>';
    g += '<line x1="' + x0 + '" y1="' + y0 + '" x2="' + x0 + '" y2="' + y1 + '" stroke="' + INK + '" stroke-width="1.2"/>';
    g += '<text x="' + ((x0 + x1) / 2) + '" y="' + (o.h - 6) + '" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '" text-anchor="middle">' + esc(o.xlabel) + '</text>';
    g += '<text transform="translate(14,' + ((y0 + y1) / 2) + ') rotate(-90)" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '" text-anchor="middle">' + esc(o.ylabel) + '</text>';
    if (o.title) g += '<text x="' + x0 + '" y="' + (y1 - 10) + '" font-family="Spectral, Georgia, serif" font-size="14" fill="' + INK + '">' + esc(o.title) + '</text>';
    return g;
  }

  function ticks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
    var raw = (hi - lo) / (n || 5);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var out = [], t = Math.ceil(lo / step) * step;
    for (; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
  }

  function frame(w, h, xr, yr, pad) {
    pad = pad || { l: 66, r: 18, t: 30, b: 44 };
    function X(v) { return pad.l + (v - xr[0]) / (xr[1] - xr[0]) * (w - pad.l - pad.r); }
    function Y(v) { return h - pad.b - (v - yr[0]) / (yr[1] - yr[0]) * (h - pad.t - pad.b); }
    return { w: w, h: h, pad: pad, X: X, Y: Y };
  }

  function wrap(w, h, body) {
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '">' + body + '</svg>';
  }

  /* ---------- Birge–Sponer / generic scatter with a fitted line ---------- */

  function scatterFit(opts) {
    var pts = opts.points.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    var w = opts.width || 560, h = opts.height || 340;
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var xlo = 0, xhi = Math.max.apply(null, xs) + 1;
    var ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys);
    var padY = (yhi - ylo) * 0.35 + 4;
    ylo -= padY; yhi += padY;
    if (opts.yFromZero) ylo = 0;
    var f = frame(w, h, [xlo, xhi], [ylo, yhi]);
    f.xticks = ticks(xlo, xhi, 5);
    f.yticks = ticks(ylo, yhi, 5);
    f.xlabel = opts.xlabel; f.ylabel = opts.ylabel; f.title = opts.title;
    f.xfmt = function (t) { return nice(t, 0); };
    f.yfmt = function (t) { return nice(t, 0); };
    var g = axes(f);
    if (opts.fit) {
      var m = opts.fit.slope, c = opts.fit.intercept;
      g += '<line x1="' + f.X(xlo) + '" y1="' + f.Y(m * xlo + c) + '" x2="' + f.X(xhi) + '" y2="' + f.Y(m * xhi + c) + '" stroke="' + RED + '" stroke-width="1.4"/>';
    }
    pts.forEach(function (p) {
      g += '<circle cx="' + f.X(p[0]) + '" cy="' + f.Y(p[1]) + '" r="4.2" fill="' + ACC + '"/>';
    });
    if (opts.annotation) {
      g += '<text x="' + (w - f.pad.r - 6) + '" y="' + (f.pad.t + 16) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + esc(opts.annotation) + '</text>';
    }
    return wrap(w, h, g);
  }

  /* ---------- calibrated spectrum: intensity vs wavelength ---------- */

  function spectrumChart(opts) {
    var w = opts.width || 960, h = opts.height || 380;
    var xr = opts.xrange, f = frame(w, h, xr, [0, 1.35], { l: 66, r: 18, t: 34, b: 46 });
    f.xticks = ticks(xr[0], xr[1], 8);
    f.yticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];
    f.xlabel = "Wavelength λ (Å)";
    f.ylabel = "Relative intensity";
    f.title = opts.title;
    f.xfmt = function (t) { return nice(t, 0); };
    f.yfmt = function (t) { return nice(t, 1); };
    var g = axes(f);
    var d = "";
    var n = 1200;
    for (var i = 0; i <= n; i++) {
      var lam = xr[0] + (xr[1] - xr[0]) * i / n;
      var I = opts.intensity(lam);
      d += (i ? "L" : "M") + f.X(lam).toFixed(1) + " " + f.Y(Math.min(1.35, I)).toFixed(1) + " ";
    }
    g += '<path d="' + d + '" fill="none" stroke="' + ACC + '" stroke-width="1.3"/>';
    var marks = (opts.marks || []).filter(function (mk) { return mk.lambda >= xr[0] && mk.lambda <= xr[1]; })
      .sort(function (a, b) { return a.lambda - b.lambda; });
    var lastX = -1e9, tier = 0;
    marks.forEach(function (mk) {
      var x = f.X(mk.lambda);
      tier = (x - lastX < 34) ? (tier + 1) % 3 : 0;
      lastX = x;
      var ly = f.pad.t + 10 + tier * 12;
      var y = f.Y(Math.min(1.12, mk.intensity !== undefined ? mk.intensity : 0.9));
      g += '<line x1="' + x + '" y1="' + y + '" x2="' + x + '" y2="' + (ly + 4) + '" stroke="' + RULE + '" stroke-width="0.7"/>';
      g += '<text x="' + x + '" y="' + ly + '" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="' + INK + '" text-anchor="middle">' + esc(mk.label) + '</text>';
    });
    return wrap(w, h, g);
  }

  /* ---------- Hartmann calibration curve λ vs d ---------- */

  function calibrationChart(opts) {
    var w = opts.width || 560, h = opts.height || 340;
    var xs = opts.points.map(function (p) { return p[0]; });
    var xlo = Math.min.apply(null, xs) - 0.6, xhi = Math.max.apply(null, xs) + 0.6;
    var ys = opts.points.map(function (p) { return p[1]; });
    var ylo = Math.min.apply(null, ys) - 200, yhi = Math.max.apply(null, ys) + 200;
    var f = frame(w, h, [xlo, xhi], [ylo, yhi]);
    f.xticks = ticks(xlo, xhi, 5); f.yticks = ticks(ylo, yhi, 5);
    f.xlabel = "Comparator reading d (cm)";
    f.ylabel = "Wavelength λ (Å)";
    f.title = opts.title;
    f.xfmt = function (t) { return nice(t, 1); };
    f.yfmt = function (t) { return nice(t, 0); };
    var g = axes(f);
    if (opts.curve) {
      var d = "";
      for (var i = 0; i <= 200; i++) {
        var x = xlo + (xhi - xlo) * i / 200;
        var y = opts.curve(x);
        if (!isFinite(y) || y < ylo || y > yhi) { d = d ? d : ""; continue; }
        d += (d ? "L" : "M") + f.X(x).toFixed(1) + " " + f.Y(y).toFixed(1) + " ";
      }
      g += '<path d="' + d + '" fill="none" stroke="' + RED + '" stroke-width="1.3"/>';
    }
    opts.points.forEach(function (p) {
      g += '<circle cx="' + f.X(p[0]) + '" cy="' + f.Y(p[1]) + '" r="4" fill="' + ACC + '"/>';
    });
    if (opts.annotation) {
      g += '<text x="' + (w - f.pad.r - 6) + '" y="' + (h - f.pad.b - 10) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + esc(opts.annotation) + '</text>';
    }
    return wrap(w, h, g);
  }


  /* ============================================================
     Teaching figures. None of these carries a wavelength scale:
     they explain the structure of the spectrum without handing
     over the answer the student is about to measure.
     ============================================================ */

  var P = root.AlOPhysics;

  /* --- the band system as it appears on the plate, schematically --- */

  function bandAtlas(opts) {
    opts = opts || {};
    var w = opts.width || 960, h = opts.height || 300;
    var bands = P.buildBands();
    var lines = [];
    bands.forEach(function (b) { lines = lines.concat(P.bandLines(b)); });
    var set = new P.LineSet(lines);
    var lo = Math.min.apply(null, bands.map(function (b) { return b.lambda; })) - 25;
    var hi = Math.max.apply(null, bands.map(function (b) { return b.lambda; })) + 70;

    var pad = { l: 24, r: 24, t: 78, b: 46 };
    var pw = w - pad.l - pad.r, ph = h - pad.t - pad.b;
    function X(lam) { return pad.l + (lam - lo) / (hi - lo) * pw; }
    function Y(I) { return h - pad.b - Math.min(1.05, I) / 1.05 * ph; }

    var g = '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>';

    // the trace
    var d = "";
    for (var i = 0; i <= 1400; i++) {
      var lam = lo + (hi - lo) * i / 1400;
      d += (i ? "L" : "M") + X(lam).toFixed(1) + " " + Y(set.at(lam, 1.3)).toFixed(1) + " ";
    }
    g += '<path d="' + d + '" fill="none" stroke="' + ACC + '" stroke-width="1.2"/>';
    g += '<line x1="' + pad.l + '" y1="' + (h - pad.b) + '" x2="' + (w - pad.r) + '" y2="' + (h - pad.b) + '" stroke="' + INK + '" stroke-width="1.1"/>';

    // sequence brackets
    var seqs = {};
    bands.forEach(function (b) {
      var k = b.dv;
      seqs[k] = seqs[k] || { lo: b.lambda, hi: b.lambda, members: [] };
      seqs[k].lo = Math.min(seqs[k].lo, b.lambda);
      seqs[k].hi = Math.max(seqs[k].hi, b.lambda);
      seqs[k].members.push(b);
    });
    Object.keys(seqs).sort(function (a, b) { return b - a; }).forEach(function (k) {
      var s0 = X(seqs[k].lo) - 4, s1 = X(seqs[k].hi) + 26, y = 34;
      g += '<path d="M' + s0 + ' ' + (y + 12) + ' L' + s0 + ' ' + y + ' L' + s1 + ' ' + y + ' L' + s1 + ' ' + (y + 12) + '" fill="none" stroke="' + INK + '" stroke-width="1"/>';
      g += '<text x="' + ((s0 + s1) / 2) + '" y="' + (y - 6) + '" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '" text-anchor="middle">Δv = ' + (k > 0 ? "+" : k < 0 ? "−" : "") + Math.abs(k) + '</text>';
      // heads inside the sequence
      seqs[k].members.forEach(function (b, j) {
        if (j > 3) return;
        var x = X(b.lambda);
        g += '<line x1="' + x + '" y1="' + (y + 14) + '" x2="' + x + '" y2="' + Y(set.at(b.lambda + 2, 1.3)) + '" stroke="' + RULE + '" stroke-width="0.7"/>';
        g += '<text x="' + x + '" y="' + (y + 26 + (j % 2) * 12) + '" font-family="IBM Plex Mono, monospace" font-size="9.5" fill="' + INK + '" text-anchor="middle">(' + b.vu + ',' + b.vl + ')</text>';
      });
    });

    g += '<text x="' + pad.l + '" y="' + (h - 14) + '" font-family="Spectral, Georgia, serif" font-size="12.5" fill="' + INK + '">violet end of the plate</text>';
    g += '<text x="' + (w - pad.r) + '" y="' + (h - 14) + '" font-family="Spectral, Georgia, serif" font-size="12.5" fill="' + INK + '" text-anchor="end">wavelength increases →</text>';
    if (opts.title) g += '<text x="' + pad.l + '" y="16" font-family="Spectral, Georgia, serif" font-size="14" fill="' + INK + '">' + esc(opts.title) + '</text>';
    return wrap(w, h, g);
  }

  /* --- vibrational levels of the two states and the transitions --- */

  function energyDiagram(opts) {
    opts = opts || {};
    var w = opts.width || 660, h = opts.height || 440;
    var T = P.TRUTH, sc = 0.030;
    var xL = 152, xR = 556;
    var upperZero = 176, lowerZero = 372;

    function yU(v) { return upperZero - (P.G(v, T.we_u, T.wexe_u) - P.G(0, T.we_u, T.wexe_u)) * sc; }
    function yL(v) { return lowerZero - (P.G(v, T.we_l, T.wexe_l) - P.G(0, T.we_l, T.wexe_l)) * sc; }

    var g = '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>';
    if (opts.title) g += '<text x="24" y="20" font-family="Spectral, Georgia, serif" font-size="14" fill="' + INK + '">' + esc(opts.title) + '</text>';

    function stack(yf, label, sym) {
      var out = "";
      for (var v = 4; v >= 0; v--) {
        var y = yf(v);
        out += '<line x1="' + xL + '" y1="' + y + '" x2="' + xR + '" y2="' + y + '" stroke="' + INK + '" stroke-width="1.1"/>';
        out += '<text x="' + (xL - 10) + '" y="' + (y + 4) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + sym + ' = ' + v + '</text>';
      }
      out += '<text x="' + xL + '" y="' + (yf(4) - 10) + '" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '">' + label + '</text>';
      return out;
    }
    g += stack(yU, "B²Σ⁺, the upper state", "v′");
    g += stack(yL, "X²Σ⁺, the ground state", "v″");

    // broken axis between the two electronic states
    var yb = (upperZero + yL(4)) / 2 + 4;
    var path = "M" + xL + " " + yb;
    for (var i = 0; i < 8; i++) path += " l 25 -6 l 25 6";
    g += '<path d="' + path + '" fill="none" stroke="' + RULE + '" stroke-width="1.3"/>';
    ["electronic", "separation,", "about", "20 650 cm⁻¹"].forEach(function (t, i) {
      g += '<text x="20" y="' + (yb - 22 + i * 12) + '" font-family="Spectral, Georgia, serif" font-size="10.5" fill="#7c8b90">' + t + '</text>';
    });

    // transitions
    var arrows = [[0, 0, "+0"], [1, 0, "+1"], [2, 0, "+2"], [0, 1, "−1"], [0, 2, "−2"]];
    arrows.forEach(function (a, i) {
      var x = 196 + i * 76;
      var ya = yU(a[0]), yz = yL(a[1]);
      var col = i === 0 ? RED : ACC;
      g += '<line x1="' + x + '" y1="' + ya + '" x2="' + x + '" y2="' + (yz - 2) + '" stroke="' + col + '" stroke-width="1.4"/>';
      g += '<path d="M' + (x - 4.5) + ' ' + (yz - 10) + ' L' + x + ' ' + yz + ' L' + (x + 4.5) + ' ' + (yz - 10) + '" fill="' + col + '"/>';
      g += '<text x="' + x + '" y="' + (h - 40) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="middle">(' + a[0] + ',' + a[1] + ')</text>';
      g += '<text x="' + x + '" y="' + (h - 25) + '" font-family="IBM Plex Mono, monospace" font-size="10" fill="#4d5f66" text-anchor="middle">Δv = ' + a[2] + '</text>';
    });

    // the quanta the Deslandre table measures
    function bracket(y1, y2, label) {
      var x = xR + 12;
      return '<line x1="' + x + '" y1="' + y1 + '" x2="' + x + '" y2="' + y2 + '" stroke="' + RED + '" stroke-width="1"/>' +
        '<line x1="' + (x - 4) + '" y1="' + y1 + '" x2="' + (x + 4) + '" y2="' + y1 + '" stroke="' + RED + '" stroke-width="1"/>' +
        '<line x1="' + (x - 4) + '" y1="' + y2 + '" x2="' + (x + 4) + '" y2="' + y2 + '" stroke="' + RED + '" stroke-width="1"/>' +
        '<text x="' + (x + 8) + '" y="' + ((y1 + y2) / 2 + 4) + '" font-family="IBM Plex Mono, monospace" font-size="10.5" fill="' + RED + '">' + label + '</text>';
    }
    g += bracket(yU(1), yU(0), "ΔG′(½)");
    g += bracket(yL(1), yL(0), "ΔG″(½)");
    g += '<text x="24" y="' + (h - 8) + '" font-family="Spectral, Georgia, serif" font-size="11.5" fill="#7c8b90">Each arrow is one band. The spacing of the levels is what the experiment measures.</text>';
    return wrap(w, h, g);
  }

  /* --- why a band has a head: the Fortrat parabola --- */

  function headFormation(opts) {
    opts = opts || {};
    var w = opts.width || 660, h = opts.height || 440;
    var vu = 0, vl = 0;
    var Bu = P.Bv(vu, P.ROT.Be_u, P.ROT.alpha_u), Bl = P.Bv(vl, P.ROT.Be_l, P.ROT.alpha_l);
    var sum = Bu + Bl, dif = Bu - Bl;
    var mh = -sum / (2 * dif);
    var nuh = -(sum * sum) / (4 * dif);

    var pad = { l: 58, r: 20, t: 34, b: 140 };
    var xr = [-70, nuh + 12], yr = [-45, 45];
    var f = frame(w, h, xr, yr, pad);
    f.xticks = ticks(xr[0], xr[1], 6); f.yticks = ticks(yr[0], yr[1], 5);
    f.xlabel = "ν̃ − ν̃(band origin)  (cm⁻¹)";
    f.ylabel = "m  (J+1 for R, −J for P)";
    f.title = opts.title;
    f.xfmt = function (t) { return t.toFixed(0); };
    f.yfmt = function (t) { return t.toFixed(0); };
    var g = axes(f);

    var d = "";
    for (var m = -44; m <= 44; m += 0.5) {
      if (m === 0) continue;
      var nu = sum * m + dif * m * m;
      if (nu < xr[0] || nu > xr[1]) continue;
      d += (d ? "L" : "M") + f.X(nu).toFixed(1) + " " + f.Y(m).toFixed(1) + " ";
    }
    g += '<path d="' + d + '" fill="none" stroke="' + ACC + '" stroke-width="1.4"/>';
    g += '<text x="' + f.X(-55) + '" y="' + f.Y(30) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '">R branch</text>';
    g += '<text x="' + f.X(-55) + '" y="' + f.Y(-30) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '">P branch</text>';
    g += '<line x1="' + f.X(nuh) + '" y1="' + f.Y(yr[0]) + '" x2="' + f.X(nuh) + '" y2="' + f.Y(yr[1]) + '" stroke="' + RED + '" stroke-width="1"/>';
    g += '<circle cx="' + f.X(nuh) + '" cy="' + f.Y(mh) + '" r="4" fill="' + RED + '"/>';
    g += '<text x="' + (f.X(nuh) - 8) + '" y="' + (f.pad.t + 14) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + RED + '" text-anchor="end">head at m ≈ ' + mh.toFixed(0) + '</text>';

    // the resulting line positions, drawn as a strip under the axes
    var sy = h - 74;
    g += '<text x="' + f.pad.l + '" y="' + (sy - 10) + '" font-family="Spectral, Georgia, serif" font-size="12" fill="' + INK + '">the line positions this produces</text>';
    for (var mm = -44; mm <= 44; mm++) {
      if (mm === 0) continue;
      var nu2 = sum * mm + dif * mm * mm;
      if (nu2 < xr[0] || nu2 > xr[1]) continue;
      var J = mm > 0 ? mm - 1 : -mm;
      var op = Math.max(0.12, Math.exp(-Bl * J * (J + 1) * 1.4388 / P.ROT.Trot));
      g += '<line x1="' + f.X(nu2) + '" y1="' + sy + '" x2="' + f.X(nu2) + '" y2="' + (sy + 26) + '" stroke="' + ACC + '" stroke-width="1" opacity="' + op.toFixed(2) + '"/>';
    }
    g += '<text x="' + f.X(nuh) + '" y="' + (sy + 40) + '" font-family="IBM Plex Mono, monospace" font-size="10.5" fill="' + RED + '" text-anchor="middle">band head</text>';
    g += '<text x="' + f.pad.l + '" y="' + (sy + 40) + '" font-family="IBM Plex Mono, monospace" font-size="10.5" fill="' + INK + '">← shaded away to the red</text>';
    return wrap(w, h, g);
  }

  /* ---------- export ---------- */

  function svgToPng(svgText, scale) {
    scale = scale || 2;
    return new Promise(function (resolve, reject) {
      var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svgText);
      var w = m ? parseFloat(m[1]) : 800, h = m ? parseFloat(m[2]) : 400;
      var blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        var cv = document.createElement("canvas");
        cv.width = w * scale; cv.height = h * scale;
        var ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        resolve(cv.toDataURL("image/png"));
      };
      img.onerror = function (e) { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  root.Charts = {
    bandAtlas: bandAtlas,
    energyDiagram: energyDiagram,
    headFormation: headFormation,
    scatterFit: scatterFit,
    spectrumChart: spectrumChart,
    calibrationChart: calibrationChart,
    svgToPng: svgToPng,
    ticks: ticks
  };

})(window);
