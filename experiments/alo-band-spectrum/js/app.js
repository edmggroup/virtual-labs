/* ============================================================
   app.js — experiment flow, state and all step screens.
   ============================================================ */

(function (root) {
  "use strict";

  var P = root.AlOPhysics;
  var CFG = Object.assign({}, root.VLAB_CONFIG || {}, root.EXPERIMENT || {});

  /* ---------- state ---------- */

  var S = {
    version: 1,
    student: { name: "", register: "", batch: "", partner: "", date: today() },
    hg: {},                 // index -> reading in cm
    pick: [],               // indices of the 3 Hg lines used for Hartmann
    hart: null,             // {lam0, C, d0}
    bands: {},              // "vu,vl" -> reading in cm
    work: {                 // everything below this line is the student's arithmetic
      hart: { lam0: "", C: "", d0: "" },
      lam: {},              // "vu,vl" -> wavelength in A, worked out by hand
      nu: {},               // "vu,vl" -> wavenumber in cm-1, worked out by hand
      up: { dg: ["", "", ""], d2: "", wexe: "", we: "", xe: "" },
      lo: { dg: ["", "", ""], d2: "", wexe: "", we: "", xe: "" },
      notes: { hart: "", up: "", lo: "" }
    },
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

  /* Nothing below is worked out for the student. The wavelength of a band
     is whatever they calculated from their own constants, the wavenumber is
     whatever they calculated from that wavelength, and the analysis runs on
     those numbers. The app only ever checks whether one follows from the
     other, and says so without giving the answer away. */

  function numOf(v) {
    if (v === undefined || v === null) return NaN;
    var x = parseFloat(String(v).replace(/[, ]/g, ""));
    return isFinite(x) ? x : NaN;
  }

  /* the constants the student worked out, if all three are present */
  function studentHartmann() {
    var w = S.work.hart;
    var lam0 = numOf(w.lam0), C = numOf(w.C), d0 = numOf(w.d0);
    if (!isFinite(lam0) || !isFinite(C) || !isFinite(d0)) return null;
    return { lam0: lam0, C: C, d0: d0 };
  }

  function bandEntries() {
    var out = [];
    Object.keys(S.bands).forEach(function (k) {
      var p = k.split(",");
      out.push({
        vu: +p[0], vl: +p[1], key: k, d: S.bands[k],
        lambda: numOf(S.work.lam[k]),
        nu: numOf(S.work.nu[k])
      });
    });
    out.sort(function (a, b) { return a.d - b.d; });
    return out;
  }

  /* what the app would get from the student's own table — used to check
     their differences, never shown as a number */
  function analysis() {
    var e = bandEntries().filter(function (b) { return isFinite(b.nu); });
    return e.length ? P.analyse(e) : null;
  }

  /* the constants as the student reports them */
  function workResults() {
    function state(w) {
      return { we: numOf(w.we), wexe: numOf(w.wexe), xe: numOf(w.xe) };
    }
    return { upper: state(S.work.up), lower: state(S.work.lo) };
  }

  function progress() {
    var r = workResults();
    return {
      setup: !!(S.student.name && S.student.register),
      calib: hgEntries().filter(function (h) { return isFinite(h.d); }).length >= 3,
      hart: !!studentHartmann(),
      bands: bandEntries().filter(function (b) { return isFinite(b.lambda); }).length >= 10,
      upper: isFinite(r.upper.we) && isFinite(r.upper.xe),
      lower: isFinite(r.lower.we) && isFinite(r.lower.xe),
      viva: !!(S.answers.q1 && S.answers.q2 && S.answers.q3 && S.answers.q4)
    };
  }

  /* ---------- checking the student's arithmetic ----------
     A check compares what they typed with what follows from their own
     earlier numbers. It reports agreement, not the expected value.      */

  function check(typed, expected, tol) {
    var t = numOf(typed);
    if (!isFinite(t)) return { state: "empty" };
    if (!isFinite(expected)) return { state: "unknown" };
    var off = Math.abs(t - expected);
    return { state: off <= tol ? "ok" : "off", off: off };
  }

  function mark(c, hint) {
    if (!c || c.state === "empty") return '<span class="mark"></span>';
    if (c.state === "unknown") return '<span class="mark">·</span>';
    if (c.state === "ok") return '<span class="mark ok" title="follows from your own figures">✓</span>';
    return '<span class="mark off" title="' + esc(hint || "does not follow from your earlier figures — check this one") + '">✗</span>';
  }

  function tally(list) {
    var ok = 0, off = 0, empty = 0;
    list.forEach(function (c) {
      if (!c || c.state === "empty") empty++;
      else if (c.state === "ok") ok++;
      else if (c.state === "off") off++;
    });
    return { ok: ok, off: off, empty: empty, total: list.length };
  }

  function tallyNote(t, what) {
    if (t.empty === t.total) return '<div class="note">Nothing entered yet. ' + esc(what) + '</div>';
    if (t.off) return '<div class="note bad">' + t.off + ' of your ' + t.total + ' entries do not follow from your own earlier figures. They are marked ✗ — re-work those and the rest will fall into place.</div>';
    if (t.empty) return '<div class="note warn">' + t.ok + ' of ' + t.total + ' checked and consistent; ' + t.empty + ' still to do.</div>';
    return '<div class="note">All ' + t.total + ' entries are consistent with your own figures.</div>';
  }

  function workBox(key, label) {
    return '<label class="field"><span>' + esc(label) + '</span>' +
      '<textarea data-work-note="' + key + '" placeholder="Set out the substitution and the arithmetic as you would in your record book.">' +
      esc(S.work.notes[key] || "") + '</textarea></label>';
  }

  function numInput(attr, key, value, extra) {
    return '<input class="wk" inputmode="decimal" data-' + attr + '="' + key + '" value="' +
      esc(value === undefined || value === null ? "" : value) + '"' + (extra || "") + '>';
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
     Hartmann constants — worked out by the student
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

    var chosen = S.pick.map(function (i) { return { i: i, lambda: P.HG_LINES[i].lambda, d: S.hg[i] }; })
      .sort(function (a, b) { return a.lambda - b.lambda; });

    var method = '<div class="card"><h3>The working</h3>' +
      '<p>Three lines give three equations in λ<sub>0</sub>, C and d<sub>0</sub>. Eliminate λ<sub>0</sub> by subtracting them in pairs:</p>' +
      '<p class="formula">λ₁ − λ₂ = C [ 1/(d₁ − d₀) − 1/(d₂ − d₀) ],  λ₂ − λ₃ = C [ 1/(d₂ − d₀) − 1/(d₃ − d₀) ]</p>' +
      '<p>Divide one by the other and C cancels, leaving one equation in d<sub>0</sub> alone:</p>' +
      '<p class="formula">(λ₁ − λ₂)(d₃ − d₂) ⁄ (λ₂ − λ₃)(d₂ − d₁) = (d₃ − d₀) ⁄ (d₁ − d₀) = R</p>' +
      '<p class="formula">d₀ = (R d₁ − d₃) ⁄ (R − 1)</p>' +
      '<p>Put d<sub>0</sub> back into the first equation for C, then into λ = λ<sub>0</sub> + C ⁄ (d − d<sub>0</sub>) for λ<sub>0</sub>. Work to four decimal places in d<sub>0</sub>: the constants are sensitive to it.</p>' +
      (chosen.length === 3 ? '<div class="tablewrap"><table><caption>Your three equations</caption>' +
        '<thead><tr><th>Line</th><th class="num">λ (Å)</th><th class="num">d (cm)</th></tr></thead><tbody>' +
        chosen.map(function (c, k) {
          return '<tr><td>' + ["λ₁, d₁", "λ₂, d₂", "λ₃, d₃"][k] + '</td><td class="num">' +
            fmt(c.lambda, 2) + '</td><td class="num">' + fmt(c.d, 3) + '</td></tr>';
        }).join("") + '</tbody></table></div>' : "") +
      '</div>';

    var h = studentHartmann();
    var entry = '<div class="card"><h3>Your constants</h3>' +
      '<p class="formula">λ = λ₀ + C ⁄ (d − d₀)</p>' +
      '<div class="wkrow"><label>λ₀ (Å) ' + numInput("hart", "lam0", S.work.hart.lam0) + '</label>' +
      '<label>C (Å·cm) ' + numInput("hart", "C", S.work.hart.C) + '</label>' +
      '<label>d₀ (cm) ' + numInput("hart", "d0", S.work.hart.d0) + '</label></div>' +
      workBox("hart", "Your working") + '</div>';

    var test = "", chart = "";
    if (h) {
      var rows = got.map(function (g) {
        var lam = P.lambdaFromHartmann(h, g.d);
        return { g: g, lam: lam, dev: lam - g.lambda, used: S.pick.indexOf(g.i) >= 0 };
      });
      var used = rows.filter(function (r) { return r.used; });
      var worstUsed = Math.max.apply(null, used.map(function (r) { return Math.abs(r.dev); }));
      var rms = Math.sqrt(rows.reduce(function (a, r) { return a + r.dev * r.dev; }, 0) / rows.length);

      test = '<div class="tablewrap"><table><caption>Table 2 — your constants applied to every line you measured</caption>' +
        '<thead><tr><th>Line</th><th class="num">d (cm)</th><th class="num">λ from your constants (Å)</th><th class="num">standard λ (Å)</th><th class="num">difference (Å)</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr class="' + (r.used ? "hit" : "") + '"><td>Hg ' + esc(r.g.name) + (r.used ? " (used)" : "") + '</td>' +
            '<td class="num">' + fmt(r.g.d, 3) + '</td><td class="num">' + fmt(r.lam, 2) + '</td>' +
            '<td class="num">' + fmt(r.g.lambda, 2) + '</td><td class="num">' + fmt(r.dev, 2) + '</td></tr>';
        }).join("") + '</tbody></table></div>';

      if (worstUsed > 0.5) {
        test += '<div class="note bad">Your constants do not reproduce the three lines you solved them from — the largest miss is ' +
          fmt(worstUsed, 2) + ' Å. That is an arithmetic slip rather than a measuring error: check d₀ first, since everything else follows from it.</div>';
      } else if (rms > 1.5) {
        test += '<div class="note warn">The three lines you used come back correctly, so the algebra is right, but the others are out by ' +
          fmt(rms, 2) + ' Å r.m.s. Either one of the other readings is wrong, or your three lines sit too close together to fix the curve.</div>';
      } else {
        test += '<div class="note">The three lines you solved from come back to within ' + fmt(worstUsed, 2) +
          ' Å, and the lines you did not use to within ' + fmt(rms, 2) + ' Å r.m.s. The calibration is sound; carry these constants forward.</div>';
      }
      chart = '<div class="chartbox" id="calChart"></div>';
    }

    return '<h2>Hartmann constants</h2>' +
      '<p>Hartmann\'s formula describes the dispersion of a prism instrument with three constants. Solve for them yourself from three of your mercury readings — the app will not do it for you. Once you enter them, every line you measured becomes a test of your arithmetic.</p>' +
      '<div class="card"><h3>Lines to solve from</h3>' + boxes +
      '<p style="margin:10px 0 0;font-size:.88rem;color:var(--ink-2)">Pick three, as far apart as the plate allows.</p></div>' +
      method + entry + test + chart + nav();
  }

  /* ============================================================
     Band heads — measure, then convert by hand
     ============================================================ */

  function stepHeads() {
    var h = studentHartmann();
    if (!h) {
      return '<h2>AlO band heads</h2><div class="note warn">Work out your Hartmann constants first — without them a comparator reading cannot be turned into a wavelength.</div>' + nav();
    }
    var req = requiredBands(), ext = extraBands();
    var checks = [];

    function rowsFor(list) {
      return list.map(function (b) {
        var k = b.vu + "," + b.vl;
        var d = S.bands[k];
        var v = isFinite(d) ? P.vernier(d) : null;
        var expect = isFinite(d) ? P.lambdaFromHartmann(h, d) : NaN;
        var c = isFinite(d) ? check(S.work.lam[k], expect, 0.8) : null;
        if (isFinite(d)) checks.push(c);
        return '<tr class="' + (isFinite(d) ? "" : "pending") + '">' +
          '<td>(' + b.vu + ", " + b.vl + ')</td>' +
          '<td class="num">' + (b.dv > 0 ? "+" : "") + b.dv + '</td>' +
          '<td class="num">' + (v ? fmt(v.msr, 2) : "—") + '</td>' +
          '<td class="num">' + (v ? v.vsd : "—") + '</td>' +
          '<td class="num">' + (isFinite(d) ? fmt(d, 3) : "—") + '</td>' +
          '<td class="num">' + (isFinite(d) ? numInput("lam", k, S.work.lam[k]) + " " + mark(c, "this λ does not follow from your constants and this reading") : "—") + '</td>' +
          '<td><button class="ghost" data-action="recordBand" data-k="' + k + '">' + (isFinite(d) ? "Re-record" : "Record") + '</button>' +
          (isFinite(d) ? ' <button class="link" data-action="clearBand" data-k="' + k + '">clear</button>' : '') + '</td>' +
          '</tr>';
      }).join("");
    }

    var head = '<thead><tr><th>Band (v′, v″)</th><th class="num">Δv</th><th class="num">M.S.R. (cm)</th><th class="num">V.S.D.</th><th class="num">d (cm)</th><th class="num">λ (Å), your calculation</th><th>Action</th></tr></thead>';
    var body = '<div class="tablewrap"><table><caption>Table 3 — band heads needed for the Deslandre table (v′ and v″ up to 3)</caption>' +
      head + '<tbody>' + rowsFor(req) + '</tbody></table></div>' +
      '<details><summary>Weaker bands with v′ or v″ above 3 (optional, they extend the table)</summary>' +
      '<div class="tablewrap" style="margin-top:10px"><table>' + head +
      '<tbody>' + rowsFor(ext) + '</tbody></table></div></details>';

    var done = bandEntries().length;
    return '' +
      '<h2>AlO band heads</h2>' +
      '<p>Each band is shaded to the red: a sharp edge on the violet side, fading away towards longer wavelength. Set the crosswire on that sharp edge — that is the band head. The five groups on the plate are the sequences Δv = +2, +1, 0, −1, −2; within a group the bands run in order of v′.</p>' +
      '<p>Record the reading, then substitute it into <em>your</em> constants and enter the wavelength you get. Keep two decimal places: the differences you take later are worth a few cm⁻¹, and rounding here will swamp them.</p>' +
      '<p class="formula">λ = ' + fmt(h.lam0, 2) + ' + (' + fmt(h.C, 1) + ') ⁄ (d − ' + fmt(h.d0, 4) + ')</p>' +
      '<div class="progress" style="margin-bottom:10px">' + done + ' of ' + req.length + ' bands of the main block recorded</div>' +
      body + tallyNote(tally(checks), "Record a head, then work out its wavelength.") + nav();
  }

  /* ============================================================
     Deslandre tables — the student converts to wavenumbers
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

    var checks = [];

    function grid(cellFor, caption) {
      var head = '<tr><th>v′ \\ v″</th>' + vls.map(function (v) { return '<th class="num">' + v + '</th>'; }).join("") + '</tr>';
      var body = vus.map(function (vu) {
        return '<tr><th class="num">' + vu + '</th>' + vls.map(function (vl) {
          var hit = e.filter(function (b) { return b.vu === vu && b.vl === vl; })[0];
          return hit ? cellFor(hit, vu === vl) : '<td class="empty"></td>';
        }).join("") + '</tr>';
      }).join("");
      return '<div class="tablewrap"><table class="des"><caption>' + caption + '</caption><thead>' + head + '</thead><tbody>' + body + '</tbody></table></div>';
    }

    var wavelengths = grid(function (b, diag) {
      return '<td class="num' + (diag ? " diag" : "") + '">' + fmt(b.lambda, 2) + '</td>';
    }, "Table 4 — your band heads in Å");

    var wavenumbers = grid(function (b, diag) {
      var expect = isFinite(b.lambda) ? 1e8 / b.lambda : NaN;
      var c = check(S.work.nu[b.key], expect, 2);
      checks.push(c);
      return '<td class="num' + (diag ? " diag" : "") + '">' + numInput("nu", b.key, S.work.nu[b.key]) + " " + mark(c, "check the conversion for this band") + '</td>';
    }, "Table 5 — the same heads in cm⁻¹, converted by you");

    return '<h2>Deslandre tables</h2>' +
      '<p>Every measured band head takes its place in the array. Bands along a diagonal share the same Δv and form a sequence; a row or a column is a progression.</p>' +
      wavelengths +
      '<p>The differences you need are differences of energy, not of wavelength, so the table has to be converted. Work each one out and enter it:</p>' +
      '<p class="formula">ν̃ (cm⁻¹) = 10⁸ ⁄ λ (Å)</p>' +
      wavenumbers +
      tallyNote(tally(checks), "Convert each wavelength in the table above.") +
      '<div class="note">Read across a row: the spacing between neighbouring columns is a vibrational quantum of the lower state. Read down a column: the spacing between neighbouring rows belongs to the upper state.</div>' +
      nav();
  }

  /* ============================================================
     The two electronic states — differences taken by hand
     ============================================================ */

  function stateStep(which) {
    var a = analysis();
    var key = which === "upper" ? "up" : "lo";
    var w = S.work[key];
    var pr = which === "upper" ? "′" : "″";
    var lit = which === "upper"
      ? { we: P.LIT.we_u, wexe: P.LIT.wexe_u, xe: P.LIT.xe_u }
      : { we: P.LIT.we_l, wexe: P.LIT.wexe_l, xe: P.LIT.xe_l };
    var along = which === "upper" ? "column" : "row";

    if (!a || !a[which].first.length) {
      return '<div class="note warn">Not enough of the wavenumber table is filled in yet. You need at least three successive ' +
        (which === "upper" ? "rows" : "columns") + ' of it before the differences can be taken.</div>';
    }
    var st = a[which];
    var checks = [];

    /* the pairs the student should subtract, straight from their own table */
    var pairs = st.first.slice(0, 3).map(function (f, i) {
      var terms = f.terms.map(function (t) {
        var idx = t.vl !== undefined ? t.vl : t.vu;
        return (which === "upper" ? "v″ = " : "v′ = ") + idx;
      });
      return { i: i, v: f.v, expected: f.value, terms: terms };
    });

    var rows = pairs.map(function (p) {
      var c = check(w.dg[p.i], p.expected, 2.0);
      checks.push(c);
      return '<tr><td>ΔG' + pr + '(' + p.v + ' + ½) = G' + pr + '(' + (p.v + 1) + ') − G' + pr + '(' + p.v + ')</td>' +
        '<td>' + esc(p.terms.join(",  ")) + '</td>' +
        '<td class="num">' + numInput("dg-" + key, String(p.i), w.dg[p.i]) + " " + mark(c, "this difference does not match your own table") + '</td></tr>';
    }).join("");

    var dgs = w.dg.map(numOf);
    var expD2 = (isFinite(dgs[0]) && isFinite(dgs[1])) ? dgs[0] - dgs[1] : NaN;
    var cD2 = check(w.d2, expD2, 1.0);
    var expWexe = isFinite(numOf(w.d2)) ? numOf(w.d2) / 2 : NaN;
    var cWexe = check(w.wexe, expWexe, 0.6);
    var expWe = (isFinite(dgs[0]) && isFinite(numOf(w.d2))) ? dgs[0] + numOf(w.d2) : NaN;
    var cWe = check(w.we, expWe, 1.5);
    var expXe = (isFinite(numOf(w.wexe)) && isFinite(numOf(w.we)) && numOf(w.we)) ? numOf(w.wexe) / numOf(w.we) : NaN;
    var cXe = check(w.xe, expXe, 0.0004);
    checks.push(cD2, cWexe, cWe, cXe);

    var second = '<div class="tablewrap"><table><caption>Second difference and the constants</caption>' +
      '<thead><tr><th>Quantity</th><th>From</th><th class="num">Your value</th></tr></thead><tbody>' +
      '<tr><td>Δ²G' + pr + ' = ΔG' + pr + '(½) − ΔG' + pr + '(3/2)</td><td>your two differences above</td>' +
      '<td class="num">' + numInput("d2-" + key, "d2", w.d2) + " " + mark(cD2) + '</td></tr>' +
      '<tr><td>ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' = Δ²G' + pr + ' ⁄ 2</td><td>half of the line above</td>' +
      '<td class="num">' + numInput("d2-" + key, "wexe", w.wexe) + " " + mark(cWexe) + '</td></tr>' +
      '<tr><td>ω<sub>e</sub>' + pr + ' = ΔG' + pr + '(½) + 2ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + '</td><td>first difference plus the second difference</td>' +
      '<td class="num">' + numInput("d2-" + key, "we", w.we) + " " + mark(cWe) + '</td></tr>' +
      '<tr><td>x<sub>e</sub>' + pr + ' = ω<sub>e</sub>' + pr + 'x<sub>e</sub>' + pr + ' ⁄ ω<sub>e</sub>' + pr + '</td><td>the two lines above</td>' +
      '<td class="num">' + numInput("d2-" + key, "xe", w.xe) + " " + mark(cXe) + '</td></tr>' +
      '</tbody></table></div>';

    var strip = "";
    if (isFinite(numOf(w.we))) {
      strip = '<div class="result-strip">' +
        resultCell("ω<sub>e</sub>" + pr, fmt(numOf(w.we), 1) + " cm⁻¹", "literature " + fmt(lit.we, 1)) +
        resultCell("ω<sub>e</sub>" + pr + "x<sub>e</sub>" + pr, fmt(numOf(w.wexe), 2) + " cm⁻¹", "literature " + fmt(lit.wexe, 2)) +
        resultCell("x<sub>e</sub>" + pr, fmt(numOf(w.xe), 5), "literature " + fmt(lit.xe, 5)) +
        '</div>';
    }

    return '<p>Take each difference from your own wavenumber table: subtract two entries in the same ' + along +
      '. Where a ' + along + ' gives more than one value for the same interval, average them and enter the mean.</p>' +
      '<div class="tablewrap"><table><caption>First differences ΔG' + pr + '(v + ½), in cm⁻¹</caption>' +
      '<thead><tr><th>Interval</th><th>Available from ' + (which === "upper" ? "columns" : "rows") + '</th><th class="num">Your value</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>' +
      second + strip +
      tallyNote(tally(checks), "Work down the tables above.") +
      '<div class="card">' + workBox(key, "Your working — subtractions, averages and the substitution into each formula") + '</div>';
  }

  function stepUpper() {
    return '<h2>Vibrational quanta of the upper state B²Σ⁺</h2>' + stateStep("upper") +
      '<div class="note">Each ΔG′ comes from subtracting two entries in the same column of your wavenumber table, so a column missing a band simply contributes nothing to that average.</div>' + nav();
  }
  function stepLower() {
    return '<h2>Vibrational quanta of the lower state X²Σ⁺</h2>' + stateStep("lower") +
      '<div class="note">Here the differences run along a row. Note that ν̃ falls as v″ rises, so the difference is the left entry minus the right one.</div>' + nav();
  }

  function resultCell(label, value, extra) {
    return '<div><div class="v">' + value + '</div><div class="l">' + label + '</div><div class="e">' + (extra || "") + '</div></div>';
  }

  /* ============================================================
     Step 8 — graphs
     ============================================================ */

  function stepGraphs() {
    return '<h2>Graphs</h2>' +
      '<p>Three plots come out of your figures. The Birge–Sponer lines are drawn through the first differences you entered, and are an independent check on them: the intercept should be your ω<sub>e</sub> and the slope −2ω<sub>e</sub>x<sub>e</sub>. A point off the line is a difference worth re-working.</p>' +
      '<div id="graphHost"></div>' +
      '<div class="note">These go into the report as they stand. Everything you download from this site is a single PDF, so there is nothing to collect separately.</div>' +
      nav();
  }

  var GRAPHS = {};

  /* a straight line through the student's own differences */
  function fitOf(points) {
    var f = P.linfit(points);
    if (!f) return null;
    return { slope: f.m, intercept: f.c, r2: f.r2, we: f.c, wexe: -f.m / 2 };
  }

  function buildGraphs() {
    var host = el("graphHost");
    var a = analysis();
    var e = bandEntries();
    var out = "";
    GRAPHS = { calibration: GRAPHS.calibration };
    calChartSVG();

    if (studentHartmann() && plate && e.length) {
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
        var st = a[w];
        var typed = (w === "upper" ? S.work.up : S.work.lo).dg
          .map(function (v, i) { return [i + 1, numOf(v)]; })
          .filter(function (p) { return isFinite(p[1]); });
        var pts = typed.length >= 2 ? typed : st.first.map(function (f) { return [f.v + 1, f.value]; });
        var bs = typed.length >= 2 ? fitOf(typed) : st.birgeSponer;
        if (!bs) return;
        var key = w === "upper" ? "bsUpper" : "bsLower";
        GRAPHS[key] = root.Charts.scatterFit({
          points: pts,
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
    var H = studentHartmann();
    if (!H) { GRAPHS.calibration = null; return; }
    var pts = hgEntries().filter(function (h) { return isFinite(h.d); }).map(function (h) { return [h.d, h.lambda]; });
    GRAPHS.calibration = root.Charts.calibrationChart({
      points: pts,
      curve: function (d) { return P.lambdaFromHartmann(H, d); },
      title: "Hartmann dispersion curve",
      annotation: "λ0 = " + fmt(H.lam0, 1) + " Å, C = " + fmt(H.C, 0) + ", d0 = " + fmt(H.d0, 3) + " cm"
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
    var r = workResults();
    if (!isFinite(r.upper.we) && !isFinite(r.lower.we)) {
      return '<h2>Result</h2><div class="note warn">Work out the constants for at least one of the states first.</div>' + nav();
    }
    return '<h2>Result</h2>' + resultTable(r) +
      '<p>Both quanta should be a few hundred cm⁻¹ up on a thousand, with the ground state the larger of the two, and both anharmonicities small, positive and around half a per cent of ω<sub>e</sub>. If yours are not, the fault is upstream: go back to the difference that is marked ✗.</p>' +
      '<div class="card"><label class="field"><span>Sources of error and remarks</span>' +
      '<textarea data-answer="errors" placeholder="Setting the crosswire on a shaded band head, choice of mercury lines, rounding in the conversion to cm⁻¹, the assumption that the second difference is constant…">' + esc(S.answers.errors) + '</textarea></label></div>' +
      nav();
  }

  function resultTable(r) {
    function row(label, got, lit, dp) {
      var err = isFinite(got) && lit ? Math.abs(got - lit) / lit * 100 : NaN;
      return '<tr><td>' + label + '</td><td class="num">' + fmt(got, dp) + '</td><td class="num">' + fmt(lit, dp) + '</td><td class="num">' + fmt(err, 1) + '</td></tr>';
    }
    return '<div class="tablewrap"><table><caption>Table 6 — vibrational constants of AlO</caption>' +
      '<thead><tr><th>Quantity</th><th class="num">Your value</th><th class="num">Literature</th><th class="num">Difference (%)</th></tr></thead><tbody>' +
      row("ω<sub>e</sub>′ (cm⁻¹), upper state B²Σ⁺", r.upper.we, P.LIT.we_u, 1) +
      row("ω<sub>e</sub>′x<sub>e</sub>′ (cm⁻¹)", r.upper.wexe, P.LIT.wexe_u, 2) +
      row("x<sub>e</sub>′", r.upper.xe, P.LIT.xe_u, 5) +
      row("ω<sub>e</sub>″ (cm⁻¹), lower state X²Σ⁺", r.lower.we, P.LIT.we_l, 1) +
      row("ω<sub>e</sub>″x<sub>e</sub>″ (cm⁻¹)", r.lower.wexe, P.LIT.wexe_l, 2) +
      row("x<sub>e</sub>″", r.lower.xe, P.LIT.xe_l, 5) +
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
    var p = progress();
    var missing = [];
    if (!p.hart) missing.push("the Hartmann constants");
    if (!p.bands) missing.push("at least ten band heads with their wavelengths");
    if (!p.upper) missing.push("the constants for the upper state");
    if (!p.lower) missing.push("the constants for the lower state");
    if (!p.viva) missing.push("the four questions");

    return '<h2>Report and submission</h2>' +
      (missing.length ? '<div class="note warn">Still outstanding: ' + esc(missing.join("; ")) + '. You can still download what you have.</div>' : '') +
      '<div class="recordbar noprint" style="margin-bottom:14px">' +
      '<button class="primary" data-action="dlpdf">Download the report (PDF)</button>' +
      '<button class="ghost" data-action="print">Print this page</button>' +
      (root.VirtualLab && root.VirtualLab.configured()
        ? '<button class="primary" data-action="submit">Submit to the department</button>'
        : '<span class="progress">Online submission is not configured for this site.</span>') +
      '<span class="progress" id="submitMsg"></span>' +
      '</div>' +
      '<div class="note">The PDF is the record: your readings, your working, your tables and your graphs. It is the only file this site produces, so keep it — and hand it in even if you also submit online.</div>' +
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
    if (a === "dlpdf") { root.Report.downloadPDF(el("submitMsg")); return; }
    if (a === "submit") { root.Report.submit(el("submitMsg")); return; }
  }

  function onInput(ev) {
    var t = ev.target, d = t.dataset;
    if (d.student) { S.student[d.student] = t.value; save(); return; }
    if (d.answer) { S.answers[d.answer] = t.value; save(); return; }
    if (t.id === "drive") { view.setCursor(+t.value, false); syncReadout(); return; }

    /* the student's own arithmetic: store it, then re-render so the
       consistency marks and everything downstream keep up */
    if (d.hart) { S.work.hart[d.hart] = t.value; save(); reRender(t); return; }
    if (d.lam) { S.work.lam[d.lam] = t.value; save(); reRender(t); return; }
    if (d.nu) { S.work.nu[d.nu] = t.value; save(); reRender(t); return; }
    if (d.dgUp !== undefined) { S.work.up.dg[+d.dgUp] = t.value; save(); reRender(t); return; }
    if (d.dgLo !== undefined) { S.work.lo.dg[+d.dgLo] = t.value; save(); reRender(t); return; }
    if (d.d2Up) { S.work.up[d.d2Up] = t.value; save(); reRender(t); return; }
    if (d.d2Lo) { S.work.lo[d.d2Lo] = t.value; save(); reRender(t); return; }
    if (d.workNote) { S.work.notes[d.workNote] = t.value; save(); return; }
  }

  /* Re-rendering on every keystroke would move the caret, so the marks are
     refreshed when the field is left, or when the value looks finished. */
  var reTimer = null;
  function reRender(input) {
    clearTimeout(reTimer);
    var id = input.dataset ? JSON.stringify(input.dataset) : "";
    reTimer = setTimeout(function () {
      render();
      var again = document.querySelector('[data-' + Object.keys(input.dataset)[0].replace(/[A-Z]/g, function (c) { return "-" + c.toLowerCase(); }) + '="' + input.dataset[Object.keys(input.dataset)[0]] + '"]');
      if (again && again.focus) { again.focus(); if (again.setSelectionRange) { var v = again.value.length; try { again.setSelectionRange(v, v); } catch (e) {} } }
    }, 900);
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
    var H = P.hartmannFromThree(pts[0], pts[1], pts[2]);
    S.work.hart = { lam0: H.lam0.toFixed(2), C: H.C.toFixed(1), d0: H.d0.toFixed(4) };
    plate.bands.forEach(function (b) {
      var k = b.vu + "," + b.vl;
      S.bands[k] = b.d;
      var lam = P.lambdaFromHartmann(H, b.d);
      S.work.lam[k] = lam.toFixed(2);
      S.work.nu[k] = (1e8 / lam).toFixed(1);
    });
    var a = analysis();
    ["upper", "lower"].forEach(function (w) {
      var key = w === "upper" ? "up" : "lo", st = a[w];
      S.work[key].dg = [0, 1, 2].map(function (i) { return st.first[i] ? st.first[i].value.toFixed(1) : ""; });
      var d2 = numOf(S.work[key].dg[0]) - numOf(S.work[key].dg[1]);
      S.work[key].d2 = d2.toFixed(2);
      S.work[key].wexe = (d2 / 2).toFixed(2);
      S.work[key].we = (numOf(S.work[key].dg[0]) + d2).toFixed(1);
      S.work[key].xe = (numOf(S.work[key].wexe) / numOf(S.work[key].we)).toFixed(5);
    });
    save(); render();
    toast("Demonstration data filled in, arithmetic and all.");
  }

  /* ---------- boot ---------- */

  function boot() {
    if (root.VirtualLab) root.VirtualLab.masthead(el("masthead"));
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
    workResults: workResults,
    studentHartmann: studentHartmann,
    work: function () { return S.work; },
    /* a picture of the plate, with the readings the student took marked on it */
    plateImage: function (source) {
      if (!view || !plate) return null;
      var marks = source === "hg"
        ? hgEntries().filter(function (h) { return isFinite(h.d); })
          .map(function (h) { return { d: h.d, label: fmt(h.lambda, 0) }; })
        : bandEntries().map(function (b) { return { d: b.d, label: "(" + b.vu + "," + b.vl + ")" }; });
      return view.snapshot({ source: source, marks: marks });
    },
    bandEntries: bandEntries,
    hgEntries: hgEntries,
    resultTable: resultTable,
    questions: QUESTIONS,
    fmt: fmt
  };

})(window);
