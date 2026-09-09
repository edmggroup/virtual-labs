/* ============================================================
   app.js — experiment flow, state and all step screens.
   ============================================================ */

(function (root) {
  "use strict";

  var P = root.AlOPhysics;
  var CFG = root.LAB_CONFIG || {};

  /* ---------- state ---------- */

  var S = {
    version: 1,
    student: { name: "", register: "", batch: "", partner: "", date: today() },
    hg: {},                 // index -> reading in cm
    pick: [],               // indices of the 3 Hg lines used for Hartmann
    hart: null,             // {lam0, C, d0}
    bands: {},              // "vu,vl" -> reading in cm
    answers: { q1: "", q2: "", q3: "", q4: "", errors: "" },
    started: new Date().toISOString()
  };

  var view = null, plate = null, step = 0, demo = false;

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
  }
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function fmt(x, n) { return isFinite(x) ? Number(x).toFixed(n === undefined ? 3 : n) : "—"; }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]; }); }

  /* required Deslandre block: v' 0–3 against v" 0–3 */
  function requiredBands() {
    return P.buildBands().filter(function (b) { return b.vu <= 3 && b.vl <= 3; });
  }
  function extraBands() {
    return P.buildBands().filter(function (b) { return b.vu > 3 || b.vl > 3; });
  }

  /* ---------- persistence ---------- */

  var mem = {};
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }
    catch (e) { if (v === undefined) return mem[k]; mem[k] = v; }
  }
  function saveKey() { return "aloLab.v1." + (S.student.register || "unsaved"); }
  function save() { store(saveKey(), JSON.stringify(S)); store("aloLab.last", S.student.register || ""); }
  function load(reg) {
    var raw = store("aloLab.v1." + reg);
    if (!raw) return false;
    try {
      var obj = JSON.parse(raw);
      Object.assign(S, obj);
      return true;
    } catch (e) { return false; }
  }

  /* ---------- derived quantities ---------- */

  function hgEntries() {
    return P.HG_LINES.map(function (l, i) {
      return { i: i, lambda: l.lambda, name: l.name, d: S.hg[i] };
    });
  }

  function bandEntries() {
    var out = [];
    Object.keys(S.bands).forEach(function (k) {
      var p = k.split(",");
      var d = S.bands[k];
      var lam = S.hart ? P.lambdaFromHartmann(S.hart, d) : NaN;
      out.push({
        vu: +p[0], vl: +p[1], key: k, d: d,
        lambda: lam, nu: isFinite(lam) ? P.lambdaToNu(lam) : NaN
      });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }

  function analysis() {
    var e = bandEntries().filter(function (b) { return isFinite(b.nu); });
    return e.length ? P.analyse(e) : null;
  }

  function progress() {
    var a = analysis();
    return {
      setup: !!(S.student.name && S.student.register),
      calib: hgEntries().filter(function (h) { return isFinite(h.d); }).length >= 3,
      hart: !!S.hart,
      bands: bandEntries().length >= 10,
      upper: !!(a && a.upper && isFinite(a.upper.we)),
      lower: !!(a && a.lower && isFinite(a.lower.we)),
      viva: !!(S.answers.q1 && S.answers.q2 && S.answers.q3 && S.answers.q4)
    };
  }

  /* ---------- steps ---------- */

  var STEPS = [
    { id: "aim", group: "Prepare", title: "Aim and theory", render: stepAim },
    { id: "atlas", group: "Prepare", title: "The AlO spectrum", render: stepAtlas },
    { id: "howto", group: "Prepare", title: "How to work through it", render: stepHowTo },
    { id: "setup", group: "Prepare", title: "Your plate", render: stepSetup, key: "setup" },
    { id: "calib", group: "Measure", title: "Mercury readings", render: stepCalib, viewer: "hg", key: "calib" },
    { id: "hartmann", group: "Measure", title: "Hartmann constants", render: stepHartmann, key: "hart" },
    { id: "heads", group: "Measure", title: "AlO band heads", render: stepHeads, viewer: "alo", key: "bands" },
    { id: "deslandre", group: "Analyse", title: "Deslandre tables", render: stepDeslandre },
    { id: "upper", group: "Analyse", title: "Upper state B²Σ⁺", render: stepUpper, key: "upper" },
    { id: "lower", group: "Analyse", title: "Lower state X²Σ⁺", render: stepLower, key: "lower" },
    { id: "graphs", group: "Analyse", title: "Graphs", render: stepGraphs },
    { id: "result", group: "Report", title: "Result", render: stepResult },
    { id: "viva", group: "Report", title: "Questions", render: stepViva, key: "viva" },
    { id: "report", group: "Report", title: "Report and submission", render: stepReport }
  ];

  /* ============================================================
     Step 0 — aim and theory
     ============================================================ */

  function stepAim() {
    return '' +
      '<h2>Vibrational constants of AlO from its electronic band spectrum</h2>' +
      '<div class="card">' +
      '<h3>Aim</h3>' +
      '<p>To determine the vibrational constants ω<sub>e</sub> and x<sub>e</sub> of the aluminium oxide molecule for the upper (B²Σ⁺) and lower (X²Σ⁺) electronic states from the band heads of its visible band system.</p>' +
      '<h3>Apparatus</h3>' +
      '<p>Photographic plate carrying the AlO band spectrum with a mercury comparison spectrum, and a travelling comparator of least count ' + fmt(P.PLATE.leastCount) + ' cm. Here both are simulated: the plate is generated for your register number, the comparator is driven with the slider and the arrow keys.</p>' +
      '</div>' +

      '<div class="card">' +
      '<h3>Theory</h3>' +
      '<p>The total energy of a molecule separates into electronic, vibrational and rotational parts, <em>E</em> = <em>E</em><sub>e</sub> + <em>E</em><sub>v</sub> + <em>E</em><sub>r</sub>. In wavenumber units the vibrational term is</p>' +
      '<p class="formula">G(v) = ω<sub>e</sub>(v + ½) − ω<sub>e</sub>x<sub>e</sub>(v + ½)² + …</p>' +
      '<p>A transition between two electronic states may start from any vibrational level of the upper state and end on any level of the lower state, so the band system contains many bands. Because the arc runs far above room temperature several upper levels are populated and a good number of bands appear.</p>' +
      '<p>The wavenumber of the head of the (v′, v″) band is</p>' +
      '<p class="formula">ν̃(v′,v″) = ν̃<sub>00</sub> + [G′(v′) − G′(0)] − [G″(v″) − G″(0)]</p>' +
      '<p>Arranging the band-head wavenumbers in an array with v′ down the rows and v″ across the columns gives the <strong>Deslandre table</strong>. The separation between two successive rows is a vibrational quantum of the upper state, and between two successive columns a quantum of the lower state:</p>' +
      '<p class="formula">ΔG′(½) = ω<sub>e</sub>′ − 2ω<sub>e</sub>′x<sub>e</sub>′  ΔG′(3/2) = ω<sub>e</sub>′ − 4ω<sub>e</sub>′x<sub>e</sub>′  ΔG′(5/2) = ω<sub>e</sub>′ − 6ω<sub>e</sub>′x<sub>e</sub>′</p>' +
      '<p>The second difference is constant and gives the anharmonicity directly:</p>' +
      '<p class="formula">Δ²G′ = ΔG′(½) − ΔG′(3/2) = 2ω<sub>e</sub>′x<sub>e</sub>′,  ω<sub>e</sub>′ = ΔG′(½) + 2ω<sub>e</sub>′x<sub>e</sub>′,  x<sub>e</sub>′ = 2ω<sub>e</sub>′x<sub>e</sub>′ ⁄ 2ω<sub>e</sub>′</p>' +
      '<p>The same treatment applied to the columns gives ω<sub>e</sub>″ and x<sub>e</sub>″ for the lower state. Bands with Δv = v′ − v″ constant lie close together and form a <strong>sequence</strong>; bands along a row or a column form a <strong>progression</strong>.</p>' +
      '<h3>Wavelengths from the comparator</h3>' +
      '<p>The plate carries no wavelength scale. Positions are read on the comparator and converted with Hartmann\'s dispersion formula, whose three constants come from three known mercury lines:</p>' +
      '<p class="formula">λ = λ<sub>0</sub> + C ⁄ (d − d<sub>0</sub>)</p>' +
      '</div>' +

      '<div class="note">The next section looks at the spectrum itself — how the bands are grouped, why each has a sharp edge, and how to tell one from another before you have measured anything. Work through the steps in order. Everything you record is kept in this browser under your register number, so you can close the tab and come back.</div>' +
      nav();
  }


  /* ============================================================
     The AlO spectrum — what is on the plate and why
     ============================================================ */

  var FIG = {};
  function fig(name, maker) {
    if (!FIG[name]) FIG[name] = maker();
    return '<div class="chartbox" style="margin-bottom:16px">' + FIG[name] + '</div>';
  }

  function stepAtlas() {
    var T = P.TRUTH;
    var dG1u = T.we_u - 2 * T.wexe_u, dG1l = T.we_l - 2 * T.wexe_l;

    return '' +
      '<h2>The AlO spectrum</h2>' +
      '<p>Before touching the comparator it is worth knowing what the marks on the plate are. Everything you will measure is a <em>band head</em>, and the bands are arranged in a pattern that lets you identify each one without knowing its wavelength in advance.</p>' +

      '<h3>Why there are so many bands</h3>' +
      '<p>The AlO molecule is heteronuclear, so it has an allowed electronic transition in the visible: B²Σ⁺ → X²Σ⁺. Each of those two electronic states carries its own ladder of vibrational levels, and the arc runs at several thousand kelvin, so several levels of the upper state are populated before the molecule radiates. A molecule can start from any populated v′ and land on any v″, and there is no vibrational selection rule to stop it — every combination gives a band of its own.</p>' +
      fig("levels", function () { return root.Charts.energyDiagram({ title: "Vibrational levels and the transitions between them" }); }) +
      '<p class="formula">ν̃(v′,v″) = ν̃<sub>00</sub> + [G′(v′) − G′(0)] − [G″(v″) − G″(0)]</p>' +
      '<p>Read that as: start from the (0,0) band, climb the upper ladder by v′ steps, and come down the lower ladder by v″ steps. The two ladders have different rungs — roughly ' + fmt(dG1u, 0) + ' cm⁻¹ upstairs and ' + fmt(dG1l, 0) + ' cm⁻¹ downstairs — and that difference is the whole reason the spectrum looks the way it does.</p>' +

      '<h3>Sequences: the five groups</h3>' +
      '<p>Bands with the same Δv = v′ − v″ have nearly the same wavenumber, because moving one rung up on both ladders almost cancels: the residue is only the difference of the two quanta, of order 100 cm⁻¹. Bands with different Δv are separated by a whole quantum, of order 900 cm⁻¹. So the band system falls into tight groups — the <strong>sequences</strong> — separated by wide gaps.</p>' +
      fig("atlas", function () { return root.Charts.bandAtlas({ title: "The band system as it appears on the plate" }); }) +
      '<p>That is the key to identifying a band without measuring it first. Find the strongest group: it is Δv = 0, and its violet-most member is (0,0), then (1,1), (2,2) and so on marching to the red. One group to the violet is Δv = +1, starting with (1,0); one group to the red is Δv = −1, starting with (0,1). Within any group the bands always run in order of increasing v′.</p>' +

      '<h3>Why the groups fade the way they do</h3>' +
      '<p>Two separate effects set the brightness. Along a sequence the intensity falls off because each successive band starts from a higher v′, which is less populated — a Boltzmann factor at the temperature of the arc. Across sequences it falls off because the vibrational wavefunctions of the two states overlap best when v′ ≈ v″; that overlap, the Franck–Condon factor, is what makes Δv = 0 the strongest group and Δv = ±3 too faint to measure here. AlO has almost the same bond length in both states, which is why its diagonal sequence is so dominant.</p>' +

      '<h3>Why each band has a sharp edge on one side</h3>' +
      '<p>A band is not a line. It is a few hundred rotational lines whose positions follow</p>' +
      '<p class="formula">ν̃(m) = ν̃<sub>origin</sub> + (B′ + B″)m + (B′ − B″)m²,  m = J + 1 in the R branch, −J in the P branch</p>' +
      '<p>The molecule is slightly larger in the excited state, so B′ &lt; B″ and the quadratic term is negative. The R branch therefore climbs, turns around and comes back: near the turning point many lines land almost on top of each other and the plate is fully exposed. That pile-up is the <strong>band head</strong>. Every line beyond it runs off to longer wavelength, which is why AlO bands are shaded — degraded — to the red.</p>' +
      fig("head", function () { return root.Charts.headFormation({ title: "How a band head forms" }); }) +
      '<p>This is why the head, and not the brightest point, is the thing to measure: the head is a sharp, reproducible edge fixed by the rotational constants, whereas the peak of the exposure wanders with the strength of the arc and the development of the plate. On the plate the head is the abrupt violet edge of each band. Set the field of view to 0.5 cm and you can see the individual rotational lines crowding into it.</p>' +

      '<h3>Sequences and progressions in the Deslandre table</h3>' +
      '<p>The same structure appears again once the wavenumbers are laid out in the array. A sequence is a diagonal; a progression is a row or a column.</p>' +
      seqGrid() +
      '<p>Notice which cells you actually need. Any two vertically adjacent cells give a vibrational quantum of the upper state, and any two horizontally adjacent cells give one of the lower state. Filling the block with v′ and v″ up to 3 gives three quanta for each state, which is exactly enough for a second difference.</p>' +
      nav();
  }

  function seqGrid() {
    var out = '<div class="tablewrap"><table class="des"><caption>Where each kind of grouping sits — the shaded diagonal is one sequence, the outlined row and column are progressions</caption>' +
      '<thead><tr><th>v′ \\ v″</th><th class="num">0</th><th class="num">1</th><th class="num">2</th><th class="num">3</th></tr></thead><tbody>';
    for (var vu = 0; vu <= 3; vu++) {
      out += '<tr><th class="num">' + vu + '</th>';
      for (var vl = 0; vl <= 3; vl++) {
        var cls = vu === vl ? "diag" : "";
        var style = "";
        if (vu === 1) style += "border-top:2px solid var(--crosswire);border-bottom:2px solid var(--crosswire);";
        if (vl === 2) style += "border-left:2px solid var(--accent);border-right:2px solid var(--accent);";
        out += '<td class="num ' + cls + '" style="' + style + '">(' + vu + "," + vl + ')</td>';
      }
      out += "</tr>";
    }
    out += '</tbody></table></div>' +
      '<p style="font-size:.88rem;color:var(--ink-2)">Shaded: the Δv = 0 sequence, the brightest group on the plate. Red: the v′ = 1 progression, whose spacings belong to the ground state. Teal: the v″ = 2 progression, whose spacings belong to the excited state.</p>';
    return out;
  }

  /* ============================================================
     How to work through the experiment
     ============================================================ */

  function stepHowTo() {
    return '' +
      '<h2>How to work through it</h2>' +
      '<p>Allow about two hours. The measuring is quick once the calibration is right; most of the time goes into setting the crosswire carefully. Work through the steps in the order they appear in the list on the left — each one needs the one before it.</p>' +

      '<div class="card"><h3>Driving the comparator</h3>' +
      '<p>The plate is fixed and the crosswire travels along it. Four ways to move it, in order of increasing precision:</p>' +
      '<ol>' +
      '<li>Click or drag anywhere on the plate or the trace to jump the wire there.</li>' +
      '<li>Drag the slider under the plate for a smooth run along the spectrum.</li>' +
      '<li>Press the arrow keys to step by one least count, ' + fmt(P.PLATE.leastCount) + ' cm; hold Shift for ten.</li>' +
      '<li>Use the ±0.001, ±0.010 and ±0.100 buttons if you prefer clicking.</li>' +
      '</ol>' +
      '<p>The panel on the right shows the reading three ways: the total in cm, the main-scale reading, and the number of vernier divisions beyond it. Copy all three into your record — that is what the reading actually consists of. The small dark window below is the magnifier: it shows about a millimetre of plate around the wire, which is the only reliable way to judge whether you are on the edge of a band or just past it.</p>' +
      '<p>Two aids sit above the plate. <em>Band identities</em> writes the (v′, v″) labels on the trace, and <em>wire snaps to an edge</em> pulls the crosswire onto the nearest head when you click near one. Your instructor may have switched both off, in which case you identify the bands from the sequence pattern and set the wire by eye.</p>' +
      '</div>' +

      '<div class="card"><h3>The measurements, in order</h3>' +
      '<ol>' +
      '<li><strong>Mount the plate.</strong> Type your name and register number. The plate is generated from the register number, so it must be right before you start recording.</li>' +
      '<li><strong>Mercury lines.</strong> Switch to the mercury readings step. Seven sharp lines run from violet at the left to yellow at the right, in the same order as the table. Set the wire on the centre of each and press Record on its row. Work left to right so you cannot confuse one line with another. The two yellow lines at the far right are close together — zoom to 0.5 cm to separate them.</li>' +
      '<li><strong>Hartmann constants.</strong> Tick three of the lines you measured. Choose them far apart — one near each end and one in the middle — because three lines crowded together determine the curve poorly. The page then computes λ₀, C and d₀ and, more usefully, applies them to the lines you did <em>not</em> use. If any of those comes out more than a couple of ångström from its standard value, one of your settings is wrong: re-measure it before going on.</li>' +
      '<li><strong>Band heads.</strong> Find the strongest group, take its violet-most band as (0,0), and record heads working outwards. Set the wire on the sharp violet edge of each band, checking it in the magnifier: the edge should be just to the left of the wire. Fill the block with v′ and v″ up to 3 — fourteen bands. The extra faint bands below the table are optional and extend the analysis if you can find them.</li>' +
      '<li><strong>Read the analysis.</strong> The Deslandre tables, the differences and the constants are worked out from your readings as you go. Nothing there is a black box: each first difference shows the individual values that were averaged, so you can see straight away if one band is out of line.</li>' +
      '<li><strong>Graphs, result and questions,</strong> then export or submit the report.</li>' +
      '</ol></div>' +

      '<div class="card"><h3>Checks worth making as you go</h3>' +
      '<div class="tablewrap"><table>' +
      '<thead><tr><th>At this point</th><th>What should be true</th><th>If it is not</th></tr></thead><tbody>' +
      '<tr><td>After the Hartmann fit</td><td>The unused mercury lines come back within about 1 Å; the r.m.s. deviation is well under 1.5 Å.</td><td>Re-measure the line with the largest deviation, or pick three lines that are further apart.</td></tr>' +
      '<tr><td>After a few band heads</td><td>Wavelengths fall between about 4400 and 5450 Å and increase steadily along a sequence.</td><td>A band recorded on the wrong row: check the Δv column against the group you were measuring.</td></tr>' +
      '<tr><td>First differences</td><td>ΔG(v + ½) decreases slowly and smoothly as v rises — by a few cm⁻¹ each step, never jumping.</td><td>The band that breaks the pattern is misassigned or mis-set. Re-record it.</td></tr>' +
      '<tr><td>Second differences</td><td>All roughly equal, near 7 cm⁻¹ for the upper state and 14 cm⁻¹ for the lower.</td><td>Second differences amplify errors: one head set 0.005 cm out is enough. Re-measure the bands feeding the odd value.</td></tr>' +
      '<tr><td>Result</td><td>ω<sub>e</sub>″ comes out larger than ω<sub>e</sub>′, and both anharmonicities are small and positive.</td><td>If the two states are swapped, the row differences have been read as column differences.</td></tr>' +
      '</tbody></table></div></div>' +

      '<div class="card"><h3>Things that commonly go wrong</h3>' +
      '<p>Setting the wire on the brightest part of a band rather than on its edge shifts every reading in the same direction. That barely affects the differences, so the constants may still look reasonable — but the wavelengths will all be a few ångström long, and the (0,0) band will not sit where the literature puts it.</p>' +
      '<p>Recording a band on the wrong row of the table is the most damaging mistake, because a single misplaced entry corrupts two first differences and therefore both second differences. If one value looks odd, suspect the assignment before you suspect the physics.</p>' +
      '<p>Using three mercury lines from the same end of the plate gives a Hartmann curve that fits those three perfectly and everything else badly. The residual table is there to catch exactly this.</p>' +
      '</div>' +

      '<div class="note">Your readings are saved in this browser under your register number as you go. To move to another machine, download the session file from the last step and open it there.</div>' +
      nav();
  }

  /* ============================================================
     Student and plate
     ============================================================ */

  function stepSetup() {
    var last = store("aloLab.last") || "";
    return '' +
      '<h2>Your plate</h2>' +
      '<p>The plate is generated from your register number, so no two students measure exactly the same one. Enter it once and keep it unchanged: changing it later loads a different plate.</p>' +
      '<div class="card">' +
      '<div class="grid2">' +
      '<div>' +
      field("Name", "name", S.student.name) +
      field("Register number", "register", S.student.register) +
      field("Batch / section", "batch", S.student.batch) +
      '</div>' +
      '<div>' +
      field("Lab partner (optional)", "partner", S.student.partner) +
      field("Date of experiment", "date", S.student.date, "date") +
      '<div class="field"><span>Comparator least count</span>' +
      '<input value="' + fmt(P.PLATE.leastCount) + ' cm  (main scale ' + fmt(P.PLATE.mainScaleDiv, 2) + ' cm ÷ ' + P.PLATE.vernierDiv + ' vernier divisions)" readonly></div>' +
      '</div></div>' +
      '<div class="recordbar">' +
      '<button class="primary" data-action="mount">Mount the plate</button>' +
      (last && last !== S.student.register ? '<button class="ghost" data-action="loadlast">Resume ' + esc(last) + '</button>' : '') +
      '<button class="ghost" data-action="loadfile">Open a saved session file</button>' +
      '<span class="progress" id="mountMsg"></span>' +
      '</div>' +
      '</div>' +
      (plate ? '<div class="note">Plate mounted. The spectrum runs from about ' + fmt(plate.dMin, 2) + ' cm to ' + fmt(plate.dMax, 2) + ' cm on the comparator scale.</div>' : '') +
      (demo ? '<div class="note warn">Demonstration mode is on. <button class="link" data-action="fillall">Fill every reading automatically</button> — for checking the flow, not for a real record.</div>' : '') +
      nav();
  }

  function field(label, name, value, type) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<input type="' + (type || "text") + '" data-student="' + name + '" value="' + esc(value) + '"></label>';
  }

  /* ============================================================
     Step 2 — mercury calibration readings
     ============================================================ */

  function stepCalib() {
    var rows = hgEntries().map(function (h) {
      var v = isFinite(h.d) ? P.vernier(h.d) : null;
      return '<tr class="' + (isFinite(h.d) ? "" : "pending") + '">' +
        '<td>Hg ' + esc(h.name) + '</td>' +
        '<td class="num">' + fmt(h.lambda, 2) + '</td>' +
        '<td class="num">' + (v ? fmt(v.msr, 2) : "—") + '</td>' +
        '<td class="num">' + (v ? v.vsd : "—") + '</td>' +
        '<td class="num">' + (v ? fmt(v.total, 3) : "—") + '</td>' +
        '<td><button class="ghost" data-action="recordHg" data-i="' + h.i + '">' + (isFinite(h.d) ? "Re-record" : "Record") + '</button>' +
        (isFinite(h.d) ? ' <button class="link" data-action="clearHg" data-i="' + h.i + '">clear</button>' : '') + '</td>' +
        '</tr>';
    }).join("");

    return '' +
      '<h2>Mercury readings</h2>' +
      '<p>The mercury comparison spectrum is on the plate. Set the crosswire on each line and record its comparator reading. The plate runs violet at the left to yellow at the right, so the readings increase down the table. Use the magnifier and the fine steps to set the wire on the centre of a line.</p>' +
      '<div class="tablewrap"><table><caption>Table 1 — comparator readings of the mercury standard lines</caption>' +
      '<thead><tr><th>Line</th><th class="num">λ (Å)</th><th class="num">M.S.R. (cm)</th><th class="num">V.S.D.</th><th class="num">Reading d (cm)</th><th>Action</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      '<div class="note">Three well separated lines are enough for the Hartmann constants, but record all seven: the extra ones let you check the calibration.</div>' +
      nav();
  }

  /* ============================================================
     Step 3 — Hartmann constants
     ============================================================ */

  function stepHartmann() {
    var got = hgEntries().filter(function (h) { return isFinite(h.d); });
    if (got.length < 3) {
      return '<h2>Hartmann constants</h2><div class="note warn">Record at least three mercury lines first.</div>' + nav();
    }
    if (!S.pick.length) S.pick = [got[0].i, got[Math.floor(got.length / 2)].i, got[got.length - 1].i];

    var boxes = got.map(function (h) {
      var on = S.pick.indexOf(h.i) >= 0;
      return '<label class="toggle" style="margin-right:16px">' +
        '<input type="checkbox" data-action="pick" data-i="' + h.i + '"' + (on ? " checked" : "") + '> ' +
        fmt(h.lambda, 2) + ' Å at ' + fmt(h.d, 3) + ' cm</label>';
    }).join("");

    var body = "", chart = "";
    if (S.pick.length === 3) {
      var pts = S.pick.map(function (i) { return { lambda: P.HG_LINES[i].lambda, d: S.hg[i] }; })
        .sort(function (a, b) { return a.lambda - b.lambda; });
      var h = P.hartmannFromThree(pts[0], pts[1], pts[2]);
      S.hart = h;
      if (h) {
        var res = got.map(function (g) {
          var lam = P.lambdaFromHartmann(h, g.d);
          return { g: g, lam: lam, dev: lam - g.lambda };
        });
        var rms = Math.sqrt(res.reduce(function (s, r) { return s + r.dev * r.dev; }, 0) / res.length);
        body = '' +
          '<div class="card"><h3>Constants from the three chosen lines</h3>' +
          '<p class="formula">λ = λ<sub>0</sub> + C ⁄ (d − d<sub>0</sub>)</p>' +
          '<dl class="kv">' +
          '<dt>λ<sub>0</sub></dt><dd>' + fmt(h.lam0, 2) + ' Å</dd>' +
          '<dt>C</dt><dd>' + fmt(h.C, 1) + ' Å·cm</dd>' +
          '<dt>d<sub>0</sub></dt><dd>' + fmt(h.d0, 4) + ' cm</dd>' +
          '</dl></div>' +
          '<div class="tablewrap"><table><caption>Table 2 — calibration check on every recorded mercury line</caption>' +
          '<thead><tr><th>Line</th><th class="num">d (cm)</th><th class="num">λ from Hartmann (Å)</th><th class="num">standard λ (Å)</th><th class="num">difference (Å)</th></tr></thead><tbody>' +
          res.map(function (r) {
            return '<tr class="' + (S.pick.indexOf(r.g.i) >= 0 ? "hit" : "") + '"><td>Hg ' + esc(r.g.name) + '</td>' +
              '<td class="num">' + fmt(r.g.d, 3) + '</td><td class="num">' + fmt(r.lam, 2) + '</td>' +
              '<td class="num">' + fmt(r.g.lambda, 2) + '</td><td class="num">' + fmt(r.dev, 2) + '</td></tr>';
          }).join("") +
          '</tbody></table></div>' +
          '<div class="note' + (rms > 1.5 ? " warn" : "") + '">Root-mean-square deviation ' + fmt(rms, 2) + ' Å. ' +
          (rms > 1.5 ? 'That is larger than the plate deserves — re-check the lines marked with the largest difference, or choose three lines that are further apart.' : 'The calibration is good enough to measure the band heads.') +
          '</div>';
        chart = '<div class="chartbox" id="calChart"></div>';
      }
    } else {
      body = '<div class="note warn">Choose exactly three lines. Widely separated lines give the most reliable constants.</div>';
      S.hart = null;
    }

    return '<h2>Hartmann constants</h2>' +
      '<p>Hartmann\'s formula describes the dispersion of a prism instrument with three constants. Pick three mercury lines and they are fixed; every other line then becomes a test of the calibration.</p>' +
      '<div class="card"><h3>Lines used for the calibration</h3>' + boxes + '</div>' +
      body + chart + nav();
  }

  /* ============================================================
     Step 4 — band heads
     ============================================================ */

  function stepHeads() {
    if (!S.hart) {
      return '<h2>AlO band heads</h2><div class="note warn">Find the Hartmann constants first — without them a comparator reading cannot be turned into a wavelength.</div>' + nav();
    }
    var req = requiredBands(), ext = extraBands();

    function rowsFor(list, optional) {
      return list.map(function (b) {
        var k = b.vu + "," + b.vl;
        var d = S.bands[k];
        var lam = isFinite(d) ? P.lambdaFromHartmann(S.hart, d) : NaN;
        var nu = isFinite(lam) ? P.lambdaToNu(lam) : NaN;
        var v = isFinite(d) ? P.vernier(d) : null;
        return '<tr class="' + (isFinite(d) ? "" : "pending") + '">' +
          '<td>(' + b.vu + ", " + b.vl + ')</td>' +
          '<td class="num">' + (b.dv > 0 ? "+" : "") + b.dv + '</td>' +
          '<td class="num">' + (v ? fmt(v.msr, 2) : "—") + '</td>' +
          '<td class="num">' + (v ? v.vsd : "—") + '</td>' +
          '<td class="num">' + (isFinite(d) ? fmt(d, 3) : "—") + '</td>' +
          '<td class="num">' + fmt(lam, 2) + '</td>' +
          '<td class="num">' + fmt(nu, 1) + '</td>' +
          '<td><button class="ghost" data-action="recordBand" data-k="' + k + '">' + (isFinite(d) ? "Re-record" : "Record") + '</button>' +
          (isFinite(d) ? ' <button class="link" data-action="clearBand" data-k="' + k + '">clear</button>' : '') + '</td>' +
          '</tr>';
      }).join("");
    }

    var done = bandEntries().length;
    return '' +
      '<h2>AlO band heads</h2>' +
      '<p>Each band is shaded to the red: a sharp edge on the violet side, fading away towards longer wavelength. Set the crosswire on that sharp edge — that is the band head. The five groups on the plate are the sequences Δv = +2, +1, 0, −1, −2; within a group the bands run in order of v′.</p>' +
      '<div class="progress" style="margin-bottom:10px">' + done + ' of ' + req.length + ' bands of the main block recorded</div>' +
      '<div class="tablewrap"><table><caption>Table 3 — band heads needed for the Deslandre table (v′ and v″ up to 3)</caption>' +
      '<thead><tr><th>Band (v′, v″)</th><th class="num">Δv</th><th class="num">M.S.R. (cm)</th><th class="num">V.S.D.</th><th class="num">d (cm)</th><th class="num">λ (Å)</th><th class="num">ν̃ (cm⁻¹)</th><th>Action</th></tr></thead>' +
      '<tbody>' + rowsFor(req) + '</tbody></table></div>' +
      '<details><summary>Weaker bands with v′ or v″ above 3 (optional, they extend the table)</summary>' +
      '<div class="tablewrap" style="margin-top:10px"><table>' +
      '<thead><tr><th>Band (v′, v″)</th><th class="num">Δv</th><th class="num">M.S.R. (cm)</th><th class="num">V.S.D.</th><th class="num">d (cm)</th><th class="num">λ (Å)</th><th class="num">ν̃ (cm⁻¹)</th><th>Action</th></tr></thead>' +
      '<tbody>' + rowsFor(ext, true) + '</tbody></table></div></details>' +
      nav();
  }

  /* ============================================================
     Step 5 — Deslandre tables
     ============================================================ */

  function stepDeslandre() {
    var e = bandEntries();
    if (!e.length) return '<h2>Deslandre tables</h2><div class="note warn">No band heads recorded yet.</div>' + nav();
    var vus = [], vls = [];
    e.forEach(function (b) {
      if (vus.indexOf(b.vu) < 0) vus.push(b.vu);
      if (vls.indexOf(b.vl) < 0) vls.push(b.vl);
    });
    vus.sort(function (a, b) { return a - b; }); vls.sort(function (a, b) { return a - b; });

    function table(valueOf, caption, dp) {
      var h = '<tr><th>v′ \\ v″</th>' + vls.map(function (v) { return '<th class="num">' + v + '</th>'; }).join("") + '</tr>';
      var body = vus.map(function (vu) {
        return '<tr><th class="num">' + vu + '</th>' + vls.map(function (vl) {
          var hit = e.filter(function (b) { return b.vu === vu && b.vl === vl; })[0];
          if (!hit) return '<td class="empty"></td>';
          return '<td class="num' + (vu === vl ? " diag" : "") + '">' + fmt(valueOf(hit), dp) + '</td>';
        }).join("") + '</tr>';
      }).join("");
      return '<div class="tablewrap"><table class="des"><caption>' + caption + '</caption><thead>' + h + '</thead><tbody>' + body + '</tbody></table></div>';
    }

    return '<h2>Deslandre tables</h2>' +
      '<p>Every measured band head takes its place in the array. Bands along a diagonal share the same Δv and form a sequence; a row or a column is a progression.</p>' +
      table(function (b) { return b.lambda; }, "Table 4 — band heads in Å", 1) +
      table(function (b) { return b.nu; }, "Table 5 — band heads in cm⁻¹", 1) +
      '<div class="note">Read across a row: the spacing between neighbouring columns is a vibrational quantum of the lower state. Read down a column: the spacing between neighbouring rows belongs to the upper state.</div>' +
      nav();
  }

  /* ============================================================
     Steps 6 and 7 — the two electronic states
     ============================================================ */

  function stateStep(which) {
    var a = analysis();
    var name = which === "upper" ? "upper state B²Σ⁺" : "lower state X²Σ⁺";
    var pr = which === "upper" ? "′" : "″";
    var lit = which === "upper" ? { we: P.LIT.we_u, wexe: P.LIT.wexe_u, xe: P.LIT.xe_u } : { we: P.LIT.we_l, wexe: P.LIT.wexe_l, xe: P.LIT.xe_l };
    if (!a || !a[which].first.length) {
      return '<h2>' + (which === "upper" ? "Upper" : "Lower") + ' state</h2><div class="note warn">Not enough bands yet. You need at least three successive ' + (which === "upper" ? "rows" : "columns") + ' of the Deslandre table.</div>';
    }
    var st = a[which];
    var idxLabel = which === "upper" ? "v″" : "v′";

    var first = '<div class="tablewrap"><table><caption>First differences ΔG' + pr + '(v + ½) in cm⁻¹</caption>' +
      '<thead><tr><th>Interval</th><th>Values from each ' + (which === "upper" ? "column" : "row") + ' (' + idxLabel + ')</th><th class="num">Mean</th><th class="num">Spread</th></tr></thead><tbody>' +
      st.first.map(function (f) {
        return '<tr><td>ΔG' + pr + '(' + f.v + ' + ½) = G' + pr + '(' + (f.v + 1) + ') − G' + pr + '(' + f.v + ')</td>' +
          '<td class="num">' + f.terms.map(function (t) {
            return (t.vl !== undefined ? t.vl : t.vu) + ": " + fmt(t.value, 1);
          }).join("  ") + '</td>' +
          '<td class="num">' + fmt(f.value, 1) + '</td><td class="num">' + (isFinite(f.sd) ? "± " + fmt(f.sd, 1) : "—") + '</td></tr>';
      }).join("") + '</tbody></table></div>';

    var second = '<div class="tablewrap"><table><caption>Second differences Δ²G' + pr + ' = 2ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + '</caption>' +
      '<thead><tr><th>Difference</th><th class="num">Value (cm⁻¹)</th></tr></thead><tbody>' +
      st.second.map(function (s) {
        return '<tr><td>ΔG' + pr + '(' + s.from + ' + ½) − ΔG' + pr + '(' + s.to + ' + ½)</td><td class="num">' + fmt(s.value, 2) + '</td></tr>';
      }).join("") +
      '<tr><th>Mean</th><th class="num">' + fmt(st.twoWexe, 2) + '</th></tr>' +
      '</tbody></table></div>';

    var work = '<div class="card"><h3>Constants</h3>' +
      '<p class="formula">2ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' = ' + fmt(st.twoWexe, 2) + ' cm⁻¹ → ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' = ' + fmt(st.wexe, 2) + ' cm⁻¹</p>' +
      '<p class="formula">ω<sub>e</sub>' + pr + ' = ΔG' + pr + '(½) + 2ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' = ' + fmt(st.first[0].value, 1) + ' + ' + fmt(st.twoWexe, 2) + ' = ' + fmt(st.we, 1) + ' cm⁻¹</p>' +
      '<p class="formula">x<sub>e</sub>' + pr + ' = ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' ⁄ ω<sub>e</sub>' + pr + ' = ' + fmt(st.xe, 5) + '</p>' +
      '<div class="result-strip">' +
      resultCell("ω<sub>e</sub>" + pr, fmt(st.we, 1) + " cm⁻¹", "literature " + fmt(lit.we, 1)) +
      resultCell("ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr, fmt(st.wexe, 2) + " cm⁻¹", "literature " + fmt(lit.wexe, 2)) +
      resultCell("x<sub>e</sub>" + pr, fmt(st.xe, 5), "literature " + fmt(lit.xe, 5)) +
      '</div></div>';

    return '<h2>Vibrational quanta of the ' + name + '</h2>' + first + second + work;
  }

  function resultCell(label, value, extra) {
    return '<div><div class="v">' + value + '</div><div class="l">' + label + '</div><div class="e">' + (extra || "") + '</div></div>';
  }

  function stepUpper() {
    return stateStep("upper") +
      '<div class="note">Each ΔG′ is obtained by subtracting two entries in the same column of the Deslandre table, so a column that is missing a band simply contributes nothing.</div>' + nav();
  }
  function stepLower() {
    return stateStep("lower") +
      '<div class="note">Here the differences are taken along a row. Note that ν̃ falls as v″ rises, so the difference is taken as the left entry minus the right one.</div>' + nav();
  }

  /* ============================================================
     Step 8 — graphs
     ============================================================ */

  function stepGraphs() {
    return '<h2>Graphs</h2>' +
      '<p>Three plots come out of the measurements. The Birge–Sponer lines are an independent route to the same constants: the intercept is ω<sub>e</sub> and the slope is −2ω<sub>e</sub>x<sub>e</sub>.</p>' +
      '<div id="graphHost"></div>' +
      '<div class="recordbar noprint">' +
      '<button class="ghost" data-action="dlsvg" data-g="spectrum">Download spectrum (SVG)</button>' +
      '<button class="ghost" data-action="dlpng" data-g="spectrum">Spectrum (PNG)</button>' +
      '<button class="ghost" data-action="dlsvg" data-g="bsUpper">Birge–Sponer upper (SVG)</button>' +
      '<button class="ghost" data-action="dlsvg" data-g="bsLower">Birge–Sponer lower (SVG)</button>' +
      '<button class="ghost" data-action="dlplate">Plate image (PNG)</button>' +
      '</div>' + nav();
  }

  var GRAPHS = {};

  function buildGraphs() {
    var host = el("graphHost");
    var a = analysis();
    var e = bandEntries();
    var out = "";
    GRAPHS = { calibration: GRAPHS.calibration };
    calChartSVG();

    if (S.hart && plate && e.length) {
      var lam0 = Math.min.apply(null, e.map(function (b) { return b.lambda; })) - 60;
      var lam1 = Math.max.apply(null, e.map(function (b) { return b.lambda; })) + 90;
      GRAPHS.spectrum = root.Charts.spectrumChart({
        xrange: [lam0, lam1],
        title: "AlO B²Σ⁺ → X²Σ⁺ band system, calibrated with the mercury lines",
        intensity: function (lam) { return plate.alo.at(lam, 1.1); },
        marks: e.map(function (b) {
          return { lambda: b.lambda, label: "(" + b.vu + "," + b.vl + ")", intensity: plate.alo.at(b.lambda + 1.5, 1.1) };
        })
      });
      out += '<div class="chartbox" style="margin-bottom:14px">' + GRAPHS.spectrum + '</div>';
    }

    if (a) {
      ["upper", "lower"].forEach(function (w) {
        var st = a[w], bs = st.birgeSponer;
        if (!bs) return;
        var key = w === "upper" ? "bsUpper" : "bsLower";
        GRAPHS[key] = root.Charts.scatterFit({
          points: st.first.map(function (f) { return [f.v + 1, f.value]; }),
          fit: bs,
          xlabel: "v + 1",
          ylabel: "ΔG(v + ½)  (cm⁻¹)",
          title: "Birge–Sponer plot — " + (w === "upper" ? "upper state B²Σ⁺" : "lower state X²Σ⁺"),
          annotation: "ωe = " + fmt(bs.we, 1) + " cm⁻¹, ωexe = " + fmt(bs.wexe, 2) + " cm⁻¹"
        });
      });
      out += '<div class="grid2">' +
        (GRAPHS.bsUpper ? '<div class="chartbox">' + GRAPHS.bsUpper + '</div>' : "") +
        (GRAPHS.bsLower ? '<div class="chartbox">' + GRAPHS.bsLower + '</div>' : "") +
        '</div>';
    }
    if (host) host.innerHTML = out || '<div class="note warn">Record some band heads to draw the graphs.</div>';
  }

  function calChartSVG() {
    if (!S.hart) { GRAPHS.calibration = null; return; }
    var pts = hgEntries().filter(function (h) { return isFinite(h.d); }).map(function (h) { return [h.d, h.lambda]; });
    GRAPHS.calibration = root.Charts.calibrationChart({
      points: pts,
      curve: function (d) { return P.lambdaFromHartmann(S.hart, d); },
      title: "Hartmann dispersion curve",
      annotation: "λ0 = " + fmt(S.hart.lam0, 1) + " Å, C = " + fmt(S.hart.C, 0) + ", d0 = " + fmt(S.hart.d0, 3) + " cm"
    });
  }

  function buildCalChart() {
    calChartSVG();
    var box = el("calChart");
    if (box && GRAPHS.calibration) box.innerHTML = GRAPHS.calibration;
  }

  /* ============================================================
     Step 9 — result
     ============================================================ */

  function stepResult() {
    var a = analysis();
    if (!a) return '<h2>Result</h2><div class="note warn">Nothing to report yet.</div>' + nav();
    return '<h2>Result</h2>' + resultTable(a) +
      '<div class="card"><label class="field"><span>Sources of error and remarks</span>' +
      '<textarea data-answer="errors" placeholder="Setting the crosswire on a shaded band head, choice of mercury lines, the assumption that the second difference is constant…">' + esc(S.answers.errors) + '</textarea></label></div>' +
      nav();
  }

  function resultTable(a) {
    function row(label, got, lit, dp) {
      var err = isFinite(got) && lit ? Math.abs(got - lit) / lit * 100 : NaN;
      return '<tr><td>' + label + '</td><td class="num">' + fmt(got, dp) + '</td><td class="num">' + fmt(lit, dp) + '</td><td class="num">' + fmt(err, 1) + '</td></tr>';
    }
    return '<div class="tablewrap"><table><caption>Table 6 — vibrational constants of AlO</caption>' +
      '<thead><tr><th>Quantity</th><th class="num">Measured</th><th class="num">Literature</th><th class="num">Difference (%)</th></tr></thead><tbody>' +
      row("ω<sub>e</sub>′ (cm⁻¹), upper state B²Σ⁺", a.upper.we, P.LIT.we_u, 1) +
      row("ω<sub>e</sub>′x<sub>e</sub>′ (cm⁻¹)", a.upper.wexe, P.LIT.wexe_u, 2) +
      row("x<sub>e</sub>′", a.upper.xe, P.LIT.xe_u, 5) +
      row("ω<sub>e</sub>″ (cm⁻¹), lower state X²Σ⁺", a.lower.we, P.LIT.we_l, 1) +
      row("ω<sub>e</sub>″x<sub>e</sub>″ (cm⁻¹)", a.lower.wexe, P.LIT.wexe_l, 2) +
      row("x<sub>e</sub>″", a.lower.xe, P.LIT.xe_l, 5) +
      '</tbody></table></div>';
  }

  /* ============================================================
     Step 10 — questions
     ============================================================ */

  var QUESTIONS = [
    { k: "q1", q: "What do you mean by an electronic band spectrum?", hint: "Think about what changes in the molecule, and why each electronic transition arrives as a group of bands rather than a single line." },
    { k: "q2", q: "What do you mean by the vibrational constants of AlO?", hint: "What do ωe and ωexe each describe about the potential well, and what would happen to the spacing if the vibration were exactly harmonic?" },
    { k: "q3", q: "Do you expect a band spectrum from a homonuclear diatomic molecule?", hint: "Consider the dipole moment, and whether the answer changes for electronic transitions as against pure vibration–rotation." },
    { k: "q4", q: "Explain sequences and progressions.", hint: "Locate both of them on your own Deslandre table and quote the bands you measured." }
  ];

  function stepViva() {
    return '<h2>Questions</h2>' +
      QUESTIONS.map(function (q, i) {
        return '<div class="card"><h3>' + (i + 1) + '. ' + esc(q.q) + '</h3>' +
          '<label class="field"><textarea data-answer="' + q.k + '">' + esc(S.answers[q.k]) + '</textarea></label>' +
          '<details><summary>Points to cover</summary><p style="margin-top:8px">' + esc(q.hint) + '</p></details></div>';
      }).join("") + nav();
  }

  /* ============================================================
     Step 11 — report
     ============================================================ */

  function stepReport() {
    return '<h2>Report and submission</h2>' +
      '<div class="recordbar noprint" style="margin-bottom:14px">' +
      '<button class="primary" data-action="print">Print or save as PDF</button>' +
      '<button class="ghost" data-action="dlhtml">Download the report (HTML)</button>' +
      '<button class="ghost" data-action="dlcsv">Download readings (CSV)</button>' +
      '<button class="ghost" data-action="dljson">Save session file</button>' +
      (CFG.APPS_SCRIPT_URL ? '<button class="primary" data-action="submit">Submit to the department sheet</button>' : '<span class="progress">Online submission is not configured for this deployment.</span>') +
      '<span class="progress" id="submitMsg"></span>' +
      '</div>' +
      '<div id="reportHost" class="report"></div>';
  }

  /* ---------- navigation ---------- */

  function nav() {
    var i = step;
    var prev = STEPS[i - 1], next = STEPS[i + 1];
    return '<div class="steps-nav noprint">' +
      (prev ? '<button class="ghost" data-action="go" data-i="' + (i - 1) + '">← ' + esc(prev.title) + '</button>' : '<span></span>') +
      (next ? '<button class="primary" data-action="go" data-i="' + (i + 1) + '">' + esc(next.title) + ' →</button>' : '<span></span>') +
      '</div>';
  }

  function renderRail() {
    var p = progress();
    var groups = [], seen = {};
    STEPS.forEach(function (s, i) {
      if (!seen[s.group]) { seen[s.group] = true; groups.push(s.group); }
    });
    var html = groups.map(function (g) {
      return '<div class="group">' + esc(g) + '</div>' +
        STEPS.map(function (s, i) {
          if (s.group !== g) return "";
          var done = s.key && p[s.key];
          return '<button data-action="go" data-i="' + i + '" class="' + (done ? "done" : "") + '"' +
            (i === step ? ' aria-current="true"' : "") + '><span class="n">' + (i + 1) + '</span>' + esc(s.title) + '</button>';
        }).join("");
    }).join("");
    el("rail").innerHTML = html;
  }

  function render() {
    var s = STEPS[step];
    el("steps").innerHTML = s.render();
    renderRail();
    var viewerBox = el("viewer");
    if (s.viewer && plate) {
      viewerBox.classList.remove("hidden");
      el("comparator").classList.remove("hidden");
      var dr = el("drive"), fr = view.fullRange();
      dr.min = fr.d0; dr.max = fr.d1; dr.step = P.PLATE.leastCount;
      view.setSource(s.viewer);
      view.render();
      syncReadout();
    } else {
      viewerBox.classList.add("hidden");
      el("comparator").classList.add("hidden");
    }
    if (s.id === "graphs") buildGraphs();
    if (s.id === "hartmann") buildCalChart();
    if (s.id === "report") root.Report.render(el("reportHost"));
    var who = el("whoami");
    if (who) who.textContent = S.student.register ? (S.student.name || "") + "  ·  " + S.student.register : "";
    root.scrollTo({ top: 0 });
    save();
  }

  function go(i) { step = Math.max(0, Math.min(STEPS.length - 1, i)); render(); }

  /* ---------- comparator wiring ---------- */

  function syncReadout() {
    if (!plate) return;
    var v = P.vernier(view.cursor);
    el("readBig").innerHTML = fmt(v.total, 3) + ' <span>cm</span>';
    el("readParts").textContent = "M.S.R. " + fmt(v.msr, 2) + " cm + " + v.vsd + " × " + fmt(P.PLATE.leastCount) + " cm";
    var sl = el("drive");
    if (document.activeElement !== sl) sl.value = view.cursor;
    var near = view.nearestFeature(view.cursor);
    var msg;
    if (!near) msg = "clear plate";
    else if (near.distance < 0.006) {
      var f = near.feature;
      if (view.source === "hg") msg = "on the " + f.name.toLowerCase() + " mercury line";
      else msg = view.labels
        ? "on the head of " + f.label + ", sequence Δv = " + (f.dv > 0 ? "+" : "") + f.dv
        : "on a band head";
    } else if (near.distance < 0.05) {
      msg = (view.cursor < near.feature.d ? "just short of" : "past") + " an edge by " +
        fmt(near.distance * 10, 2) + " mm";
    } else msg = "clear plate";
    el("nearMsg").textContent = msg;
  }

  function nudge(dx) {
    view.setCursor(view.cursor + dx, false);
    syncReadout();
  }

  function toast(msg, kind) {
    var t = el("toast");
    t.textContent = msg;
    t.className = "note " + (kind || "");
    t.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = "none"; }, 4000);
  }

  function mountPlate() {
    var reg = S.student.register.trim();
    if (!reg) { toast("Enter your register number first — the plate is generated from it.", "warn"); return; }
    plate = P.makePlate(reg);
    view.setPlate(plate);
    render();
    toast("Plate mounted for " + reg + ".");
  }

  function recordCurrent(check) {
    var near = view.nearestFeature(view.cursor);
    if (near && near.distance > 0.04) toast("That setting is on clear plate — check the magnifier before you accept it.", "warn");
    return view.cursor;
  }

  /* ---------- events ---------- */

  function onClick(ev) {
    var t = ev.target.closest("[data-action]");
    if (!t) return;
    var a = t.dataset.action;
    if (a === "go") { go(+t.dataset.i); return; }
    if (a === "mount") { mountPlate(); return; }
    if (a === "loadlast") {
      var last = store("aloLab.last");
      if (last && load(last)) { plate = P.makePlate(last); view.setPlate(plate); render(); toast("Session restored for " + last + "."); }
      return;
    }
    if (a === "loadfile") { openSession(); return; }
    if (a === "fillall") { fillAll(); return; }
    if (a === "recordHg") { S.hg[+t.dataset.i] = recordCurrent(); save(); render(); return; }
    if (a === "clearHg") { delete S.hg[+t.dataset.i]; save(); render(); return; }
    if (a === "pick") {
      var i = +t.dataset.i;
      var at = S.pick.indexOf(i);
      if (at >= 0) S.pick.splice(at, 1); else S.pick.push(i);
      save(); render(); return;
    }
    if (a === "recordBand") { S.bands[t.dataset.k] = recordCurrent(); save(); render(); return; }
    if (a === "clearBand") { delete S.bands[t.dataset.k]; save(); render(); return; }
    if (a === "print") { root.print(); return; }
    if (a === "dlhtml") { root.Report.downloadHTML(); return; }
    if (a === "dlcsv") { root.Report.downloadCSV(); return; }
    if (a === "dljson") { root.Report.download("alo-session-" + (S.student.register || "x") + ".json", JSON.stringify(S, null, 2), "application/json"); return; }
    if (a === "submit") { root.Report.submit(el("submitMsg")); return; }
    if (a === "dlsvg") {
      var g = GRAPHS[t.dataset.g];
      if (g) root.Report.download(t.dataset.g + ".svg", g, "image/svg+xml");
      return;
    }
    if (a === "dlpng") {
      var gp = GRAPHS[t.dataset.g];
      if (gp) root.Charts.svgToPng(gp, 2).then(function (url) { root.Report.downloadDataURL(t.dataset.g + ".png", url); });
      return;
    }
    if (a === "dlplate") {
      root.Report.downloadDataURL("plate-" + (S.student.register || "x") + ".png", el("plateCanvas").toDataURL("image/png"));
      return;
    }
  }

  function onInput(ev) {
    var t = ev.target;
    if (t.dataset.student) { S.student[t.dataset.student] = t.value; save(); return; }
    if (t.dataset.answer) { S.answers[t.dataset.answer] = t.value; save(); return; }
    if (t.id === "drive") { view.setCursor(+t.value, false); syncReadout(); return; }
  }

  function onKey(ev) {
    if (!plate || el("comparator").classList.contains("hidden")) return;
    if (["INPUT", "TEXTAREA", "SELECT"].indexOf(ev.target.tagName) >= 0 && ev.target.id !== "drive") return;
    var fine = ev.shiftKey ? 0.010 : 0.001;
    if (ev.key === "ArrowLeft") { nudge(-fine); ev.preventDefault(); }
    else if (ev.key === "ArrowRight") { nudge(fine); ev.preventDefault(); }
  }

  function fillAll() {
    if (!plate) { toast("Mount the plate first.", "warn"); return; }
    plate.hg.forEach(function (l, i) { S.hg[i] = l.d; });
    S.pick = [0, 3, 6];
    var pts = S.pick.map(function (i) { return { lambda: P.HG_LINES[i].lambda, d: S.hg[i] }; });
    S.hart = P.hartmannFromThree(pts[0], pts[1], pts[2]);
    plate.bands.forEach(function (b) { S.bands[b.vu + "," + b.vl] = b.d; });
    save(); render();
    toast("Demonstration data filled in.");
  }

  function openSession() {
    var inp = document.createElement("input");
    inp.type = "file"; inp.accept = ".json,application/json";
    inp.onchange = function () {
      var f = inp.files[0];
      if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        try {
          var obj = JSON.parse(r.result);
          Object.assign(S, obj);
          plate = P.makePlate(S.student.register);
          view.setPlate(plate);
          save(); render();
          toast("Session loaded.");
        } catch (e) { toast("That file could not be read as a session.", "bad"); }
      };
      r.readAsText(f);
    };
    inp.click();
  }

  /* ---------- boot ---------- */

  function boot() {
    demo = /[?&]demo=1/.test(root.location.search);
    var exam = /[?&]exam=1/.test(root.location.search);
    view = new root.PlateView({
      plate: el("plateCanvas"),
      trace: el("traceCanvas"),
      overlay: el("overlayCanvas"),
      mag: el("magCanvas")
    });
    view.onCursor = syncReadout;

    var last = store("aloLab.last");
    if (last && load(last)) { plate = P.makePlate(last); view.setPlate(plate); }

    document.addEventListener("click", onClick);
    document.addEventListener("input", onInput);
    document.addEventListener("change", onInput);
    document.addEventListener("keydown", onKey);

    el("zoom").addEventListener("change", function () {
      var v = this.value;
      view.span = v === "all" ? null : parseFloat(v);
      view.render();
    });
    el("labels").addEventListener("change", function () { view.labels = this.checked; view.render(); });
    el("snap").addEventListener("change", function () { view.snap = this.checked; });
    el("colour").addEventListener("change", function () { view.colour = this.checked; view.render(); });
    document.querySelectorAll("[data-nudge]").forEach(function (b) {
      b.addEventListener("click", function () { nudge(parseFloat(b.dataset.nudge)); });
    });

    if (exam) {
      el("labels").checked = false; el("snap").checked = false;
      view.labels = false; view.snap = false;
      el("labels").disabled = true; el("snap").disabled = true;
    }
    render();
  }

  root.addEventListener("DOMContentLoaded", boot);

  /* expose for the report module */
  root.LabState = {
    get state() { return S; },
    get plate() { return plate; },
    get graphs() { if (!GRAPHS.spectrum) buildGraphs(); return GRAPHS; },
    buildGraphs: buildGraphs,
    analysis: analysis,
    bandEntries: bandEntries,
    hgEntries: hgEntries,
    resultTable: resultTable,
    questions: QUESTIONS,
    fmt: fmt
  };

})(window);
