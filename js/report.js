/* ============================================================
   report.js — assembles the student record, exports it and
   posts it to the department's Google Sheet.
   ============================================================ */

(function (root) {
  "use strict";

  var P = root.AlOPhysics;
  var CFG = root.LAB_CONFIG || {};

  function fmt(x, n) { return isFinite(x) ? Number(x).toFixed(n === undefined ? 3 : n) : "—"; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }
  function nl2p(s) {
    s = String(s || "").trim();
    if (!s) return '<p style="color:#7c8b90">— not answered —</p>';
    return s.split(/\n{2,}/).map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
  }

  function tableHTML(caption, head, rows) {
    return '<div class="tablewrap"><table><caption>' + caption + '</caption><thead><tr>' +
      head.map(function (h) { return '<th class="num">' + h + '</th>'; }).join("") +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return "<tr>" + r.map(function (c) { return '<td class="num">' + c + "</td>"; }).join("") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  function deslandreHTML(entries, valueOf, caption, dp) {
    var vus = [], vls = [];
    entries.forEach(function (b) {
      if (vus.indexOf(b.vu) < 0) vus.push(b.vu);
      if (vls.indexOf(b.vl) < 0) vls.push(b.vl);
    });
    vus.sort(function (a, b) { return a - b; }); vls.sort(function (a, b) { return a - b; });
    var head = '<tr><th>v′ \\ v″</th>' + vls.map(function (v) { return '<th class="num">' + v + "</th>"; }).join("") + "</tr>";
    var body = vus.map(function (vu) {
      return '<tr><th class="num">' + vu + "</th>" + vls.map(function (vl) {
        var hit = entries.filter(function (b) { return b.vu === vu && b.vl === vl; })[0];
        return hit ? '<td class="num' + (vu === vl ? " diag" : "") + '">' + fmt(valueOf(hit), dp) + "</td>" : '<td class="empty"></td>';
      }).join("") + "</tr>";
    }).join("");
    return '<div class="tablewrap"><table class="des"><caption>' + caption + "</caption><thead>" + head + "</thead><tbody>" + body + "</tbody></table></div>";
  }

  function stateHTML(st, pr, litWe, litWexe) {
    if (!st || !st.first.length) return "";
    var first = tableHTML("First differences ΔG" + pr + "(v + ½)",
      ["Interval", "Individual values (cm⁻¹)", "Mean (cm⁻¹)"],
      st.first.map(function (f) {
        return ["ΔG" + pr + "(" + f.v + " + ½)",
          f.terms.map(function (t) { return fmt(t.value, 1); }).join(", "),
          fmt(f.value, 1)];
      }));
    var second = tableHTML("Second differences Δ²G" + pr,
      ["Difference", "Value (cm⁻¹)"],
      st.second.map(function (s) {
        return ["ΔG" + pr + "(" + s.from + " + ½) − ΔG" + pr + "(" + s.to + " + ½)", fmt(s.value, 2)];
      }).concat([["Mean = 2ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr, fmt(st.twoWexe, 2)]]));
    var calc = '<p class="formula">ω<sub>e</sub>' + pr + "x<sub>e</sub>" + pr + " = " + fmt(st.wexe, 2) + " cm⁻¹" +
      "  ω<sub>e</sub>" + pr + " = ΔG" + pr + "(½) + 2ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr + " = " +
      fmt(st.first[0].value, 1) + " + " + fmt(st.twoWexe, 2) + " = " + fmt(st.we, 1) + " cm⁻¹" +
      "  x<sub>e</sub>" + pr + " = " + fmt(st.xe, 5) + "</p>";
    var bs = st.birgeSponer ? '<p>Birge–Sponer straight line: intercept ω<sub>e</sub>' + pr + " = " + fmt(st.birgeSponer.we, 1) +
      " cm⁻¹, slope −2ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr + " gives ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr +
      " = " + fmt(st.birgeSponer.wexe, 2) + " cm⁻¹ (r² = " + fmt(st.birgeSponer.r2, 4) + ").</p>" : "";
    return first + second + calc + bs;
  }

  function build() {
    var L = root.LabState;
    var S = L.state, a = L.analysis(), bands = L.bandEntries(), hg = L.hgEntries();
    var G = L.graphs;
    var st = S.student;

    var html = "";
    html += '<h1 style="margin-bottom:2px">Vibrational constants of AlO from its electronic band spectrum</h1>';
    html += '<p style="color:#4d5f66;margin-bottom:18px">' + esc(CFG.COURSE || "General Physics Laboratory V") + " — " + esc(CFG.DEPARTMENT || "Department of Physics and Electronics") + "</p>";
    html += '<dl class="kv" style="margin-bottom:20px">' +
      "<dt>Name</dt><dd>" + esc(st.name) + "</dd>" +
      "<dt>Register number</dt><dd>" + esc(st.register) + "</dd>" +
      "<dt>Batch</dt><dd>" + esc(st.batch) + "</dd>" +
      (st.partner ? "<dt>Partner</dt><dd>" + esc(st.partner) + "</dd>" : "") +
      "<dt>Date</dt><dd>" + esc(st.date) + "</dd>" +
      "<dt>Least count of the comparator</dt><dd>" + fmt(P.PLATE.leastCount) + " cm</dd>" +
      "</dl>";

    html += "<h2>Aim</h2><p>To determine the vibrational constants of the aluminium oxide molecule for the upper and lower electronic states from the band heads of its visible band system.</p>";

    html += "<h2>Observations</h2>";
    html += tableHTML("Table 1 — mercury calibration lines",
      ["Line", "λ (Å)", "M.S.R. (cm)", "V.S.D.", "d (cm)"],
      hg.filter(function (h) { return isFinite(h.d); }).map(function (h) {
        var v = P.vernier(h.d);
        return ["Hg " + esc(h.name), fmt(h.lambda, 2), fmt(v.msr, 2), v.vsd, fmt(h.d, 3)];
      }));

    if (S.hart) {
      html += '<p class="formula">λ = λ<sub>0</sub> + C ⁄ (d − d<sub>0</sub>): λ<sub>0</sub> = ' + fmt(S.hart.lam0, 2) +
        " Å, C = " + fmt(S.hart.C, 1) + " Å·cm, d<sub>0</sub> = " + fmt(S.hart.d0, 4) + " cm</p>";
      var res = hg.filter(function (h) { return isFinite(h.d); }).map(function (h) {
        var lam = P.lambdaFromHartmann(S.hart, h.d);
        return ["Hg " + esc(h.name), fmt(h.d, 3), fmt(lam, 2), fmt(h.lambda, 2), fmt(lam - h.lambda, 2)];
      });
      html += tableHTML("Table 2 — check of the calibration", ["Line", "d (cm)", "λ calculated (Å)", "λ standard (Å)", "difference (Å)"], res);
    }

    html += tableHTML("Table 3 — AlO band heads",
      ["Band (v′, v″)", "Δv", "d (cm)", "λ (Å)", "ν̃ (cm⁻¹)"],
      bands.map(function (b) {
        return ["(" + b.vu + ", " + b.vl + ")", (b.vu - b.vl > 0 ? "+" : "") + (b.vu - b.vl), fmt(b.d, 3), fmt(b.lambda, 2), fmt(b.nu, 1)];
      }));

    if (bands.length) {
      html += "<h2>Deslandre tables</h2>";
      html += deslandreHTML(bands, function (b) { return b.lambda; }, "Table 4 — band heads in Å", 1);
      html += deslandreHTML(bands, function (b) { return b.nu; }, "Table 5 — band heads in cm⁻¹", 1);
    }

    if (a) {
      html += "<h2>Upper electronic state B²Σ⁺</h2>" + stateHTML(a.upper, "′");
      html += "<h2>Lower electronic state X²Σ⁺</h2>" + stateHTML(a.lower, "″");
    }

    if (G && (G.spectrum || G.bsUpper)) {
      html += "<h2>Graphs</h2>";
      if (G.spectrum) html += '<div class="chartbox">' + G.spectrum + "</div>";
      if (G.calibration) html += '<div class="chartbox" style="margin-top:12px">' + G.calibration + "</div>";
      if (G.bsUpper) html += '<div class="chartbox" style="margin-top:12px">' + G.bsUpper + "</div>";
      if (G.bsLower) html += '<div class="chartbox" style="margin-top:12px">' + G.bsLower + "</div>";
    }

    if (a) {
      html += "<h2>Result</h2>" + L.resultTable(a);
      html += "<p>The vibrational quantum of the excited state is smaller and its anharmonicity larger, which is what one expects: the bond is weaker and the potential well shallower once the molecule is electronically excited.</p>";
    }

    if (S.answers.errors) html += "<h2>Sources of error</h2>" + nl2p(S.answers.errors);

    html += "<h2>Questions</h2>";
    L.questions.forEach(function (q, i) {
      html += "<h3>" + (i + 1) + ". " + esc(q.q) + "</h3>" + nl2p(S.answers[q.k]);
    });

    return html;
  }

  function render(host) {
    if (!host) return;
    host.innerHTML = build();
  }

  /* ---------- exports ---------- */

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    downloadURL(name, URL.createObjectURL(blob), true);
  }
  function downloadDataURL(name, url) { downloadURL(name, url, false); }
  function downloadURL(name, url, revoke) {
    var a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    if (revoke) setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  var PRINT_CSS = "body{font-family:Georgia,'Times New Roman',serif;color:#14212a;max-width:900px;margin:32px auto;padding:0 20px;line-height:1.5}" +
    "h1{font-size:1.5rem}h2{font-size:1.15rem;border-bottom:1px solid #c2ccc4;padding-bottom:4px;margin-top:26px}h3{font-size:1rem}" +
    "table{border-collapse:collapse;width:100%;font-size:.8rem;font-family:Arial,sans-serif}" +
    "th,td{border:1px solid #c2ccc4;padding:4px 7px;text-align:right}th:first-child,td:first-child{text-align:left}" +
    "caption{caption-side:top;text-align:left;font-weight:600;padding-bottom:5px}" +
    ".tablewrap{overflow-x:auto;margin-bottom:14px}.des td.diag{background:#eef6f3}.des td.empty{background:#f4f6f3}" +
    ".kv{display:grid;grid-template-columns:max-content 1fr;gap:2px 14px}.kv dt{color:#4d5f66}.kv dd{margin:0;font-family:monospace}" +
    ".formula{background:#f5f7f3;border:1px solid #d9e0d9;padding:7px 10px;margin:0 0 10px}" +
    ".chartbox{border:1px solid #c2ccc4;padding:6px;margin-bottom:12px}.chartbox svg{width:100%;height:auto;display:block}" +
    "@media print{.tablewrap,.chartbox{page-break-inside:avoid}h2{page-break-after:avoid}}";

  function downloadHTML() {
    var S = root.LabState.state;
    var doc = "<!doctype html><html><head><meta charset='utf-8'><title>AlO band spectrum — " +
      esc(S.student.name || "report") + "</title><style>" + PRINT_CSS + "</style></head><body>" +
      build() + "</body></html>";
    download("alo-report-" + (S.student.register || "record") + ".html", doc, "text/html;charset=utf-8");
  }

  function downloadCSV() {
    var L = root.LabState, S = L.state, a = L.analysis();
    var rows = [];
    function push() { rows.push(Array.prototype.slice.call(arguments).join(",")); }
    push("AlO band spectrum — student record");
    push("name", '"' + (S.student.name || "") + '"');
    push("register", '"' + (S.student.register || "") + '"');
    push("batch", '"' + (S.student.batch || "") + '"');
    push("date", S.student.date);
    push("least count (cm)", P.PLATE.leastCount);
    push("");
    push("mercury line (A)", "comparator reading (cm)");
    L.hgEntries().forEach(function (h) { if (isFinite(h.d)) push(h.lambda, h.d); });
    push("");
    if (S.hart) { push("lambda0 (A)", fmt(S.hart.lam0, 3)); push("C (A cm)", fmt(S.hart.C, 3)); push("d0 (cm)", fmt(S.hart.d0, 4)); push(""); }
    push("v'", 'v"', "d (cm)", "lambda (A)", "nu (cm-1)");
    L.bandEntries().forEach(function (b) { push(b.vu, b.vl, fmt(b.d, 3), fmt(b.lambda, 2), fmt(b.nu, 2)); });
    push("");
    if (a) {
      push("state", "DeltaG(1/2)", "2wexe", "we", "xe");
      push("upper B2Sigma+", fmt(a.upper.first[0] && a.upper.first[0].value, 2), fmt(a.upper.twoWexe, 3), fmt(a.upper.we, 2), fmt(a.upper.xe, 6));
      push("lower X2Sigma+", fmt(a.lower.first[0] && a.lower.first[0].value, 2), fmt(a.lower.twoWexe, 3), fmt(a.lower.we, 2), fmt(a.lower.xe, 6));
    }
    download("alo-readings-" + (S.student.register || "record") + ".csv", rows.join("\n"), "text/csv;charset=utf-8");
  }

  /* ---------- submission ---------- */

  function payload() {
    var L = root.LabState, S = L.state, a = L.analysis();
    return {
      kind: "alo-band-spectrum",
      submittedAt: new Date().toISOString(),
      student: S.student,
      leastCount: P.PLATE.leastCount,
      hartmann: S.hart,
      mercury: L.hgEntries().filter(function (h) { return isFinite(h.d); }).map(function (h) { return { lambda: h.lambda, d: h.d }; }),
      bands: L.bandEntries().map(function (b) { return { vu: b.vu, vl: b.vl, d: b.d, lambda: +fmt(b.lambda, 2), nu: +fmt(b.nu, 2) }; }),
      results: a ? {
        upper: { we: +fmt(a.upper.we, 2), wexe: +fmt(a.upper.wexe, 3), xe: +fmt(a.upper.xe, 6), firstDiff: a.upper.first.map(function (f) { return +fmt(f.value, 2); }) },
        lower: { we: +fmt(a.lower.we, 2), wexe: +fmt(a.lower.wexe, 3), xe: +fmt(a.lower.xe, 6), firstDiff: a.lower.first.map(function (f) { return +fmt(f.value, 2); }) }
      } : null,
      answers: S.answers
    };
  }

  function submit(msgEl) {
    var url = CFG.APPS_SCRIPT_URL;
    if (!url) { if (msgEl) msgEl.textContent = "No submission address is configured."; return; }
    var S = root.LabState.state;
    if (!S.student.name || !S.student.register) {
      if (msgEl) msgEl.textContent = "Add your name and register number before submitting.";
      return;
    }
    if (msgEl) msgEl.textContent = "Sending…";
    fetch(url, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload())
    }).then(function () {
      if (msgEl) msgEl.textContent = "Sent at " + new Date().toLocaleTimeString() + ". Keep a downloaded copy as well.";
    }).catch(function () {
      if (msgEl) msgEl.textContent = "Could not reach the submission address. Download the report and send it to your instructor.";
    });
  }

  root.Report = {
    render: render, build: build, download: download, downloadDataURL: downloadDataURL,
    downloadHTML: downloadHTML, downloadCSV: downloadCSV, submit: submit, payload: payload
  };

})(window);
