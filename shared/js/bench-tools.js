/* ============================================================
   bench-tools.js — the two things a student otherwise leaves the
   page for: a calculator, and a look back at the table they are
   working from.

   Both live in one panel pinned to the corner of the screen. It
   is built once and stays put, so it survives the page being
   re-drawn as figures are entered, and nothing typed into it is
   lost.

     BenchTools.init({ reference: function () { return html; } });
     BenchTools.refresh();     // after the page re-draws

   The calculator evaluates with the shared Formula parser, so
   what a student types is parsed, never run as code.
   ============================================================ */

(function (root) {
  "use strict";

  var opts = {}, panel = null, tape = [], tab = "calc";

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }

  function init(o) {
    opts = o || {};
    if (panel) return;

    var launcher = document.createElement("button");
    launcher.id = "benchLaunch";
    launcher.className = "bench-launch noprint";
    launcher.type = "button";
    launcher.title = "Calculator and the table you are working from";
    launcher.innerHTML = "<span>=</span> Tools";

    panel = document.createElement("section");
    panel.id = "benchPanel";
    panel.className = "bench noprint";
    panel.hidden = true;
    panel.innerHTML =
      '<header class="bench-head">' +
      '<button type="button" class="bench-tab" data-bench-tab="calc">Calculator</button>' +
      '<button type="button" class="bench-tab" data-bench-tab="ref">Your figures</button>' +
      '<button type="button" class="bench-close" data-bench="close" title="Close">×</button>' +
      "</header>" +
      '<div class="bench-body">' +
      '<div id="benchCalc">' +
      '<input id="benchInput" class="bench-input" inputmode="text" autocomplete="off" spellcheck="false" ' +
      'placeholder="20652.3 − 19687.0">' +
      '<div class="bench-keys">' +
      keys() +
      "</div>" +
      '<ol id="benchTape" class="bench-tape"></ol>' +
      '<p class="bench-hint">Enter works it out. sqrt, ln, log and brackets are understood. ' +
      "Tap a line to copy its value.</p>" +
      "</div>" +
      '<div id="benchRef" hidden></div>' +
      "</div>";

    document.body.appendChild(launcher);
    document.body.appendChild(panel);
    bind();
    showTab("calc");
  }

  function keys() {
    var rows = [
      ["7", "8", "9", "(", ")"],
      ["4", "5", "6", "×", "÷"],
      ["1", "2", "3", "+", "−"],
      ["0", ".", "⌫", "C", "="]
    ];
    return rows.map(function (r) {
      return '<div class="bench-krow">' + r.map(function (k) {
        var cls = k === "=" ? "bench-key is-go" : (k === "C" || k === "⌫") ? "bench-key is-edit" : "bench-key";
        return '<button type="button" class="' + cls + '" data-bench-key="' + esc(k) + '">' + esc(k) + "</button>";
      }).join("") + "</div>";
    }).join("");
  }

  function bind() {
    document.addEventListener("click", function (ev) {
      var t = ev.target.closest("[data-bench], [data-bench-tab], [data-bench-key], #benchLaunch, [data-bench-line]");
      if (!t) return;
      if (t.id === "benchLaunch") { toggle(); return; }
      if (t.dataset.bench === "close") { panel.hidden = true; return; }
      if (t.dataset.benchTab) { showTab(t.dataset.benchTab); return; }
      if (t.dataset.benchKey) { press(t.dataset.benchKey); return; }
      if (t.dataset.benchLine !== undefined) { copy(t.dataset.benchLine); return; }
    });

    el("benchInput").addEventListener("keydown", function (ev) {
      if (ev.key === "Enter") { ev.preventDefault(); evaluate(); }
    });
  }

  function toggle() {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) {
      refresh();
      var i = el("benchInput");
      if (tab === "calc" && i) i.focus();
    }
  }

  function showTab(which) {
    tab = which;
    el("benchCalc").hidden = which !== "calc";
    el("benchRef").hidden = which !== "ref";
    Array.prototype.forEach.call(panel.querySelectorAll(".bench-tab"), function (b) {
      b.setAttribute("aria-current", b.dataset.benchTab === which ? "true" : "false");
    });
    if (which === "ref") refresh();
  }

  function press(k) {
    var i = el("benchInput");
    if (k === "C") { i.value = ""; i.focus(); return; }
    if (k === "⌫") { i.value = i.value.slice(0, -1); i.focus(); return; }
    if (k === "=") { evaluate(); return; }
    i.value += k;
    i.focus();
  }

  function evaluate() {
    var i = el("benchInput");
    var src = i.value.trim();
    if (!src) return;
    var clean = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/,/g, "");
    var out;
    try {
      var v = root.Formula ? root.Formula.evaluate(clean, { vars: {}, cols: {} }) : NaN;
      out = isFinite(v) ? tidy(v) : "not a number";
    } catch (e) {
      out = "cannot read that";
    }
    tape.unshift({ src: src, out: out });
    tape = tape.slice(0, 12);
    drawTape();
    i.value = "";
    i.focus();
  }

  /* enough figures for this work, without a tail of noise */
  function tidy(v) {
    var a = Math.abs(v);
    if (a !== 0 && (a < 1e-4 || a >= 1e7)) return v.toExponential(5);
    var s = v.toFixed(a >= 1000 ? 3 : a >= 1 ? 5 : 7);
    return s.replace(/\.?0+$/, "");
  }

  function drawTape() {
    el("benchTape").innerHTML = tape.map(function (t) {
      return '<li data-bench-line="' + esc(t.out) + '" title="Tap to copy"><span>' + esc(t.src) +
        "</span><b>" + esc(t.out) + "</b></li>";
    }).join("");
  }

  function copy(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
    }
    var i = el("benchInput");
    if (i && !i.value) i.value = text;
  }

  /* the table the student is working from, supplied by the experiment */
  function refresh() {
    if (!panel || panel.hidden) return;
    var host = el("benchRef");
    if (!host) return;
    var html = "";
    try { html = opts.reference ? opts.reference() : ""; } catch (e) { html = ""; }
    host.innerHTML = html ||
      '<p class="bench-hint">Nothing from an earlier step is needed here.</p>';
  }

  root.BenchTools = {
    init: init,
    refresh: refresh,
    open: function (which) {
      if (!panel) return;
      panel.hidden = false;
      showTab(which || tab);
      refresh();
      if ((which || tab) === "calc") { var i = el("benchInput"); if (i) i.focus(); }
    }
  };

})(window);
