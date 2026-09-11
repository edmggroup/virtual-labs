/* A student's-eye check of the analysis.

   Works the experiment the way a student does — only the fourteen bands the
   Deslandre block needs, wavelengths rounded as they would be written down —
   then puts every classic mistake through it and checks that the app both
   catches it and says something useful about it.

   Run: NODE_PATH=<jsdom> node tests/analysis-check.js                     */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const errors = [];
const note = (...a) => console.log(...a);

function boot(register) {
  const ctx = new Proxy({}, {
    get(t, k) {
      if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 40 });
      return () => {};
    }
  });
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/x/' });
  const w = dom.window;
  w.HTMLCanvasElement.prototype.getContext = () => ctx;
  w.HTMLCanvasElement.prototype.toDataURL = () => 'data:,';
  Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientWidth', { get: () => 900 });
  Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientHeight', { get: () => 130 });
  w.scrollTo = () => {}; w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x';
  w.fetch = () => Promise.resolve({ ok: true });
  global.Blob = w.Blob;
  for (const f of ['../../shared/js/config.js', 'js/meta.js', '../../shared/js/lab-submit.js',
    '../../shared/js/pdf.js', '../../shared/js/report-doc.js',
    'js/physics.js', 'js/spectrum.js', 'js/charts.js', 'js/report.js', 'js/app.js']) {
    w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const rail = () => w.document.querySelectorAll('.rail button');
  const open = i => rail()[i].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const type = (sel, v) => {
    const el = w.document.querySelector(sel);
    el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };
  open(3);
  type('[data-student="name"]', 'Student');
  type('[data-student="register"]', register);
  w.document.querySelector('[data-action="mount"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  return { w, open, rail };
}

/* A careful student: three well-spread mercury lines, the fourteen bands of
   the main block, wavelengths to 0.01 Å and wavenumbers to 0.1 cm⁻¹. */
function workThrough(w, opts = {}) {
  const P = w.AlOPhysics;
  const S = w.LabState.state;
  const plate = w.LabState.plate;

  plate.hg.forEach((l, i) => { S.hg[i] = l.d; });
  S.pick = [0, 3, 6];
  const pts = S.pick.map(i => ({ lambda: P.HG_LINES[i].lambda, d: S.hg[i] }));
  const h = P.hartmannFromThree(pts[0], pts[1], pts[2]);
  S.work.hart = { lam0: h.lam0.toFixed(2), C: h.C.toFixed(1), d0: h.d0.toFixed(4) };
  const H = { lam0: +S.work.hart.lam0, C: +S.work.hart.C, d0: +S.work.hart.d0 };

  const wanted = plate.bands.filter(b =>
    b.vu <= 3 && b.vl <= 3 && !(opts.skip && opts.skip(b)));
  wanted.forEach(b => {
    const k = b.vu + ',' + b.vl;
    S.bands[k] = b.d;
    const lam = +P.lambdaFromHartmann(H, b.d).toFixed(2);
    S.work.lam[k] = lam.toFixed(2);
    S.work.nu[k] = (1e8 / lam).toFixed(1);
  });
  return { bands: wanted.length, hartmann: H };
}

/* what the student would write down, each interval from one column or row */
function differences(w, which, from = 'mean') {
  const a = w.LabState.analysis();
  const st = a[which];
  const byV = {};
  st.first.forEach(f => { byV[f.v] = f; });
  return [0, 1, 2].map(v => {
    const f = byV[v];
    if (!f) return '';
    if (from === 'mean') return f.value.toFixed(1);
    return f.terms[0].value.toFixed(1);     // one column, as the manual allows
  });
}

function fillState(w, which, dg) {
  const S = w.LabState.state;
  const key = which === 'upper' ? 'up' : 'lo';
  S.work[key].dg = dg.slice();
  const d2 = (+dg[0]) - (+dg[1]);
  S.work[key].d2 = d2.toFixed(2);
  S.work[key].wexe = (d2 / 2).toFixed(2);
  S.work[key].we = ((+dg[0]) + d2).toFixed(1);
  S.work[key].xe = ((d2 / 2) / ((+dg[0]) + d2)).toFixed(5);
  return S.work[key];
}

function marksOn(w, open, stepIndex) {
  open(stepIndex);
  const html = w.document.getElementById('steps').innerHTML;
  return {
    ok: (html.match(/mark ok/g) || []).length,
    off: (html.match(/mark off/g) || []).length,
    html
  };
}

/* ---------- 1. a correct student, on four different plates ---------- */

note('\n1. A student who does it correctly, using only the fourteen required bands\n');
for (const reg of ['2447101', 'AB-19', 'MPH-2026-07', '2447128']) {
  const { w, open } = boot(reg);
  const info = workThrough(w);
  const P = w.AlOPhysics;

  fillState(w, 'upper', differences(w, 'upper'));
  fillState(w, 'lower', differences(w, 'lower'));

  const up = marksOn(w, open, 8);
  const lo = marksOn(w, open, 9);
  const r = w.LabState.workResults();
  const eU = Math.abs(r.upper.we - P.LIT.we_u) / P.LIT.we_u * 100;
  const eL = Math.abs(r.lower.we - P.LIT.we_l) / P.LIT.we_l * 100;
  const xU = Math.abs(r.upper.xe - P.LIT.xe_u) / P.LIT.xe_u * 100;
  const xL = Math.abs(r.lower.xe - P.LIT.xe_l) / P.LIT.xe_l * 100;

  note('  ' + reg.padEnd(12) + info.bands + ' bands  |  ωe′ ' + r.upper.we.toFixed(1) +
    ' (' + eU.toFixed(2) + '%)  ωe″ ' + r.lower.we.toFixed(1) + ' (' + eL.toFixed(2) + '%)' +
    '  |  xe′ off ' + xU.toFixed(1) + '%  xe″ off ' + xL.toFixed(1) + '%' +
    '  |  flagged: ' + (up.off + lo.off));

  if (up.off + lo.off) errors.push(reg + ': a correct student was flagged ' + (up.off + lo.off) + ' time(s)');
  if (eU > 0.5 || eL > 0.5) errors.push(reg + ': ωe out by more than half a per cent');
  if (xU > 12 || xL > 12) errors.push(reg + ': xe out by more than 12 per cent');
}

/* ---------- 2. one column instead of the mean ---------- */

note('\n2. A student who takes each interval from a single column or row, as the manual allows\n');
{
  const { w, open } = boot('2447101');
  workThrough(w);
  fillState(w, 'upper', differences(w, 'upper', 'one'));
  fillState(w, 'lower', differences(w, 'lower', 'one'));
  const up = marksOn(w, open, 8), lo = marksOn(w, open, 9);
  note('  flagged: ' + (up.off + lo.off) + '  (should be 0)');
  if (up.off + lo.off) errors.push('a single-column derivation was flagged as wrong');
}

/* ---------- 3. the classic mistakes ---------- */

note('\n3. Each classic mistake: is it caught, and is the student told what it is?\n');

function mistake(name, apply, stepIndex, expect) {
  const { w, open } = boot('2447101');
  workThrough(w);
  fillState(w, 'upper', differences(w, 'upper'));
  fillState(w, 'lower', differences(w, 'lower'));
  apply(w);
  const m = marksOn(w, open, stepIndex);
  const said = expect.test(m.html);
  const advice = (m.html.match(/<strong>What to look at:<\/strong>[\s\S]*?<\/ul>/) || [''])[0]
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  note('  ' + name.padEnd(44) + 'flagged: ' + (m.off > 0 ? 'yes' : 'NO') + '  |  named: ' + (said ? 'yes' : 'NO'));
  if (advice) note('      → ' + advice);
  if (!m.off) errors.push(name + ': not flagged');
  if (!said) errors.push(name + ': flagged but not explained');
}

// upper-state difference taken along a row (the row/column swap)
mistake('rows and columns swapped', w => {
  const lo = differences(w, 'lower');
  w.LabState.state.work.up.dg[0] = lo[0];
}, 8, /quantum of the other state/);

// subtracted the wrong way round
mistake('subtracted the wrong way round', w => {
  const up = differences(w, 'upper');
  w.LabState.state.work.up.dg[0] = (-Math.abs(+up[0])).toFixed(1);
}, 8, /wrong way round/);

// forgot to halve the second difference
mistake('ωexe taken as Δ²G rather than half', w => {
  w.LabState.state.work.up.wexe = w.LabState.state.work.up.d2;
}, 8, /halve it/);

// forgot to add the second difference
mistake('ωe taken as the first difference alone', w => {
  w.LabState.state.work.up.we = w.LabState.state.work.up.dg[0];
}, 8, /Add the whole second difference/);

// xe upside down
mistake('xe inverted', w => {
  const k = w.LabState.state.work.up;
  k.xe = (+k.we / +k.wexe).toFixed(3);
}, 8, /other way up/);

/* ---------- 4. a table missing the first interval ---------- */

note('\n4. A table with no v′ = 0 bands at all: the boxes must not shift\n');
{
  const { w, open } = boot('2447101');
  workThrough(w, { skip: b => b.vu === 0 });
  const a = w.LabState.analysis();
  const firstV = a.upper.first[0].v;
  const m = marksOn(w, open, 8);
  const labelled = /ΔG′\(0 \+ ½\)/.test(m.html);
  const saysMissing = /Not available from your table yet/.test(m.html);
  note('  first interval the table can offer: ΔG′(' + firstV + ' + ½)' +
    '  |  box for ΔG′(½) still shown: ' + labelled +
    '  |  says why it is empty: ' + saysMissing);
  if (firstV === 0) errors.push('the missing-row case did not actually remove the first interval');
  if (!labelled || !saysMissing) {
    errors.push('with the first interval missing, the boxes shifted instead of saying so');
  }
  // and ωe must not be computed from the wrong interval
  const S = w.LabState.state;
  S.work.up.dg = ['', a.upper.first[0].value.toFixed(1), a.upper.first[1].value.toFixed(1)];
  const m2 = marksOn(w, open, 8);
  note('  with ΔG′(½) left blank, entries flagged: ' + m2.off + ' (should be 0 — blanks are not errors)');
  if (m2.off) errors.push('a blank first interval was reported as a wrong answer');
}

if (errors.length) {
  console.log('\nERRORS:');
  errors.forEach(e => console.log(' - ' + e));
  process.exit(1);
}
console.log('\nno errors');
