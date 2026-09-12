/* ============================================================
   lab-engine.js — runs an experiment that was described rather
   than programmed.

   An instructor defines the observation table, the quantities to
   be worked out and the formulae behind them; this renders the
   whole experiment from that description. The formulae are used
   to CHECK the student, never to fill anything in: every derived
   quantity is typed by the student and marked ✓ or ✗ against
   what follows from their own readings.

   Spec shape — see ADDING-AN-EXPERIMENT.md for the full list.
   ============================================================ */

(function (root) {
  "use strict";

  var F = root.Formula;
  var CFG = root.VLAB_CONFIG || {};

  var spec = null, S = null, step = 0, exam = false;

  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c];
    });
  }
  function num(v) {
    if (v === undefined || v === null || v === "") return NaN;
    var x = typeof v === "number" ? v : parseFloat(String(v).replace(/[, ]/g, ""));
    return isFinite(x) ? x : NaN;
  }
  function fmt(x, dp) { return isFinite(x) ? Number(x).toFixed(dp === undefined ? 3 : dp) : "—"; }

  /* ---------- state ---------- */

  function blankState() {
    return {
      student: { name: "", register: "", batch: "", partner: "", date: new Date().toISOString().slice(0, 10) },
      cells: {},        // "row:key" -> what the student typed
      values: {},       // derived and result keys -> what the student typed
      notes: {},        // working, per stage
      answers: {}
    };
  }
  function key() { return "vlab." + spec.id + "." + (S.student.register || "unsaved"); }
  function save() {
    try {
      localStorage.setItem(key(), JSON.stringify(S));
      localStorage.setItem("vlab.last." + spec.id, S.student.register || "");
    } catch (e) {}
  }
  function load(reg) {
    try {
      var raw = localStorage.getItem("vlab." + spec.id + "." + reg);
      if (raw) { S = Object.assign(blankState(), JSON.parse(raw)); return true; }
    } catch (e) {}
    return false;
  }

  /* ---------- scope for the formulae ---------- */

  function rowCount() { return (spec.table && spec.table.rows) || 6; }
  function columns() { return (spec.table && spec.table.columns) || []; }

  function constants() {
    var v = {};
    (spec.constants || []).forEach(function (c) { v[c.key] = num(c.value); });
    return v;
  }

  function cols() {
    var out = {};
    columns().forEach(function (c) {
      out[c.key] = [];
      for (var r = 0; r < rowCount(); r++) out[c.key].push(num(S.cells[r + ":" + c.key]));
    });
    return out;
  }

  function rowScope(r) {
    var vars = constants();
    columns().forEach(function (c) { vars[c.key] = num(S.cells[r + ":" + c.key]); });
    return { vars: vars, cols: cols() };
  }

  /* quantities already worked out, so later formulae can use them */
  function fullScope() {
    var vars = constants();
    (spec.derived || []).concat(spec.results || []).forEach(function (d) {
      vars[d.key] = num(S.values[d.key]);
    });
    return { vars: vars, cols: cols() };
  }

  function expected(formula, scope) {
    if (!formula) return NaN;
    try { return F.evaluate(formula, scope); } catch (e) { return NaN; }
  }

  function tolerance(exp, dp, spec2) {
    if (spec2 && isFinite(num(spec2.tolerance))) return num(spec2.tolerance);
    var rel = Math.abs(exp) * 0.01;
    var abs = Math.pow(10, -(dp === undefined ? 3 : dp)) * 5;
    return Math.max(rel, abs, 1e-12);
  }

  function check(typed, exp, tol) {
    var t = num(typed);
    if (!isFinite(t)) return { state: "empty" };
    if (!isFinite(exp)) return { state: "unknown" };
    return { state: Math.abs(t - exp) <= tol ? "ok" : "off" };
  }

  function mark(c) {
    if (!c || c.state === "empty") return '<span class="mark"></span>';
    if (c.state === "unknown") return '<span class="mark" title="waiting on an earlier value">·</span>';
    if (c.state === "ok") return '<span class="mark ok" title="follows from your own readings">✓</span>';
    return '<span class="mark off" title="does not follow from your own readings — check this one">✗</span>';
  }

  function tally(list) {
    var t = { ok: 0, off: 0, empty: 0, total: list.length };
    list.forEach(function (c) {
      if (!c || c.state === "empty" || c.state === "unknown") t.empty++;
      else if (c.state === "ok") t.ok++;
      else t.off++;
    });
    return t;
  }
  function tallyNote(t, todo) {
    if (!t.total) return "";
    if (t.empty === t.total) return '<div class="note">' + esc(todo) + "</div>";
    if (t.off) return '<div class="note bad">' + t.off + " entr" + (t.off === 1 ? "y does" : "ies do") +
      " not follow from your own readings. They are marked ✗ — re-work those first.</div>";
    if (t.empty) return '<div class="note warn">' + t.ok + " of " + t.total + " consistent so far; " + t.empty + " still to do.</div>";
    return '<div class="note">All " + t.total + " entries are consistent with your own readings.</div>'.replace('" + t.total + "', t.total);
  }

  function numInput(attr, id, value) {
    return '<input class="wk" inputmode="decimal" data-' + attr + '="' + esc(id) + '" value="' + esc(value == null ? "" : value) + '">';
  }

  /* ---------- simulated instruments ----------
     A column of kind "measured" is read off an instrument rather
     than typed: the spec says how the quantity behaves, and the
     reading comes back with scatter that is fixed for a given
     register number, so no two students get the same numbers and
     the same student always gets theirs back.                  */

  function hash(str) {
    var h = 2166136261 >>> 0;
    str = String(str || "");
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }
  function rand(seedStr) {
    var a = hash(seedStr);
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    var t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function hasInstrument() {
    return columns().some(function (c) { return c.kind === "measured"; });
  }

  function takeReading(r) {
    var scope = rowScope(r);
    var any = false;
    columns().forEach(function (c) {
      if (c.kind !== "measured" || !c.source) return;
      var base = expected(c.source.formula, scope);
      if (!isFinite(base)) return;
      var noise = num(c.source.noise);
      if (!isFinite(noise)) noise = 0.01;
      var seed = (S.student.register || "x") + ":" + spec.id + ":" + r + ":" + c.key;
      var wobble = (rand(seed) + rand(seed + "b") - 1) * noise;          // roughly bell shaped
      var v = base * (1 + wobble) + (num(c.source.offset) || 0);
      S.cells[r + ":" + c.key] = v.toFixed(c.dp === undefined ? 3 : c.dp);
      any = true;
    });
    return any;
  }

  /* ---------- steps ---------- */

  function steps() {
    var list = [
      { id: "aim", group: "Prepare", title: "Aim and theory", render: stepAim },
      { id: "obs", group: "Measure", title: "Observations", render: stepObs },
      { id: "calc", group: "Analyse", title: "Calculations", render: stepCalc }
    ];
    if (spec.plot) list.push({ id: "graph", group: "Analyse", title: "Graph", render: stepGraph });
    list.push({ id: "result", group: "Report", title: "Result", render: stepResult });
    if ((spec.questions || []).length) list.push({ id: "viva", group: "Report", title: "Questions", render: stepViva });
    list.push({ id: "report", group: "Report", title: "Report", render: stepReport });
    return list;
  }

  function nav() {
    var L = steps(), prev = L[step - 1], next = L[step + 1];
    return '<div class="steps-nav noprint">' +
      (prev ? '<button class="ghost" data-go="' + (step - 1) + '">← ' + esc(prev.title) + "</button>" : "<span></span>") +
      (next ? '<button class="primary" data-go="' + (step + 1) + '">' + esc(next.title) + " →</button>" : "<span></span>") +
      "</div>";
  }

  function stepAim() {
    var done = submitted
      ? '<div class="note"><strong>Submitted.</strong> The record has gone to the department and the ' +
        'PDF has been downloaded. The readings and the candidate details have been cleared, so this ' +
        'is a fresh experiment. An experiment may be submitted once per register number.</div>'
      : "";
    var theory = (spec.theory || []).map(function (t) { return "<p>" + esc(t) + "</p>"; }).join("");
    var shown = (spec.formulae || []).map(function (f) { return '<p class="formula">' + esc(f) + "</p>"; }).join("");
    var consts = (spec.constants || []).length
      ? '<div class="card"><h3>Constants you will need</h3><dl class="kv">' +
        spec.constants.map(function (c) {
          return "<dt>" + esc(c.label || c.key) + "</dt><dd>" + esc(c.key) + " = " + esc(c.value) + " " + esc(c.unit || "") + "</dd>";
        }).join("") + "</dl></div>"
      : "";
    return done + "<h2>" + esc(spec.title) + "</h2>" +
      (spec.aim ? "<h3>Aim</h3><p>" + esc(spec.aim) + "</p>" : "") +
      (spec.apparatus ? "<h3>Apparatus</h3><p>" + esc(spec.apparatus) + "</p>" : "") +
      (theory || shown ? "<h3>Theory</h3>" + theory + shown : "") +
      consts +
      '<div class="card"><h3>Your details</h3><div class="grid2"><div>' +
      field("Name", "name") + field("Register number", "register") +
      "</div><div>" + field("Batch", "batch") + field("Date", "date", "date") + "</div></div>" +
      '<p style="margin:0;font-size:.88rem;color:var(--ink-2)">Your readings are kept in this browser under your register number.</p></div>' +
      nav();
  }

  function field(label, k, type) {
    return '<label class="field"><span>' + esc(label) + '</span><input type="' + (type || "text") +
      '" data-student="' + k + '" value="' + esc(S.student[k] || "") + '"></label>';
  }

  function stepObs() {
    var cs = columns();
    if (!cs.length) return "<h2>Observations</h2><div class='note warn'>This experiment has no observation table defined.</div>" + nav();
    var checks = [];
    var head = "<tr><th>No.</th>" + cs.map(function (c) {
      return '<th class="num">' + esc(c.label || c.key) + (c.unit ? " (" + esc(c.unit) + ")" : "") + "</th>";
    }).join("") + (hasInstrument() ? "<th>Instrument</th>" : "") + "</tr>";

    var body = "";
    for (var r = 0; r < rowCount(); r++) {
      body += (function (r) {
        var cells = cs.map(function (c) {
          var id = r + ":" + c.key;
          if (c.kind === "calc") {
            var exp = expected(c.formula, rowScope(r));
            var ck = check(S.cells[id], exp, tolerance(exp, c.dp, c));
            checks.push(ck);
            return '<td class="num">' + numInput("cell", id, S.cells[id]) + " " + mark(ck) + "</td>";
          }
          if (c.kind === "measured") {
            return '<td class="num"><input class="wk" readonly value="' +
              esc(S.cells[id] == null ? "" : S.cells[id]) + '" data-cell-ro="' + id + '"></td>';
          }
          return '<td class="num">' + numInput("cell", id, S.cells[id]) + "</td>";
        }).join("");
        var btn = hasInstrument()
          ? '<td><button class="ghost" data-measure="' + r + '">' +
            (cs.some(function (c) { return c.kind === "measured" && S.cells[r + ":" + c.key]; }) ? "Read again" : "Take the reading") +
            "</button></td>"
          : "";
        return "<tr><td>" + (r + 1) + "</td>" + cells + btn + "</tr>";
      })(r);
    }

    var calcCols = cs.filter(function (c) { return c.kind === "calc"; });
    return "<h2>Observations</h2>" +
      (spec.procedure ? "<p>" + esc(spec.procedure) + "</p>" : "") +
      (hasInstrument() ? "<p>Set the controls for each row, then take the reading from the instrument. The scatter on a reading is fixed by your register number, so your table is your own — and taking a reading again gives you the same value, as it should.</p>" : "") +
      (calcCols.length ? "<p>The shaded columns are yours to work out. Each one is checked against your own readings in the same row:</p>" +
        calcCols.map(function (c) {
          return '<p class="formula">' + esc(c.label || c.key) + " = " + esc(c.formula) + "</p>";
        }).join("") : "") +
      '<div class="tablewrap"><table><caption>' + esc((spec.table && spec.table.caption) || "Table 1 — observations") + "</caption>" +
      "<thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>" +
      tallyNote(tally(checks), "Enter your readings, then work out the calculated columns.") +
      '<div class="card">' + noteBox("obs", "Any remarks about the measurements") + "</div>" + nav();
  }

  function noteBox(k, label) {
    return '<label class="field"><span>' + esc(label) + '</span><textarea data-note="' + k + '">' +
      esc(S.notes[k] || "") + "</textarea></label>";
  }

  function stepCalc() {
    var list = (spec.derived || []);
    if (!list.length) return "<h2>Calculations</h2><div class='note warn'>Nothing to work out has been defined.</div>" + nav();
    var checks = [];
    var rows = list.map(function (d) {
      var exp = expected(d.formula, fullScope());
      var ck = check(S.values[d.key], exp, tolerance(exp, d.dp, d));
      checks.push(ck);
      return "<tr><td>" + esc(d.label || d.key) + "</td>" +
        "<td>" + esc(d.formula) + "</td>" +
        '<td class="num">' + numInput("value", d.key, S.values[d.key]) + " " + mark(ck) + "</td>" +
        '<td class="num">' + esc(d.unit || "") + "</td></tr>";
    }).join("");

    return "<h2>Calculations</h2>" +
      '<div class="recordbar noprint" style="margin:0 0 12px">' +
      '<button class="ghost" data-act="showRef">Show my readings</button>' +
      '<button class="ghost" data-act="showCalc">Calculator</button></div>' +
      "<p>Work each one out from your own table and enter it. The formula is beside it; the mark tells you whether your figure follows from your readings, not whether it matches an expected answer.</p>" +
      '<div class="tablewrap"><table><caption>Quantities to be worked out</caption>' +
      '<thead><tr><th>Quantity</th><th>From</th><th class="num">Your value</th><th class="num">Unit</th></tr></thead>' +
      "<tbody>" + rows + "</tbody></table></div>" +
      tallyNote(tally(checks), "Work down the table.") +
      '<div class="card">' + noteBox("calc", "Your working — substitution and arithmetic") + "</div>" + nav();
  }

  function stepGraph() {
    return "<h2>Graph</h2>" +
      "<p>" + esc(spec.plot.caption || "Your readings, with a straight line fitted through them.") + "</p>" +
      '<div id="plotHost"></div>' +
      '<div class="note">The graph goes into the report as it stands. A point off the line is a reading worth taking again.</div>' +
      nav();
  }

  function plotSVG() {
    if (!spec.plot || !root.Plot) return null;
    var c = cols();
    var pts = F.pairs(c[spec.plot.x] || [], c[spec.plot.y] || []);
    if (pts.length < 2) return null;
    var f = F.fit(pts);
    return root.Plot.scatterFit({
      points: pts,
      fit: f ? { slope: f.m, intercept: f.c } : null,
      xlabel: spec.plot.xlabel || spec.plot.x,
      ylabel: spec.plot.ylabel || spec.plot.y,
      title: spec.plot.title || (spec.plot.y + " against " + spec.plot.x),
      annotation: f ? "slope = " + f.m.toPrecision(4) + ",  intercept = " + f.c.toPrecision(4) + ",  r² = " + f.r2.toFixed(4) : ""
    });
  }

  function stepResult() {
    var list = (spec.results || []);
    var checks = [];
    var rows = list.map(function (d) {
      var exp = expected(d.formula, fullScope());
      var ck = check(S.values[d.key], exp, tolerance(exp, d.dp, d));
      checks.push(ck);
      var mine = num(S.values[d.key]);
      var lit = num(d.literature);
      var err = isFinite(mine) && isFinite(lit) && lit ? Math.abs(mine - lit) / Math.abs(lit) * 100 : NaN;
      return "<tr><td>" + esc(d.label || d.key) + "</td>" +
        '<td class="num">' + numInput("value", d.key, S.values[d.key]) + " " + mark(ck) + "</td>" +
        '<td class="num">' + esc(d.unit || "") + "</td>" +
        '<td class="num">' + (isFinite(lit) ? fmt(lit, d.dp) : "—") + "</td>" +
        '<td class="num">' + (isFinite(err) ? fmt(err, 1) : "—") + "</td></tr>";
    }).join("");

    return "<h2>Result</h2>" +
      (list.length
        ? '<div class="tablewrap"><table><caption>Result</caption>' +
          '<thead><tr><th>Quantity</th><th class="num">Your value</th><th class="num">Unit</th><th class="num">Expected</th><th class="num">Difference (%)</th></tr></thead>' +
          "<tbody>" + rows + "</tbody></table></div>" + tallyNote(tally(checks), "Work out the final quantities.")
        : '<div class="note warn">No result quantities have been defined for this experiment.</div>') +
      '<div class="card">' + noteBox("errors", "Sources of error and remarks") + "</div>" + nav();
  }

  function stepViva() {
    return "<h2>Questions</h2>" + (spec.questions || []).map(function (q, i) {
      return '<div class="card"><h3>' + (i + 1) + ". " + esc(q) + "</h3>" +
        '<label class="field"><textarea data-answer="q' + i + '">' + esc(S.answers["q" + i] || "") + "</textarea></label></div>";
    }).join("") + nav();
  }

  function stepReport() {
    var seal = root.VirtualLab && S.student.register
      ? root.VirtualLab.submittedAt(spec.id, S.student.register) : null;
    if (seal) {
      return "<h2>Report</h2>" +
        '<div class="note warn">This register number submitted this experiment on ' +
        esc(String(seal).slice(0, 10)) + '. An experiment may be submitted once. You can still ' +
        'download the PDF.</div>' +
        '<div class="recordbar noprint" style="margin-bottom:14px">' +
        '<button class="primary" data-act="pdf">Download the report (PDF)</button>' +
        '<span class="progress" id="submitMsg"></span></div>' +
        '<div id="reportHost" class="report"></div>';
    }
    return "<h2>Report</h2>" +
      '<div class="recordbar noprint" style="margin-bottom:14px">' +
      '<button class="primary" data-act="pdf">Download the report (PDF)</button>' +
      '<button class="ghost" data-act="print">Print this page</button>' +
      (root.VirtualLab && root.VirtualLab.configured()
        ? '<button class="primary" data-act="submit">Submit to the department</button>'
        : '<span class="progress">Online submission is not configured for this site.</span>') +
      '<span class="progress" id="submitMsg"></span></div>' +
      '<div class="note">The PDF is the record, and the only file this site produces. Keep it.</div>' +
      '<div class="note warn">Submitting is final. You may submit once. Your PDF is downloaded first, then your readings are cleared from this browser.</div>' +
      '<div id="reportHost" class="report"></div>';
  }

  /* ---------- the record ---------- */

  function blocks(opts) {
    opts = opts || {};
    var b = [];
    var cs = columns();
    b.push({ type: "title", text: spec.title });
    b.push({
      type: "paragraph",
      text: [spec.course, spec.number ? "experiment " + spec.number : ""].filter(Boolean).join(", ") +
        " — " + [CFG.DEPARTMENT, CFG.INSTITUTION].filter(Boolean).join(", ")
    });
    b.push({
      type: "meta", pairs: [["Name", S.student.name || "—"], ["Register number", S.student.register || "—"],
        ["Batch", S.student.batch || "—"], ["Date", S.student.date || "—"]]
    });
    if (spec.aim) { b.push({ type: "heading", text: "Aim" }); b.push({ type: "paragraph", text: spec.aim }); }
    (spec.formulae || []).forEach(function (f) { b.push({ type: "formula", text: f }); });

    if (cs.length) {
      b.push({ type: "heading", text: "Observations" });
      var rows = [["No."].concat(cs.map(function (c) { return (c.label || c.key) + (c.unit ? " (" + c.unit + ")" : ""); }))];
      for (var r = 0; r < rowCount(); r++) {
        rows.push([String(r + 1)].concat(cs.map(function (c) {
          var v = S.cells[r + ":" + c.key];
          return v == null || v === "" ? "—" : String(v);
        })));
      }
      b.push({ type: "table", caption: (spec.table && spec.table.caption) || "Table 1 — observations", rows: rows });
      if (S.notes.obs) b.push({ type: "paragraph", text: S.notes.obs });
    }

    if ((spec.derived || []).length) {
      b.push({ type: "heading", text: "Calculations" });
      b.push({
        type: "table", caption: "Quantities worked out",
        rows: [["Quantity", "From", "Value", "Unit"]].concat((spec.derived || []).map(function (d) {
          return [d.label || d.key, d.formula, String(S.values[d.key] == null || S.values[d.key] === "" ? "—" : S.values[d.key]), d.unit || ""];
        }))
      });
      if (S.notes.calc) b.push({ type: "paragraph", text: "Working: " + S.notes.calc });
    }

    if (opts.graphs !== false && spec.plot) {
      var svg = plotSVG();
      if (svg) {
        b.push({ type: "heading", text: "Graph" });
        b.push({ type: "image", svg: svg, caption: spec.plot.caption || "", key: "plot" });
      }
    }

    if ((spec.results || []).length) {
      b.push({ type: "heading", text: "Result" });
      b.push({
        type: "table", caption: "Result",
        rows: [["Quantity", "My value", "Unit", "Expected"]].concat((spec.results || []).map(function (d) {
          return [d.label || d.key, String(S.values[d.key] == null || S.values[d.key] === "" ? "—" : S.values[d.key]),
            d.unit || "", d.literature == null ? "—" : String(d.literature)];
        }))
      });
    }
    if (S.notes.errors) {
      b.push({ type: "heading", text: "Sources of error" });
      b.push({ type: "paragraph", text: S.notes.errors });
    }
    if ((spec.questions || []).length) {
      b.push({ type: "heading", text: "Questions" });
      spec.questions.forEach(function (q, i) {
        b.push({ type: "heading", level: 3, text: (i + 1) + ". " + q });
        b.push({ type: "paragraph", text: S.answers["q" + i] || "— not answered —" });
      });
    }
    return b;
  }

  function summary() {
    var out = {};
    (spec.derived || []).concat(spec.results || []).forEach(function (d) {
      var v = num(S.values[d.key]);
      out[(d.label || d.key) + (d.unit ? " (" + d.unit + ")" : "")] = isFinite(v) ? v : "";
    });
    out["Rows filled"] = (function () {
      var n = 0;
      for (var r = 0; r < rowCount(); r++) {
        if (columns().some(function (c) { return isFinite(num(S.cells[r + ":" + c.key])); })) n++;
      }
      return n;
    })();
    return out;
  }

  /* ---------- what the tools panel has to hand ---------- */

  function referenceHTML() {
    var id = steps()[step] ? steps()[step].id : "";
    if (id === "aim" || id === "obs") {
      return (spec.constants || []).length
        ? "<h4>Constants</h4><dl class=\"kv\">" + spec.constants.map(function (c) {
          return "<dt>" + esc(c.key) + "</dt><dd>" + esc(c.value) + " " + esc(c.unit || "") + "</dd>";
        }).join("") + "</dl>"
        : "";
    }
    var cs = columns();
    if (!cs.length) return "";
    var head = "<tr><th>No.</th>" + cs.map(function (c) {
      return '<th class="num">' + esc(c.label || c.key) + "</th>";
    }).join("") + "</tr>";
    var body = "";
    for (var r = 0; r < rowCount(); r++) {
      body += "<tr><td>" + (r + 1) + "</td>" + cs.map(function (c) {
        var v = S.cells[r + ":" + c.key];
        return '<td class="num">' + esc(v == null || v === "" ? "—" : v) + "</td>";
      }).join("") + "</tr>";
    }
    var consts = (spec.constants || []).length
      ? "<h4>Constants</h4><dl class=\"kv\">" + spec.constants.map(function (c) {
        return "<dt>" + esc(c.key) + "</dt><dd>" + esc(c.value) + " " + esc(c.unit || "") + "</dd>";
      }).join("") + "</dl>"
      : "";
    return "<h4>Your readings</h4><div class=\"tablewrap\"><table><thead>" + head +
      "</thead><tbody>" + body + "</tbody></table></div>" + consts;
  }

  /* ---------- rendering ---------- */

  function render() {
    var L = steps();
    step = Math.max(0, Math.min(L.length - 1, step));
    el("steps").innerHTML = L[step].render();

    var groups = [], seen = {};
    L.forEach(function (s) { if (!seen[s.group]) { seen[s.group] = 1; groups.push(s.group); } });
    el("rail").innerHTML = groups.map(function (g) {
      return '<div class="group">' + esc(g) + "</div>" + L.map(function (s, i) {
        return s.group !== g ? "" : '<button data-go="' + i + '"' + (i === step ? ' aria-current="true"' : "") +
          '><span class="n">' + (i + 1) + "</span>" + esc(s.title) + "</button>";
      }).join("");
    }).join("");

    var who = el("whoami");
    if (who) who.textContent = submitted || !S.student.register
      ? "" : (S.student.name || "") + "  ·  " + S.student.register;

    if (L[step].id === "graph") {
      var svg = plotSVG();
      el("plotHost").innerHTML = svg ? '<div class="chartbox">' + svg + "</div>"
        : '<div class="note warn">Two complete rows are needed before a line can be drawn.</div>';
    }
    if (L[step].id === "report") el("reportHost").innerHTML = root.ReportDoc.html(blocks());
    if (root.BenchTools) root.BenchTools.refresh();
    root.scrollTo({ top: 0 });
    save();
  }

  /* ---------- events ---------- */

  var timer = null;
  function later() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      var a = document.activeElement;
      var d = a && a.dataset ? Object.assign({}, a.dataset) : null;
      render();
      if (d) {
        var sel = d.cell ? '[data-cell="' + d.cell + '"]' : d.value ? '[data-value="' + d.value + '"]' : null;
        var again = sel && document.querySelector(sel);
        if (again) { again.focus(); try { again.setSelectionRange(again.value.length, again.value.length); } catch (e) {} }
      }
    }, 800);
  }

  function bind() {
    document.addEventListener("click", function (ev) {
      var g = ev.target.closest("[data-go]");
      if (g) { step = +g.dataset.go; render(); return; }
      var m = ev.target.closest("[data-measure]");
      if (m) {
        if (!S.student.register) { alert("Enter your register number first — the instrument is set up for you."); return; }
        takeReading(+m.dataset.measure);
        save(); render();
        return;
      }
      var a = ev.target.closest("[data-act]");
      if (!a) return;
      if (a.dataset.act === "showRef") { if (root.BenchTools) root.BenchTools.open("ref"); return; }
      if (a.dataset.act === "showCalc") { if (root.BenchTools) root.BenchTools.open("calc"); return; }
      if (a.dataset.act === "print") root.print();
      if (a.dataset.act === "pdf") buildPDF(el("submitMsg"));
      if (a.dataset.act === "submit") submit();
    });

    document.addEventListener("input", function (ev) {
      var d = ev.target.dataset;
      if (!d) return;
      if (d.student) { S.student[d.student] = ev.target.value; save(); return; }
      if (d.note) { S.notes[d.note] = ev.target.value; save(); return; }
      if (d.answer) { S.answers[d.answer] = ev.target.value; save(); return; }
      if (d.cell) { S.cells[d.cell] = ev.target.value; save(); later(); return; }
      if (d.value) { S.values[d.value] = ev.target.value; save(); later(); return; }
    });
  }

  /* ---------- submitting, once ----------
     The PDF goes into the student's hands first, the record goes to the
     department, and only then is the working cleared — so the machine is
     ready for the next candidate and nothing is lost if the send fails. */

  function submit() {
    var msg = el("submitMsg");
    if (!S.student.name || !S.student.register) {
      if (msg) msg.textContent = "Add your name and register number before submitting.";
      return;
    }
    if (!root.confirm("Submit this record?\n\nYou can submit once. Your PDF will be downloaded first, " +
      "and your readings will then be cleared from this browser.")) return;

    if (msg) msg.textContent = "Building your PDF…";
    buildPDF(msg).then(function (built) {
      if (!built) {
        if (msg) msg.textContent =
          "Nothing was sent: your PDF could not be built, and submitting would have cleared your work without a copy in your hands.";
        return;
      }
      if (msg) msg.textContent = "Sending…";
      return root.VirtualLab.submit({
        student: S.student,
        summary: summary(),
        data: { cells: S.cells, values: S.values, notes: S.notes, answers: S.answers },
        report: root.ReportDoc.forBackend(blocks({ graphs: false }))
      }, msg).then(function (sent) {
        if (!sent) return;
        root.VirtualLab.markSubmitted(spec.id, S.student.register);
        finish();
      });
    });
  }

  function buildPDF(msg) {
    return root.ReportDoc.download(blocks(), {
      title: spec.title + " — " + (S.student.name || "record"),
      author: S.student.name || "",
      subject: spec.course || "",
      header: spec.title + (spec.number ? "  ·  experiment " + spec.number : ""),
      footer: [S.student.name, S.student.register].filter(Boolean).join("  ·  ")
    }, spec.id + "-" + (S.student.register || "record") + ".pdf")
      .then(function () { if (msg) msg.textContent = "PDF downloaded."; return true; })
      .catch(function () { if (msg) msg.textContent = "The PDF could not be built — try the print button."; return false; });
  }

  function finish() {
    try {
      localStorage.removeItem(key());
      localStorage.removeItem("vlab.last." + spec.id);
    } catch (e) {}
    S = blankState();
    submitted = true;
    step = 0;
    render();
  }

  var submitted = null;

  /* ---------- start ---------- */

  function start(loaded) {
    spec = loaded;
    exam = /[?&]exam=1/.test(location.search);
    root.EXPERIMENT = {
      id: spec.id, title: spec.title, number: spec.number || null,
      programme: spec.programme || "", course: spec.course || "", subject: spec.subject || ""
    };
    S = blankState();
    var last = null;
    try { last = localStorage.getItem("vlab.last." + spec.id); } catch (e) {}
    if (last) load(last);
    if (root.BenchTools) root.BenchTools.init({ reference: referenceHTML });
    if (root.VirtualLab) {
      root.VirtualLab.masthead(el("masthead"));
      root.VirtualLab.applyMeta(function (changed) {
        if (!changed) return;
        var E = root.EXPERIMENT;
        ["title", "programme", "course", "subject"].forEach(function (k) { if (E[k]) spec[k] = E[k]; });
        if (E.number != null) spec.number = E.number;
        root.VirtualLab.masthead(el("masthead"));
        render();
      });
    }
    document.title = spec.title + " — " + (CFG.SITE_TITLE || "Virtual Laboratory");
    bind();
    render();
  }

  root.LabEngine = {
    start: start,
    get spec() { return spec; },
    get state() { return S; },
    blocks: blocks,
    summary: summary
  };

})(window);
