/* ============================================================
   physics.js — AlO B²Σ⁺ → X²Σ⁺ band system, plate optics,
   Hartmann calibration and Deslandre analysis.

   Everything a student "measures" is generated from the
   TRUTH block below, so the analysis in the manual really
   does return these numbers.
   ============================================================ */

(function (root) {
  "use strict";

  /* ---------- 1. Spectroscopic truth (hidden from students) ---------- */

  var TRUTH = {
    // B²Σ⁺ (upper)
    we_u: 870.0,      // ωe'   cm⁻¹
    wexe_u: 3.50,     // ωe'xe'
    // X²Σ⁺ (lower)
    we_l: 979.23,     // ωe"
    wexe_l: 6.97,     // ωe"xe"
    nu00: 20652.0,    // ν̃(0,0) cm⁻¹  → 4842 Å
    Tvib: 4500        // effective vibrational temperature of the arc, K
  };

  var LIT = {
    we_u: 870.0, wexe_u: 3.50, xe_u: 3.50 / 870.0,
    we_l: 979.23, wexe_l: 6.97, xe_l: 6.97 / 979.23
  };

  /* ---------- 2. Plate optics: Hartmann dispersion ---------- */
  /*  λ = λ0 + C / (d − d0)      ⇔      d = d0 + C / (λ − λ0)      */

  var PLATE_TRUTH = {
    lam0: 2578.4,    // Å
    C: -35214.0,     // Å·cm
    d0: 27.140       // cm
  };

  var PLATE = {
    dMin: 2.0,
    dMax: 18.0,
    leastCount: 0.001,      // cm
    mainScaleDiv: 0.05,     // cm  (50 vernier divisions → LC 0.001 cm)
    vernierDiv: 50
  };

  /* ---------- 3. Mercury calibration lines (Å, air) ---------- */

  var HG_LINES = [
    { lambda: 4046.56, name: "Violet", strength: 0.75 },
    { lambda: 4077.83, name: "Violet (weak)", strength: 0.35 },
    { lambda: 4358.33, name: "Blue", strength: 1.00 },
    { lambda: 4916.04, name: "Blue-green (weak)", strength: 0.30 },
    { lambda: 5460.74, name: "Green", strength: 1.00 },
    { lambda: 5769.60, name: "Yellow I", strength: 0.65 },
    { lambda: 5790.66, name: "Yellow II", strength: 0.70 }
  ];

  /* ---------- 4. Helpers ---------- */

  function G(v, we, wexe) {
    var x = v + 0.5;
    return we * x - wexe * x * x;
  }

  function nuBand(vu, vl, t) {
    t = t || TRUTH;
    return t.nu00 +
      (G(vu, t.we_u, t.wexe_u) - G(0, t.we_u, t.wexe_u)) -
      (G(vl, t.we_l, t.wexe_l) - G(0, t.we_l, t.wexe_l));
  }

  function nuToLambda(nu) { return 1e8 / nu; }   // cm⁻¹ → Å
  function lambdaToNu(lam) { return 1e8 / lam; } // Å → cm⁻¹

  /* deterministic PRNG so every student gets a stable, unique plate */
  function seedFrom(str) {
    var h = 2166136261 >>> 0;
    str = String(str || "default");
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------- 5. Band list with relative intensities ---------- */

  function buildBands(opts) {
    opts = opts || {};
    var vuMax = opts.vuMax === undefined ? 5 : opts.vuMax;
    var vlMax = opts.vlMax === undefined ? 6 : opts.vlMax;
    var cutoff = opts.cutoff === undefined ? 0.030 : opts.cutoff;
    var hc_k = 1.438776;   // K·cm
    var bands = [];

    for (var vu = 0; vu <= vuMax; vu++) {
      var Gu = G(vu, TRUTH.we_u, TRUTH.wexe_u) - G(0, TRUTH.we_u, TRUTH.wexe_u);
      var pop = Math.exp(-Gu * hc_k / TRUTH.Tvib);
      for (var vl = 0; vl <= vlMax; vl++) {
        var dv = vu - vl;
        var fc = Math.exp(-(dv * dv) / 2.6) * (1 + 0.08 * Math.min(vu, vl));
        var I = pop * fc;
        if (I < cutoff) continue;
        var nu = nuBand(vu, vl);
        var lam = nuToLambda(nu);
        if (lam < 4380 || lam > 5560) continue;
        bands.push({
          vu: vu, vl: vl, dv: dv,
          label: "(" + vu + "," + vl + ")",
          nu: nu, lambda: lam, intensity: I
        });
      }
    }
    var maxI = bands.reduce(function (m, b) { return Math.max(m, b.intensity); }, 0);
    bands.forEach(function (b) { b.intensity /= maxI; });
    bands.sort(function (a, b) { return a.lambda - b.lambda; });
    return bands;
  }

  /* ---------- 6. Per-student plate ---------- */

  function makePlate(studentKey) {
    var rnd = mulberry32(seedFrom(studentKey));
    // plate mounting offset + slight change of camera constant
    var truth = {
      lam0: PLATE_TRUTH.lam0 + (rnd() - 0.5) * 60,
      C: PLATE_TRUTH.C * (1 + (rnd() - 0.5) * 0.06),
      d0: PLATE_TRUTH.d0 + (rnd() - 0.5) * 1.2
    };

    function dOf(lambda) { return truth.d0 + truth.C / (lambda - truth.lam0); }
    function lambdaOf(d) { return truth.lam0 + truth.C / (d - truth.d0); }

    // measurement scatter: emulsion grain + setting error, ±0.0008 cm
    function jitter() { return (rnd() - 0.5) * 0.0016; }

    var bands = buildBands().map(function (b) {
      var o = Object.assign({}, b);
      o.d = round3(dOf(b.lambda) + jitter());
      return o;
    });

    var hg = HG_LINES.map(function (l) {
      var o = Object.assign({}, l);
      o.d = round3(dOf(l.lambda) + jitter());
      return o;
    });

    var lines = [];
    bands.forEach(function (b) { lines = lines.concat(bandLines(b)); });
    var aloSet = new LineSet(lines);
    var hgSet = new LineSet(hg.map(function (l) {
      return { lambda: l.lambda, s: l.strength, hg: true, name: l.name };
    }));

    var span = [dOf(5560), dOf(4380)].sort(function (a, b) { return a - b; });

    return {
      key: studentKey,
      truth: truth,          // never shown in the UI
      bands: bands,
      hg: hg,
      alo: aloSet,
      hgSet: hgSet,
      dMin: Math.min(span[0], hg[0].d) - 0.35,
      dMax: Math.max(span[1], hg[hg.length - 1].d) + 0.35,
      lambdaOf: lambdaOf,
      dOf: dOf
    };
  }

  function round3(x) { return Math.round(x * 1000) / 1000; }

  /* ---------- 7. Vernier decomposition of a comparator reading ---------- */

  function vernier(d) {
    var msr = Math.floor(d / PLATE.mainScaleDiv + 1e-9) * PLATE.mainScaleDiv;
    var vsd = Math.round((d - msr) / PLATE.leastCount);
    if (vsd >= PLATE.vernierDiv) { vsd = 0; msr += PLATE.mainScaleDiv; }
    return {
      msr: msr,
      vsd: vsd,
      total: round3(msr + vsd * PLATE.leastCount)
    };
  }

  /* ---------- 8. Hartmann three-point solution ---------- */

  function hartmannFromThree(p1, p2, p3) {
    // p = {lambda, d}
    var l1 = p1.lambda, l2 = p2.lambda, l3 = p3.lambda;
    var d1 = p1.d, d2 = p2.d, d3 = p3.d;
    var denom = (l2 - l3) * (d2 - d1);
    if (Math.abs(denom) < 1e-12) return null;
    var R = ((l1 - l2) * (d3 - d2)) / denom;      // = (d3−d0)/(d1−d0)
    if (Math.abs(R - 1) < 1e-12) return null;
    var d0 = (R * d1 - d3) / (R - 1);
    var inv1 = 1 / (d1 - d0), inv2 = 1 / (d2 - d0);
    var C = (l1 - l2) / (inv1 - inv2);
    var lam0 = l1 - C * inv1;
    if (!isFinite(d0) || !isFinite(C) || !isFinite(lam0)) return null;
    return { lam0: lam0, C: C, d0: d0 };
  }

  function lambdaFromHartmann(h, d) { return h.lam0 + h.C / (d - h.d0); }

  /* ---------- 9. Deslandre analysis ---------- */

  function mean(a) {
    if (!a.length) return NaN;
    return a.reduce(function (s, x) { return s + x; }, 0) / a.length;
  }
  function sd(a) {
    if (a.length < 2) return NaN;
    var m = mean(a);
    return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1));
  }

  /**
   * rows      : entries {vu, vl, lambda, nu}
   * returns Deslandre grid + first/second differences for both states
   */
  function analyse(entries) {
    var grid = {};                       // grid[vu][vl] = nu
    var vus = [], vls = [];
    entries.forEach(function (e) {
      if (e.vu === null || e.vl === null || !isFinite(e.nu)) return;
      grid[e.vu] = grid[e.vu] || {};
      grid[e.vu][e.vl] = e.nu;
      if (vus.indexOf(e.vu) < 0) vus.push(e.vu);
      if (vls.indexOf(e.vl) < 0) vls.push(e.vl);
    });
    vus.sort(function (a, b) { return a - b; });
    vls.sort(function (a, b) { return a - b; });

    // ΔG'(v'+½): difference between successive ROWS, one value per column
    var upperFirst = [];
    for (var i = 0; i + 1 <= Math.max.apply(null, vus.concat([0])); i++) {
      var terms = [];
      vls.forEach(function (vl) {
        if (grid[i] && grid[i + 1] && isFinite(grid[i][vl]) && isFinite(grid[i + 1][vl])) {
          terms.push({ vl: vl, value: grid[i + 1][vl] - grid[i][vl] });
        }
      });
      if (terms.length) {
        upperFirst.push({
          v: i, half: i + 0.5,
          terms: terms,
          value: mean(terms.map(function (t) { return t.value; })),
          sd: sd(terms.map(function (t) { return t.value; }))
        });
      }
    }

    // ΔG"(v"+½): difference between successive COLUMNS, one value per row
    var lowerFirst = [];
    for (var j = 0; j + 1 <= Math.max.apply(null, vls.concat([0])); j++) {
      var terms2 = [];
      vus.forEach(function (vu) {
        if (grid[vu] && isFinite(grid[vu][j]) && isFinite(grid[vu][j + 1])) {
          terms2.push({ vu: vu, value: grid[vu][j] - grid[vu][j + 1] });
        }
      });
      if (terms2.length) {
        lowerFirst.push({
          v: j, half: j + 0.5,
          terms: terms2,
          value: mean(terms2.map(function (t) { return t.value; })),
          sd: sd(terms2.map(function (t) { return t.value; }))
        });
      }
    }

    return {
      grid: grid, vus: vus, vls: vls,
      upper: stateConstants(upperFirst),
      lower: stateConstants(lowerFirst)
    };
  }

  function stateConstants(first) {
    var second = [];
    for (var i = 0; i + 1 < first.length; i++) {
      second.push({
        from: first[i].v, to: first[i + 1].v,
        value: first[i].value - first[i + 1].value      // = 2ωexe
      });
    }
    var twoWexe = second.length ? mean(second.map(function (s) { return s.value; })) : NaN;
    var wexe = twoWexe / 2;
    var we = first.length ? first[0].value + twoWexe : NaN;
    var xe = we ? wexe / we : NaN;

    // Birge–Sponer straight line: ΔG(v+½) = ωe − 2ωexe (v+1)
    var bs = linfit(first.map(function (f) { return [f.v + 1, f.value]; }));

    return {
      first: first, second: second,
      twoWexe: twoWexe, wexe: wexe, we: we, xe: xe,
      birgeSponer: bs ? {
        slope: bs.m, intercept: bs.c, r2: bs.r2,
        we: bs.c, wexe: -bs.m / 2, xe: bs.c ? (-bs.m / 2) / bs.c : NaN,
        // dissociation energy of the state from the BS extrapolation
        vmax: bs.m ? -bs.c / bs.m - 0.5 : NaN,
        D0: bs.m ? -(bs.c * bs.c) / (2 * bs.m) : NaN
      } : null
    };
  }

  function linfit(pts) {
    pts = pts.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    var n = pts.length;
    if (n < 2) return null;
    var sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
    pts.forEach(function (p) {
      sx += p[0]; sy += p[1]; sxx += p[0] * p[0]; sxy += p[0] * p[1]; syy += p[1] * p[1];
    });
    var den = n * sxx - sx * sx;
    if (Math.abs(den) < 1e-12) return null;
    var m = (n * sxy - sx * sy) / den;
    var c = (sy - m * sx) / n;
    var r2num = (n * sxy - sx * sy);
    var r2 = (r2num * r2num) / (den * (n * syy - sy * sy) || 1);
    return { m: m, c: c, r2: r2, n: n };
  }

  /* ---------- 10. Rotational structure and the spectrum sampler ----------

     Each band is not a smooth blob. It is a set of rotational lines whose
     positions follow the Fortrat relation

         ν̃(m) = ν̃0 + (B′ + B″) m + (B′ − B″) m²,   m = J+1 (R branch), −J (P branch)

     Because B′ < B″ the quadratic term is negative, the R branch turns back
     on itself at m = −(B′+B″)/2(B′−B″) and the lines pile up there. That
     pile-up is the band head the student measures, and everything beyond it
     runs off to the red — which is why the bands are shaded the way they are.
     ---------------------------------------------------------------- */

  var ROT = {
    Be_u: 0.60443, alpha_u: 0.00590,   // B²Σ⁺
    Be_l: 0.64136, alpha_l: 0.00580,   // X²Σ⁺
    Trot: 2400,                        // rotational temperature of the arc, K
    Jmax: 70,
    width: 0.25                        // instrumental line width, Å
  };

  function Bv(v, Be, alpha) { return Be - alpha * (v + 0.5); }

  /* head displacement of a band above its origin, in cm⁻¹ */
  function headOffset(vu, vl) {
    var Bu = Bv(vu, ROT.Be_u, ROT.alpha_u), Bl = Bv(vl, ROT.Be_l, ROT.alpha_l);
    var sum = Bu + Bl, dif = Bu - Bl;
    return -(sum * sum) / (4 * dif);          // positive: the head lies to the violet
  }

  /* every rotational line of one band, given where its head sits */
  function bandLines(band) {
    var Bu = Bv(band.vu, ROT.Be_u, ROT.alpha_u), Bl = Bv(band.vl, ROT.Be_l, ROT.alpha_l);
    var sum = Bu + Bl, dif = Bu - Bl;
    var nu0 = band.nu - headOffset(band.vu, band.vl);   // band origin
    var hc_k = 1.438776, out = [];
    for (var m = -ROT.Jmax; m <= ROT.Jmax; m++) {
      if (m === 0) continue;
      var J = m > 0 ? m - 1 : -m;                      // R branch: m = J+1, P branch: m = −J
      var pop = Math.exp(-Bl * J * (J + 1) * hc_k / ROT.Trot);
      var s = Math.abs(m) * pop;
      if (s < 0.02) continue;
      var nu = nu0 + sum * m + dif * m * m;
      out.push({ lambda: 1e8 / nu, s: s, vu: band.vu, vl: band.vl, m: m, J: J });
    }
    var tot = out.reduce(function (a, l) { return a + l.s; }, 0) || 1;
    out.forEach(function (l) { l.s *= band.intensity / tot; });
    return out;
  }

  /* ---------- a set of lines that can be sampled at any resolution ----------
     Profiles are area-normalised, so widening the slit spreads a line out
     instead of making it brighter: the envelope stays put while the fine
     structure washes in and out as you zoom.                          */

  function LineSet(lines) {
    this.lines = lines.slice().sort(function (a, b) { return a.lambda - b.lambda; });
    this.lam = new Float64Array(this.lines.length);
    for (var i = 0; i < this.lines.length; i++) this.lam[i] = this.lines[i].lambda;
    this.norm = 1;
    this.norm = this.peak();
  }

  LineSet.prototype.lowerBound = function (x) {
    var lo = 0, hi = this.lam.length;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (this.lam[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  };

  LineSet.prototype.at = function (lambda, width) {
    var w = width || ROT.width;
    var half = 4 * w, y = 0;
    var i = this.lowerBound(lambda - half);
    var k = 1 / (w * 2.5066282746);
    for (; i < this.lines.length; i++) {
      var dx = this.lines[i].lambda - lambda;
      if (dx > half) break;
      var t = dx / w;
      y += this.lines[i].s * k * Math.exp(-0.5 * t * t);
    }
    return y / this.norm;
  };

  /* brightest point of the envelope at a slit width of 1 Å — used to scale
     everything else, so the strongest band comes out near unity */
  LineSet.prototype.peak = function () {
    if (!this.lines.length) return 1;
    var a = this.lam[0], b = this.lam[this.lam.length - 1], best = 1e-9;
    var n = 1500;
    for (var i = 0; i <= n; i++) {
      var v = this.at(a + (b - a) * i / n, 1.0);
      if (v > best) best = v;
    }
    return best;
  };

  /* the band each line belongs to, for the "what am I looking at" readout */
  LineSet.prototype.nearestLine = function (lambda) {
    var i = this.lowerBound(lambda);
    var c = [this.lines[i - 1], this.lines[i]].filter(Boolean);
    if (!c.length) return null;
    return c.sort(function (a, b) {
      return Math.abs(a.lambda - lambda) - Math.abs(b.lambda - lambda);
    })[0];
  };

  root.AlOPhysics = {
    TRUTH: TRUTH, LIT: LIT, PLATE: PLATE, HG_LINES: HG_LINES,
    G: G, nuBand: nuBand, nuToLambda: nuToLambda, lambdaToNu: lambdaToNu,
    buildBands: buildBands, makePlate: makePlate, vernier: vernier,
    ROT: ROT, Bv: Bv, headOffset: headOffset, bandLines: bandLines, LineSet: LineSet,
    hartmannFromThree: hartmannFromThree, lambdaFromHartmann: lambdaFromHartmann,
    analyse: analyse, linfit: linfit, mean: mean, sd: sd,
    seedFrom: seedFrom, mulberry32: mulberry32, round3: round3
  };

  if (typeof module !== "undefined" && module.exports) module.exports = root.AlOPhysics;

})(typeof window !== "undefined" ? window : globalThis);
