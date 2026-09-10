/* ============================================================
   report.js — describes the student's record once, as blocks.
   The shared ReportDoc turns that same list into the preview on
   screen, the PDF they download, and the document the
   department's sheet builds.
   ============================================================ */

(function (root) {
  "use strict";

  var P = root.AlOPhysics;
  var CFG = root.VLAB_CONFIG || {};
  var EXP = root.EXPERIMENT || {};

  function fmt(x, n) { return isFinite(x) ? Number(x).toFixed(n === undefined ? 3 : n) : "—"; }
  function num(x, n) { return isFinite(x) ? Number(Number(x).toFixed(n)) : ""; }

  /* ---------- the record, as blocks ---------- */

  /* a canvas turned into something both the preview and the PDF can show */
  function plateFigure(source, caption) {
    var L = root.LabState;
    if (!L.plateImage) return null;
    var cv = null;
    try { cv = L.plateImage(source); } catch (e) { cv = null; }
    if (!cv) return null;
    var img = root.ReportDoc.canvasToJpeg(cv, 0.82);
    return {
      type: "image", dataUrl: img.dataUrl, w: img.w, h: img.h,
      caption: caption, key: "plate-" + source
    };
  }

  function blocks(opts) {
    opts = opts || {};
    var L = root.LabState;
    var S = L.state, a = L.analysis(), bands = L.bandEntries(), hg = L.hgEntries();
    var H = L.studentHartmann(), R = L.workResults(), W = L.work();
    var st = S.student;
    var b = [];

    b.push({ type: "title", text: "Vibrational constants of AlO from its electronic band spectrum" });
    b.push({
      type: "paragraph",
      text: [EXP.course, EXP.number ? "experiment " + EXP.number : ""].filter(Boolean).join(", ") +
        " — " + [CFG.DEPARTMENT, CFG.INSTITUTION].filter(Boolean).join(", ")
    });
    b.push({
      type: "meta", pairs: [
        ["Name", st.name || "—"],
        ["Register number", st.register || "—"],
        ["Batch", st.batch || "—"]
      ].concat(st.partner ? [["Partner", st.partner]] : [])
        .concat([["Date", st.date || "—"], ["Least count of the comparator", fmt(P.PLATE.leastCount) + " cm"]])
    });

    b.push({ type: "heading", text: "Aim" });
    b.push({
      type: "paragraph",
      text: "To determine the vibrational constants of the aluminium oxide molecule for the upper (B²Σ⁺) and lower (X²Σ⁺) electronic states from the band heads of its visible band system."
    });

    b.push({ type: "heading", text: "Observations" });

    if (opts.graphs !== false) {
      var hgPlate = plateFigure("hg", "The mercury comparison spectrum, with the lines measured marked and labelled by wavelength in Å.");
      if (hgPlate) b.push(hgPlate);
    }

    b.push({
      type: "table", caption: "Table 1 — comparator readings of the mercury standard lines",
      rows: [["Line", "λ (Å)", "M.S.R. (cm)", "V.S.D.", "d (cm)"]].concat(
        hg.filter(function (h) { return isFinite(h.d); }).map(function (h) {
          var v = P.vernier(h.d);
          return ["Hg " + h.name, fmt(h.lambda, 2), fmt(v.msr, 2), String(v.vsd), fmt(h.d, 3)];
        }))
    });

    if (H) {
      b.push({ type: "formula", text: "λ = λ₀ + C ⁄ (d − d₀)" });
      b.push({
        type: "paragraph",
        text: "Constants worked out from three mercury lines: λ₀ = " + fmt(H.lam0, 2) + " Å,  C = " + fmt(H.C, 1) +
          " Å·cm,  d₀ = " + fmt(H.d0, 4) + " cm"
      });
      if (W.notes.hart) b.push({ type: "paragraph", text: "Working: " + W.notes.hart });
      b.push({
        type: "table", caption: "Table 2 — the same constants applied to every mercury line measured",
        rows: [["Line", "d (cm)", "λ calculated (Å)", "λ standard (Å)", "difference (Å)"]].concat(
          hg.filter(function (h) { return isFinite(h.d); }).map(function (h) {
            var lam = P.lambdaFromHartmann(H, h.d);
            return ["Hg " + h.name, fmt(h.d, 3), fmt(lam, 2), fmt(h.lambda, 2), fmt(lam - h.lambda, 2)];
          }))
      });
    }

    if (opts.graphs !== false) {
      var aloPlate = plateFigure("alo", "The AlO band system as recorded on the plate. Each mark is a band head measured with the comparator; the five groups are the sequences Δv = +2 to −2, every band shaded away to the red.");
      if (aloPlate) b.push(aloPlate);
    }

    b.push({
      type: "table", caption: "Table 3 — AlO band heads",
      rows: [["Band (v′, v″)", "Δv", "d (cm)", "λ (Å)", "ν̃ (cm⁻¹)"]].concat(
        bands.map(function (x) {
          var dv = x.vu - x.vl;
          return ["(" + x.vu + ", " + x.vl + ")", (dv > 0 ? "+" : "") + dv,
            fmt(x.d, 3), fmt(x.lambda, 2), fmt(x.nu, 1)];
        }))
    });

    if (bands.length) {
      b.push({ type: "heading", text: "Deslandre tables" });
      b.push(deslandre(bands, function (x) { return x.lambda; }, "Table 4 — band heads in Å", 1));
      b.push(deslandre(bands, function (x) { return x.nu; }, "Table 5 — band heads in cm⁻¹", 1));
    }

    if (a) {
      b.push({ type: "heading", text: "Upper electronic state B²Σ⁺" });
      pushState(b, a.upper, W.up, W.notes.up, "′");
      b.push({ type: "heading", text: "Lower electronic state X²Σ⁺" });
      pushState(b, a.lower, W.lo, W.notes.lo, "″");
    }

    if (opts.graphs !== false) {
      var G = L.graphs;
      var figures = [
        [G.spectrum, "The densitometer trace of the same plate, now on a wavelength scale from your own calibration, with the assignment of each head."],
        [G.calibration, "Hartmann dispersion curve through the mercury lines."],
        [G.bsUpper, "Birge–Sponer plot for the upper state."],
        [G.bsLower, "Birge–Sponer plot for the lower state."]
      ].filter(function (f) { return f[0]; });
      if (figures.length) {
        b.push({ type: "heading", text: "Graphs" });
        figures.forEach(function (f, i) {
          b.push({ type: "image", svg: f[0], caption: f[1], key: "fig" + i });
        });
      }
    }

    if (isFinite(R.upper.we) || isFinite(R.lower.we)) {
      b.push({ type: "heading", text: "Result" });
      b.push({
        type: "table", caption: "Table 6 — vibrational constants of AlO",
        rows: [["Quantity", "My value", "Literature", "Difference (%)"],
          resultRow("ωe′ (cm⁻¹), upper state B²Σ⁺", R.upper.we, P.LIT.we_u, 1),
          resultRow("ωe′xe′ (cm⁻¹)", R.upper.wexe, P.LIT.wexe_u, 2),
          resultRow("xe′", R.upper.xe, P.LIT.xe_u, 5),
          resultRow("ωe″ (cm⁻¹), lower state X²Σ⁺", R.lower.we, P.LIT.we_l, 1),
          resultRow("ωe″xe″ (cm⁻¹)", R.lower.wexe, P.LIT.wexe_l, 2),
          resultRow("xe″", R.lower.xe, P.LIT.xe_l, 5)]
      });
      b.push({
        type: "paragraph",
        text: "The vibrational quantum of the excited state is smaller and its anharmonicity larger, which is what one expects: the bond is weaker and the potential well shallower once the molecule is electronically excited."
      });
    }

    if (S.answers.errors) {
      b.push({ type: "heading", text: "Sources of error" });
      b.push({ type: "paragraph", text: S.answers.errors });
    }

    b.push({ type: "heading", text: "Questions" });
    L.questions.forEach(function (q, i) {
      b.push({ type: "heading", level: 3, text: (i + 1) + ". " + q.q });
      b.push({ type: "paragraph", text: S.answers[q.k] || "— not answered —" });
    });

    return b;
  }

  function resultRow(label, got, lit, dp) {
    var err = isFinite(got) && lit ? Math.abs(got - lit) / lit * 100 : NaN;
    return [label, fmt(got, dp), fmt(lit, dp), fmt(err, 1)];
  }

  function deslandre(entries, valueOf, caption, dp) {
    var vus = [], vls = [];
    entries.forEach(function (x) {
      if (vus.indexOf(x.vu) < 0) vus.push(x.vu);
      if (vls.indexOf(x.vl) < 0) vls.push(x.vl);
    });
    vus.sort(function (a, b) { return a - b; });
    vls.sort(function (a, b) { return a - b; });
    var rows = [["v′ \\ v″"].concat(vls.map(String))];
    vus.forEach(function (vu) {
      rows.push([String(vu)].concat(vls.map(function (vl) {
        var hit = entries.filter(function (x) { return x.vu === vu && x.vl === vl; })[0];
        return hit ? fmt(valueOf(hit), dp) : "—";
      })));
    });
    return { type: "table", caption: caption, rows: rows };
  }

  function pushState(b, st, w, note, pr) {
    if (!st || !st.first.length) return;
    b.push({
      type: "table", caption: "First differences ΔG" + pr + "(v + ½), cm⁻¹",
      rows: [["Interval", "Value taken"]].concat(
        st.first.slice(0, 3).map(function (f, i) {
          return ["ΔG" + pr + "(" + f.v + " + ½)", w.dg[i] === "" || w.dg[i] === undefined ? "—" : String(w.dg[i])];
        }))
    });
    b.push({
      type: "table", caption: "Second difference and the constants",
      rows: [
        ["Quantity", "Value"],
        ["Δ²G" + pr + " = ΔG" + pr + "(½) − ΔG" + pr + "(3/2)", String(w.d2 || "—")],
        ["ωe" + pr + "xe" + pr + " (cm⁻¹)", String(w.wexe || "—")],
        ["ωe" + pr + " (cm⁻¹)", String(w.we || "—")],
        ["xe" + pr, String(w.xe || "—")]
      ]
    });
    if (note) b.push({ type: "paragraph", text: "Working: " + note });
  }

  /* ---------- outputs ---------- */

  function render(host) {
    if (host) host.innerHTML = root.ReportDoc.html(blocks());
  }

  function downloadPDF(msgEl) {
    var S = root.LabState.state;
    if (msgEl) msgEl.textContent = "Building the PDF…";
    return root.ReportDoc.download(blocks(), {
      title: "AlO band spectrum — " + (S.student.name || "record"),
      author: S.student.name || "",
      subject: EXP.course || "",
      header: (EXP.title || "") + (EXP.number ? "  ·  experiment " + EXP.number : ""),
      footer: [S.student.name, S.student.register].filter(Boolean).join("  ·  ")
    }, "alo-band-spectrum-" + (S.student.register || "record") + ".pdf")
      .then(function () { if (msgEl) msgEl.textContent = "PDF downloaded."; return true; })
      .catch(function (e) {
        if (msgEl) msgEl.textContent = "The PDF could not be built. Try again, or use the print button.";
        if (root.console) console.error(e);
        return false;
      });
  }

  /* ---------- submission ---------- */

  function summary() {
    var L = root.LabState, S = L.state, R = L.workResults();
    var h = L.studentHartmann() || {};
    var out = {
      "Bands measured": L.bandEntries().length,
      "Hg lines": L.hgEntries().filter(function (x) { return isFinite(x.d); }).length,
      "lambda0 (A)": num(h.lam0, 2),
      "C (A cm)": num(h.C, 1),
      "d0 (cm)": num(h.d0, 4)
    };
    out["we' (cm-1)"] = num(R.upper.we, 2);
    out["wexe' (cm-1)"] = num(R.upper.wexe, 3);
    out["xe'"] = num(R.upper.xe, 6);
    out['we" (cm-1)'] = num(R.lower.we, 2);
    out['wexe" (cm-1)'] = num(R.lower.wexe, 3);
    out['xe"'] = num(R.lower.xe, 6);
    if (isFinite(R.upper.we)) out["err we' (%)"] = num(Math.abs(R.upper.we - P.LIT.we_u) / P.LIT.we_u * 100, 2);
    if (isFinite(R.lower.we)) out['err we" (%)'] = num(Math.abs(R.lower.we - P.LIT.we_l) / P.LIT.we_l * 100, 2);
    return out;
  }

  /* Submitting finishes the experiment. The record goes off, the PDF is
     put in the student's hands first, and the working is cleared so the
     next person at this machine starts from a blank plate. Nothing is
     cleared until the send has actually gone through. */
  function submit(msgEl) {
    if (!root.VirtualLab) { if (msgEl) msgEl.textContent = "Submission library not loaded."; return; }
    var L = root.LabState, S = L.state;
    if (!S.student.name || !S.student.register) {
      if (msgEl) msgEl.textContent = "Add your name and register number before submitting.";
      return;
    }
    var ok = root.confirm(
      "Submit this record?\n\n" +
      "You can submit once. Your PDF will be downloaded first, and your readings will then be " +
      "cleared from this browser, so check the report below before you go ahead."
    );
    if (!ok) return;

    if (msgEl) msgEl.textContent = "Building your PDF…";
    downloadPDF(msgEl).then(function (built) {
      if (!built) {
        if (msgEl) msgEl.textContent =
          "Nothing was sent: your PDF could not be built, and submitting would have cleared your work without a copy in your hands. Try the print button, then submit.";
        return false;
      }
      if (msgEl) msgEl.textContent = "Sending…";
      return sendRecord(msgEl);
    });
  }

  function sendRecord(msgEl) {
    var L = root.LabState, S = L.state;
    return root.VirtualLab.submit({
      student: S.student,
      summary: summary(),
      data: {
        leastCount: P.PLATE.leastCount,
        hartmann: L.studentHartmann(),
        working: L.work(),
        mercury: L.hgEntries().filter(function (h) { return isFinite(h.d); })
          .map(function (h) { return { lambda: h.lambda, d: h.d }; }),
        bands: L.bandEntries().map(function (x) {
          return { vu: x.vu, vl: x.vl, d: x.d, lambda: num(x.lambda, 2), nu: num(x.nu, 2) };
        }),
        answers: S.answers
      },
      report: root.ReportDoc.forBackend(blocks({ graphs: false }))
    }, msgEl).then(function (sent) {
      if (!sent) return false;
      root.VirtualLab.markSubmitted(EXP.id, S.student.register);
      L.finish();
      return true;
    });
  }

  root.Report = {
    blocks: blocks,
    render: render,
    downloadPDF: downloadPDF,
    submit: submit,
    summary: summary
  };

})(window);
