/* ============================================================
   app.js — a small but complete experiment, kept deliberately
   plain. Copy this folder, rename it, and replace the physics.

   It shows the four things every experiment on this site needs:
     1. a step list rendered into #rail and #steps
     2. state saved in the browser under the register number
     3. a result worked out from what the student recorded
     4. a report that can be printed, downloaded or submitted
        through VirtualLab.submit
   ============================================================ */

(function (root) {
  "use strict";

  var CFG = root.VLAB_CONFIG || {};
  var EXP = root.EXPERIMENT || {};

  /* ---------- state ---------- */

  var S = {
    student: { name: "", register: "", batch: "", date: new Date().toISOString().slice(0, 10) },
    readings: [],            // {trial, x, y}
    notes: ""
  };
  var step = 0;

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function fmt(x, n) { return isFinite(x) ? Number(x).toFixed(n === undefined ? 3 : n) : "—"; }

  function save() {
    try { localStorage.setItem("vlab." + EXP.id + "." + (S.student.register || "unsaved"), JSON.stringify(S)); } catch (e) {}
  }
  function load(reg) {
    try {
      var raw = localStorage.getItem("vlab." + EXP.id + "." + reg);
      if (raw) { Object.assign(S, JSON.parse(raw)); return true; }
    } catch (e) {}
    return false;
  }

  /* ---------- the physics: replace this ---------- */

  function analyse() {
    var pts = S.readings.filter(function (r) { return isFinite(r.x) && isFinite(r.y); });
    if (pts.length < 2) return null;
    var n = pts.length, sx = 0, sy = 0, sxx = 0, sxy = 0;
    pts.forEach(function (p) { sx += p.x; sy += p.y; sxx += p.x * p.x; sxy += p.x * p.y; });
    var m = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return { slope: m, intercept: (sy - m * sx) / n, n: n };
  }

  /* ---------- steps ---------- */

  var STEPS = [
    { id: "aim", group: "Prepare", title: "Aim and theory", render: stepAim },
    { id: "obs", group: "Measure", title: "Observations", render: stepObs },
    { id: "result", group: "Report", title: "Result and report", render: stepResult }
  ];

  function stepAim() {
    return "<h2>Aim</h2><p>State what is being measured and how.</p>" +
      '<div class="card"><h3>Theory</h3>' +
      '<p class="formula">y = m x + c</p>' +
      "<p>Set out the working the student is expected to follow, then send them on to the apparatus.</p></div>" +
      '<div class="card"><h3>Student</h3>' +
      field("Name", "name") + field("Register number", "register") + field("Batch", "batch") +
      '<button class="primary" data-action="startWork">Start</button></div>' + nav();
  }

  function field(label, key) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input data-student="' + key + '" value="' + esc(S.student[key]) + '"></label>';
  }

  function stepObs() {
    var rows = S.readings.map(function (r, i) {
      return "<tr><td>" + (i + 1) + "</td>" +
        '<td class="num"><input data-reading="x" data-i="' + i + '" value="' + esc(r.x) + '" style="width:8em"></td>' +
        '<td class="num"><input data-reading="y" data-i="' + i + '" value="' + esc(r.y) + '" style="width:8em"></td>' +
        '<td><button class="link" data-action="drop" data-i="' + i + '">remove</button></td></tr>';
    }).join("");
    return "<h2>Observations</h2>" +
      "<p>Drive the apparatus above and record each reading. Replace this table with whatever the experiment actually measures.</p>" +
      '<div class="tablewrap"><table><caption>Table 1 — readings</caption>' +
      '<thead><tr><th>No.</th><th class="num">x</th><th class="num">y</th><th></th></tr></thead>' +
      "<tbody>" + (rows || '<tr class="pending"><td colspan="4">No readings yet.</td></tr>') + "</tbody></table></div>" +
      '<button class="ghost" data-action="add">Add a reading</button>' + nav();
  }

  function stepResult() {
    var a = analyse();
    var body = a
      ? '<div class="result-strip">' +
      '<div><div class="v">' + fmt(a.slope, 4) + '</div><div class="l">slope</div></div>' +
      '<div><div class="v">' + fmt(a.intercept, 4) + '</div><div class="l">intercept</div></div>' +
      '<div><div class="v">' + a.n + '</div><div class="l">readings used</div></div></div>'
      : '<div class="note warn">Record at least two readings.</div>';
    return "<h2>Result</h2>" + body +
      '<div class="card"><label class="field"><span>Remarks and sources of error</span>' +
      '<textarea data-notes>' + esc(S.notes) + "</textarea></label></div>" +
      '<div class="recordbar noprint">' +
      '<button class="primary" data-action="print">Print or save as PDF</button>' +
      '<button class="ghost" data-action="csv">Download readings (CSV)</button>' +
      (root.VirtualLab.configured()
        ? '<button class="primary" data-action="submit">Submit</button>'
        : '<span class="progress">Online submission is not configured for this site.</span>') +
      '<span class="progress" id="submitMsg"></span></div>' + nav();
  }

  function nav() {
    var prev = STEPS[step - 1], next = STEPS[step + 1];
    return '<div class="steps-nav noprint">' +
      (prev ? '<button class="ghost" data-action="go" data-i="' + (step - 1) + '">← ' + esc(prev.title) + "</button>" : "<span></span>") +
      (next ? '<button class="primary" data-action="go" data-i="' + (step + 1) + '">' + esc(next.title) + " →</button>" : "<span></span>") +
      "</div>";
  }

  /* ---------- submission ---------- */

  function submit() {
    var a = analyse();
    root.VirtualLab.submit({
      student: S.student,
      summary: a ? { "slope": +a.slope.toFixed(4), "intercept": +a.intercept.toFixed(4), "readings": a.n } : { "readings": 0 },
      data: { readings: S.readings, notes: S.notes },
      report: [
        { type: "heading", text: "Observations" },
        { type: "table", caption: "Readings", rows: [["x", "y"]].concat(S.readings.map(function (r) { return [String(r.x), String(r.y)]; })) },
        { type: "heading", text: "Result" },
        { type: "paragraph", text: a ? "slope = " + fmt(a.slope, 4) + ", intercept = " + fmt(a.intercept, 4) : "Not enough readings." },
        { type: "heading", text: "Remarks" },
        { type: "paragraph", text: S.notes || "—" }
      ]
    }, el("submitMsg"));
  }

  function csv() {
    var text = "x,y\n" + S.readings.map(function (r) { return r.x + "," + r.y; }).join("\n");
    var url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    var a = document.createElement("a");
    a.href = url; a.download = EXP.id + "-" + (S.student.register || "record") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- plumbing ---------- */

  function render() {
    el("steps").innerHTML = STEPS[step].render();
    var groups = [], seen = {};
    STEPS.forEach(function (s) { if (!seen[s.group]) { seen[s.group] = 1; groups.push(s.group); } });
    el("rail").innerHTML = groups.map(function (g) {
      return '<div class="group">' + esc(g) + "</div>" + STEPS.map(function (s, i) {
        return s.group !== g ? "" : '<button data-action="go" data-i="' + i + '"' +
          (i === step ? ' aria-current="true"' : "") + '><span class="n">' + (i + 1) + "</span>" + esc(s.title) + "</button>";
      }).join("");
    }).join("");
    var who = el("whoami");
    if (who) who.textContent = S.student.register ? S.student.name + "  ·  " + S.student.register : "";
    save();
  }

  document.addEventListener("click", function (ev) {
    var t = ev.target.closest("[data-action]");
    if (!t) return;
    var a = t.dataset.action;
    if (a === "go") { step = +t.dataset.i; render(); }
    else if (a === "startWork") { step = 1; render(); }
    else if (a === "add") { S.readings.push({ x: "", y: "" }); render(); }
    else if (a === "drop") { S.readings.splice(+t.dataset.i, 1); render(); }
    else if (a === "print") { root.print(); }
    else if (a === "csv") { csv(); }
    else if (a === "submit") { submit(); }
  });

  document.addEventListener("input", function (ev) {
    var t = ev.target;
    if (t.dataset.student) { S.student[t.dataset.student] = t.value; save(); }
    else if (t.dataset.reading) { S.readings[+t.dataset.i][t.dataset.reading] = parseFloat(t.value); save(); }
    else if (t.hasAttribute("data-notes")) { S.notes = t.value; save(); }
  });

  root.addEventListener("DOMContentLoaded", function () {
    root.VirtualLab.masthead(el("masthead"));
    var last = null;
    try { last = localStorage.getItem("vlab.last." + EXP.id); } catch (e) {}
    if (last) load(last);
    render();
  });

})(window);
