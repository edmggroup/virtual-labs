/* ============================================================
   spectrum.js — draws the photographic plate, the densitometer
   trace, the magnifier and the comparator crosswire.
   x on every canvas is the comparator scale in cm. There is
   no wavelength axis anywhere: that is what the experiment is
   for.
   ============================================================ */

(function (root) {
  "use strict";

  var P = root.AlOPhysics;

  function wavelengthRGB(nm) {
    var r = 0, g = 0, b = 0;
    if (nm >= 380 && nm < 440) { r = -(nm - 440) / 60; b = 1; }
    else if (nm < 490) { g = (nm - 440) / 50; b = 1; }
    else if (nm < 510) { g = 1; b = -(nm - 510) / 20; }
    else if (nm < 580) { r = (nm - 510) / 70; g = 1; }
    else if (nm < 645) { r = 1; g = -(nm - 645) / 65; }
    else if (nm <= 780) { r = 1; }
    var f = 1;
    if (nm < 420) f = 0.3 + 0.7 * (nm - 380) / 40;
    else if (nm > 700) f = 0.3 + 0.7 * (780 - nm) / 80;
    return [r * f, g * f, b * f];
  }

  function hash2(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function PlateView(els, opts) {
    this.els = els;                 // {plate, trace, overlay, mag}
    this.opts = opts || {};
    this.plate = null;
    this.source = "alo";            // 'alo' | 'hg'
    this.cursor = 10;
    this.span = null;               // cm across the viewer; null = whole plate
    this.colour = true;
    this.labels = true;
    this.snap = true;
    var self = this;
    this._onResize = function () { self.render(); };
    root.addEventListener("resize", this._onResize);
    this._bindPointer();
  }

  PlateView.prototype.setPlate = function (plate) {
    this.plate = plate;
    var f = this.source === "hg" ? plate.hg : plate.bands;
    this.cursor = f.length ? f[0].d : (plate.dMin + plate.dMax) / 2;
    this.render();
  };

  /* the useful stretch of plate for the spectrum on show */
  PlateView.prototype.fullRange = function () {
    var f = this.features();
    if (!f.length) return { d0: this.plate.dMin, d1: this.plate.dMax };
    var ds = f.map(function (x) { return x.d; });
    return { d0: Math.min.apply(null, ds) - 0.35, d1: Math.max.apply(null, ds) + 0.45 };
  };

  PlateView.prototype.setSource = function (src) {
    if (this.source === src) return;
    this.source = src;
    var f = this.features();
    if (f.length) this.cursor = f[0].d;
    this.render();
    if (this.onCursor) this.onCursor(this.cursor);
  };

  PlateView.prototype.view = function () {
    var fr = this.fullRange();
    var lo = fr.d0, hi = fr.d1;
    if (!this.span || this.span >= hi - lo) return { d0: lo, d1: hi };
    var half = this.span / 2, c = this.cursor;
    var d0 = Math.max(lo, Math.min(hi - this.span, c - half));
    return { d0: d0, d1: d0 + this.span };
  };

  PlateView.prototype.features = function () {
    if (!this.plate) return [];
    return this.source === "hg" ? this.plate.hg : this.plate.bands;
  };

  PlateView.prototype.lineSet = function () {
    return this.source === "hg" ? this.plate.hgSet : this.plate.alo;
  };

  /* Slit width matched to the sampling: at the full-plate view neighbouring
     rotational lines fall inside one pixel and merge into a continuous band;
     zoom in and the same code resolves them. */
  PlateView.prototype.widthFor = function (d0, d1, pixels) {
    var mid = (d0 + d1) / 2;
    var perPixel = Math.abs(this.plate.lambdaOf(mid + (d1 - d0) / pixels) - this.plate.lambdaOf(mid));
    return Math.max(P.ROT.width, 0.62 * perPixel);
  };

  PlateView.prototype.intensity = function (lambda, width) {
    return this.lineSet().at(lambda, width);
  };

  PlateView.prototype.nearestFeature = function (d) {
    var best = null, bd = Infinity;
    this.features().forEach(function (f) {
      var dd = Math.abs(f.d - d);
      if (dd < bd) { bd = dd; best = f; }
    });
    return best ? { feature: best, distance: bd } : null;
  };

  PlateView.prototype.setCursor = function (d, doSnap) {
    var lo = this.plate.dMin, hi = this.plate.dMax;
    d = Math.max(lo, Math.min(hi, d));
    if (doSnap && this.snap) {
      var n = this.nearestFeature(d);
      if (n && n.distance < (this.span ? this.span * 0.02 : 0.05)) d = n.feature.d;
    }
    this.cursor = P.round3(d);
    this.render();
    if (this.onCursor) this.onCursor(this.cursor);
  };

  /* ---------- canvas plumbing ---------- */

  function prep(canvas) {
    /* An off-screen canvas has no layout size: it is already the size it
       wants to be, so take its own width and height and draw at 1:1. */
    if (canvas.__offscreen || !canvas.clientWidth) {
      return { ctx: canvas.getContext("2d"), w: canvas.width, h: canvas.height, dpr: 1 };
    }
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.max(60, Math.round(canvas.clientWidth * dpr));
    var h = Math.max(20, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    return { ctx: canvas.getContext("2d"), w: w, h: h, dpr: dpr };
  }

  /* ---------- a picture of the plate for the report ----------
     The record ought to show the spectrum the student actually
     measured, with the settings they took marked on it. This
     renders the whole plate off-screen at print resolution and
     ticks off the readings.                                   */

  PlateView.prototype.snapshot = function (opts) {
    opts = opts || {};
    if (!this.plate) return null;
    var cv = document.createElement("canvas");
    cv.__offscreen = true;
    cv.width = opts.width || 1700;
    cv.height = opts.height || 300;

    var wasSource = this.source, wasSpan = this.span;
    if (opts.source) this.source = opts.source;
    this.span = null;

    var fr = this.fullRange();
    this._plate(cv, fr.d0, fr.d1, false);

    var ctx = cv.getContext("2d");
    var W = cv.width;
    function X(d) { return (d - fr.d0) / (fr.d1 - fr.d0) * W; }

    (opts.marks || []).forEach(function (m) {
      if (m.d < fr.d0 || m.d > fr.d1) return;
      var x = X(m.d);
      ctx.strokeStyle = "rgba(255,120,110,.95)";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, cv.height * 0.14); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, cv.height * 0.72); ctx.lineTo(x, cv.height * 0.86); ctx.stroke();
      if (m.label) {
        ctx.font = "bold 15px 'IBM Plex Mono', monospace";
        ctx.fillStyle = "rgba(255,190,185,.98)";
        ctx.textAlign = "center";
        ctx.fillText(m.label, x, cv.height * 0.14 + 17);
        ctx.textAlign = "left";
      }
    });

    if (opts.caption) {
      ctx.font = "14px 'IBM Plex Mono', monospace";
      ctx.fillStyle = "rgba(200,220,220,.75)";
      ctx.fillText(opts.caption, 10, 20);
    }

    this.source = wasSource;
    this.span = wasSpan;
    return cv;
  };

  PlateView.prototype.render = function () {
    if (!this.plate) return;
    var v = this.view();
    this._plate(this.els.plate, v.d0, v.d1);
    this._trace(this.els.trace, v.d0, v.d1);
    this._overlay(v.d0, v.d1);
    if (this.els.mag) {
      var w = 0.09;
      this._plate(this.els.mag, this.cursor - w, this.cursor + w, true);
    }
  };

  PlateView.prototype._plate = function (canvas, d0, d1, isMag) {
    var c = prep(canvas), ctx = c.ctx, w = c.w, h = c.h;
    var img = ctx.createImageData(w, h);
    var data = img.data;
    var plate = this.plate, colour = this.colour;
    var step = (d1 - d0) / w;

    // pre-compute per-column intensity
    var slit = this.widthFor(d0, d1, w);
    var col = new Float32Array(w), lam = new Float32Array(w);
    for (var x = 0; x < w; x++) {
      var d = d0 + (x + 0.5) * step;
      var L = plate.lambdaOf(d);
      lam[x] = L;
      col[x] = this.intensity(L, slit);
    }

    for (x = 0; x < w; x++) {
      var I = col[x];
      var rgb = colour ? wavelengthRGB(lam[x] / 10) : [0.82, 0.93, 0.90];
      // photographic response: compress so weak bands stay visible
      var dens = Math.pow(Math.max(0, Math.min(1.15, I)) / 1.15, 0.78);
      for (var y = 0; y < h; y++) {
        var fy = y / (h - 1);
        // slit image: soft edges top and bottom
        var edge = Math.min(1, Math.min(fy, 1 - fy) / 0.16);
        edge = edge * edge * (3 - 2 * edge);
        var grain = 0.86 + 0.28 * hash2(x, y + (isMag ? 991 : 0));
        var val = dens * edge * grain;
        var i = (y * w + x) * 4;
        data[i] = 10 + 245 * val * rgb[0];
        data[i + 1] = 12 + 243 * val * rgb[1];
        data[i + 2] = 15 + 240 * val * rgb[2];
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // scale on the plate holder
    ctx.save();
    ctx.scale(c.dpr, c.dpr);
    var W = w / c.dpr, H = h / c.dpr;
    ctx.strokeStyle = "rgba(255,255,255,.35)";
    ctx.fillStyle = "rgba(220,235,235,.75)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.lineWidth = 1;
    var stepTick = isMag ? 0.01 : ((d1 - d0) > 8 ? 0.5 : (d1 - d0) > 2 ? 0.2 : 0.05);
    var t0 = Math.ceil(d0 / stepTick) * stepTick;
    for (var t = t0; t <= d1; t += stepTick) {
      var px = (t - d0) / (d1 - d0) * W;
      ctx.beginPath();
      ctx.moveTo(px, H); ctx.lineTo(px, H - 7); ctx.stroke();
      if (!isMag) ctx.fillText(t.toFixed(stepTick < 0.1 ? 2 : 1), px + 3, H - 9);
    }
    ctx.restore();

    if (isMag) {
      ctx.save(); ctx.scale(c.dpr, c.dpr);
      var Wm = w / c.dpr, Hm = h / c.dpr;
      ctx.strokeStyle = "#c2352c"; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(Wm / 2, 0); ctx.lineTo(Wm / 2, Hm); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(Wm / 2 - 14, Hm / 2); ctx.lineTo(Wm / 2 + 14, Hm / 2); ctx.stroke();
      ctx.restore();
    }
  };

  PlateView.prototype._trace = function (canvas, d0, d1) {
    var c = prep(canvas), ctx = c.ctx;
    ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    var W = c.w / c.dpr, H = c.h / c.dpr;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = "#0a0c0f"; ctx.fillRect(0, 0, W, H);

    var pad = { t: this.source === "hg" ? 16 : 30, b: 16 };
    var plot = H - pad.t - pad.b;
    var self = this;
    function X(d) { return (d - d0) / (d1 - d0) * W; }
    function Y(I) { return pad.t + plot * (1 - Math.min(1.12, I) / 1.12); }

    // baseline + guide lines
    ctx.strokeStyle = "rgba(255,255,255,.10)"; ctx.lineWidth = 1;
    for (var g = Math.ceil(d0 * 2) / 2; g <= d1; g += 0.5) {
      ctx.beginPath(); ctx.moveTo(X(g), pad.t); ctx.lineTo(X(g), H - pad.b); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(0, Y(0)); ctx.lineTo(W, Y(0)); ctx.stroke();

    ctx.beginPath();
    ctx.strokeStyle = "#86e9d6"; ctx.lineWidth = 1.6;
    var n = Math.max(2, Math.round(W * 2));
    var slit = this.widthFor(d0, d1, n);
    for (var i = 0; i <= n; i++) {
      var d = d0 + (d1 - d0) * i / n;
      var I = self.intensity(self.plate.lambdaOf(d), slit);
      var x = X(d), y = Y(I);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    if (this.labels) {
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      this.features().forEach(function (f) {
        if (f.d < d0 || f.d > d1) return;
        var lab = f.label || (f.name + "");
        var peak = self.intensity(self.plate.lambdaOf(f.d + 0.002), slit);
        var top = Y(Math.max(peak, f.intensity !== undefined ? f.intensity * 0.55 : f.strength * 0.6));
        ctx.fillStyle = "rgba(134,233,214,.9)";
        ctx.fillText(lab, X(f.d) + 12, Math.max(pad.t + 4, top - 6));
        ctx.strokeStyle = "rgba(134,233,214,.35)";
        ctx.beginPath(); ctx.moveTo(X(f.d), Math.max(pad.t + 6, top - 4)); ctx.lineTo(X(f.d), Y(0)); ctx.stroke();
      });
      ctx.textAlign = "left";
    }

    // sequence brackets, so the groups on the plate can be named at a glance
    if (this.labels && this.source === "alo" && (d1 - d0) > 1.5) {
      var groups = {};
      this.plate.bands.forEach(function (b) {
        if (b.d < d0 || b.d > d1) return;
        var k = b.dv;
        groups[k] = groups[k] || { lo: b.d, hi: b.d };
        groups[k].lo = Math.min(groups[k].lo, b.d);
        groups[k].hi = Math.max(groups[k].hi, b.d);
      });
      ctx.strokeStyle = "rgba(200,220,220,.55)";
      ctx.fillStyle = "rgba(210,230,230,.85)";
      ctx.font = "11px 'IBM Plex Mono', monospace";
      ctx.textAlign = "center";
      ctx.lineWidth = 1;
      Object.keys(groups).forEach(function (k) {
        var a = X(groups[k].lo) - 3, b = X(groups[k].hi) + 14, y = 20;
        if (b - a < 12) return;
        ctx.beginPath();
        ctx.moveTo(a, y); ctx.lineTo(a, y - 5); ctx.lineTo(b, y - 5); ctx.lineTo(b, y);
        ctx.stroke();
        ctx.fillText("Δv = " + (+k > 0 ? "+" : +k < 0 ? "−" : "") + Math.abs(+k), (a + b) / 2, y - 8);
      });
      ctx.textAlign = "left";
    }

    ctx.fillStyle = "rgba(180,200,200,.65)";
    ctx.font = "10px 'IBM Plex Mono', monospace";
    ctx.fillText("densitometer trace — comparator scale (cm)", 6, H - 4);
  };

  PlateView.prototype._overlay = function (d0, d1) {
    var canvas = this.els.overlay;
    var c = prep(canvas);
    var ctx = c.ctx;
    ctx.setTransform(c.dpr, 0, 0, c.dpr, 0, 0);
    var W = c.w / c.dpr, H = c.h / c.dpr;
    ctx.clearRect(0, 0, W, H);
    if (this.cursor < d0 || this.cursor > d1) return;
    var x = (this.cursor - d0) / (d1 - d0) * W;
    ctx.strokeStyle = "#c2352c";
    ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    ctx.fillStyle = "#c2352c";
    ctx.beginPath(); ctx.moveTo(x - 5, 0); ctx.lineTo(x + 5, 0); ctx.lineTo(x, 8); ctx.closePath(); ctx.fill();
    ctx.font = "11px 'IBM Plex Mono', monospace";
    var t = this.cursor.toFixed(3) + " cm";
    var tw = ctx.measureText(t).width;
    var tx = Math.min(W - tw - 6, Math.max(4, x + 7));
    ctx.fillStyle = "rgba(10,12,15,.75)";
    ctx.fillRect(tx - 3, 10, tw + 6, 15);
    ctx.fillStyle = "#f2b8b3";
    ctx.fillText(t, tx, 21);
  };

  /* ---------- pointer interaction ---------- */

  PlateView.prototype._bindPointer = function () {
    var self = this;
    var targets = [this.els.plate, this.els.trace, this.els.overlay.parentNode];
    function pick(ev) {
      if (!self.plate) return;
      var box = self.els.plate.getBoundingClientRect();
      var v = self.view();
      var f = (ev.clientX - box.left) / box.width;
      self.setCursor(v.d0 + f * (v.d1 - v.d0), true);
    }
    targets.forEach(function (el) {
      if (!el) return;
      el.style.cursor = "col-resize";
      el.addEventListener("pointerdown", function (ev) {
        el.setPointerCapture && el.setPointerCapture(ev.pointerId);
        self._drag = true; pick(ev);
      });
      el.addEventListener("pointermove", function (ev) { if (self._drag) pick(ev); });
      el.addEventListener("pointerup", function () { self._drag = false; });
      el.addEventListener("pointercancel", function () { self._drag = false; });
    });
  };

  root.PlateView = PlateView;
  root.wavelengthRGB = wavelengthRGB;

})(window);
