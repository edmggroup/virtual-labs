/* ============================================================
   plot.js — a scatter plot with a fitted line, in SVG, for
   experiments built from a spec. Self-contained so it can go
   into a PDF as easily as onto the page.
   ============================================================ */

(function (root) {
  "use strict";

  var INK = "#14212a", RULE = "#c2ccc4", ACC = "#0e6e6b", RED = "#c2352c";

  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function ticks(lo, hi, n) {
    if (!isFinite(lo) || !isFinite(hi) || lo === hi) return [lo];
    var raw = (hi - lo) / (n || 5);
    var mag = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10));
    var norm = raw / mag;
    var step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
    var out = [], t = Math.ceil(lo / step) * step;
    for (; t <= hi + 1e-9; t += step) out.push(Math.round(t / step) * step);
    return out;
  }

  function label(v) {
    var a = Math.abs(v);
    if (a === 0) return "0";
    if (a < 0.001 || a >= 1e5) return v.toExponential(1);
    return String(Math.round(v * 1e6) / 1e6);
  }

  function scatterFit(o) {
    var w = o.width || 640, h = o.height || 380;
    var pad = { l: 76, r: 20, t: 34, b: 50 };
    var pts = o.points || [];
    var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
    var xlo = Math.min.apply(null, xs), xhi = Math.max.apply(null, xs);
    var ylo = Math.min.apply(null, ys), yhi = Math.max.apply(null, ys);
    var px = (xhi - xlo) * 0.08 || Math.abs(xhi) * 0.1 || 1;
    var py = (yhi - ylo) * 0.12 || Math.abs(yhi) * 0.1 || 1;
    xlo -= px; xhi += px; ylo -= py; yhi += py;

    function X(v) { return pad.l + (v - xlo) / (xhi - xlo) * (w - pad.l - pad.r); }
    function Y(v) { return h - pad.b - (v - ylo) / (yhi - ylo) * (h - pad.t - pad.b); }

    var g = '<rect width="' + w + '" height="' + h + '" fill="#ffffff"/>';
    ticks(xlo, xhi, 6).forEach(function (t) {
      var x = X(t);
      g += '<line x1="' + x + '" y1="' + Y(ylo) + '" x2="' + x + '" y2="' + pad.t + '" stroke="' + RULE + '" stroke-width="0.5" stroke-dasharray="2 3"/>';
      g += '<text x="' + x + '" y="' + (Y(ylo) + 18) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="middle">' + esc(label(t)) + "</text>";
    });
    ticks(ylo, yhi, 5).forEach(function (t) {
      var y = Y(t);
      g += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (w - pad.r) + '" y2="' + y + '" stroke="' + RULE + '" stroke-width="0.5" stroke-dasharray="2 3"/>';
      g += '<text x="' + (pad.l - 9) + '" y="' + (y + 4) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + esc(label(t)) + "</text>";
    });
    g += '<line x1="' + pad.l + '" y1="' + Y(ylo) + '" x2="' + (w - pad.r) + '" y2="' + Y(ylo) + '" stroke="' + INK + '" stroke-width="1.2"/>';
    g += '<line x1="' + pad.l + '" y1="' + Y(ylo) + '" x2="' + pad.l + '" y2="' + pad.t + '" stroke="' + INK + '" stroke-width="1.2"/>';

    if (o.fit && isFinite(o.fit.slope)) {
      g += '<line x1="' + X(xlo) + '" y1="' + Y(o.fit.slope * xlo + o.fit.intercept) +
        '" x2="' + X(xhi) + '" y2="' + Y(o.fit.slope * xhi + o.fit.intercept) + '" stroke="' + RED + '" stroke-width="1.4"/>';
    }
    pts.forEach(function (p) {
      g += '<circle cx="' + X(p[0]) + '" cy="' + Y(p[1]) + '" r="4.2" fill="' + ACC + '"/>';
    });

    g += '<text x="' + ((pad.l + w - pad.r) / 2) + '" y="' + (h - 8) + '" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '" text-anchor="middle">' + esc(o.xlabel || "") + "</text>";
    g += '<text transform="translate(16,' + ((pad.t + h - pad.b) / 2) + ') rotate(-90)" font-family="Spectral, Georgia, serif" font-size="13" fill="' + INK + '" text-anchor="middle">' + esc(o.ylabel || "") + "</text>";
    if (o.title) g += '<text x="' + pad.l + '" y="' + (pad.t - 12) + '" font-family="Spectral, Georgia, serif" font-size="14" fill="' + INK + '">' + esc(o.title) + "</text>";
    if (o.annotation) g += '<text x="' + (w - pad.r) + '" y="' + (pad.t - 12) + '" font-family="IBM Plex Mono, monospace" font-size="11" fill="' + INK + '" text-anchor="end">' + esc(o.annotation) + "</text>";

    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '">' + g + "</svg>";
  }

  root.Plot = { scatterFit: scatterFit };

})(window);
