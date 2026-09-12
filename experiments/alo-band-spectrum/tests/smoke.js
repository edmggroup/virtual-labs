/* Headless walk-through of the whole experiment. Canvas is stubbed. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'canvas') return { width: 800, height: 100 };
    if (k === 'measureText') return () => ({ width: 40 });
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    return () => {};
  }
});

const dom = new JSDOM(html, {
  runScripts: 'outside-only',
  pretendToBeVisual: true,
  url: 'https://example.org/alo/?demo=1'
});
const { window } = dom;

window.HTMLCanvasElement.prototype.getContext = () => ctxStub;
window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,';
Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientWidth', { get: () => 900 });
Object.defineProperty(window.HTMLCanvasElement.prototype, 'clientHeight', { get: () => 130 });
window.scrollTo = () => {};
window.print = () => {};
window.URL.createObjectURL = () => 'blob:x';
window.URL.revokeObjectURL = () => {};
window.fetch = () => Promise.resolve({ ok: true });

const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + e.message));

const SCRIPTS = ['../../shared/js/config.js', 'js/meta.js', '../../shared/js/lab-submit.js',
  '../../shared/js/pdf.js', '../../shared/js/report-doc.js',
  '../../shared/js/formula.js', '../../shared/js/bench-tools.js',
  'js/physics.js', 'js/spectrum.js', 'js/charts.js', 'js/report.js', 'js/app.js'];
for (const f of SCRIPTS) {
  try { window.eval(fs.readFileSync(path.join(root, f), 'utf8')); }
  catch (e) { errors.push('load ' + f + ': ' + e.stack.split('\n').slice(0, 3).join(' | ')); }
}

window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

function click(sel) {
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('no element ' + sel);
  el.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
}
function setInput(sel, value) {
  const el = window.document.querySelector(sel);
  if (!el) throw new Error('no input ' + sel);
  el.value = value;
  el.dispatchEvent(new window.Event('input', { bubbles: true }));
}

try {
  // step 1: identity + mount
  const S = window.LabState.state;
  window.document.querySelectorAll('.rail button')[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  setInput('[data-student="name"]', 'Test Student');
  setInput('[data-student="register"]', '2447101');
  click('[data-action="mount"]');
  console.log('plate mounted:', !!window.LabState.plate, '| bands on plate:', window.LabState.plate.bands.length);

  // demo fill
  click('[data-action="fillall"]');
  const a = window.LabState.analysis();
  console.log('recorded bands:', window.LabState.bandEntries().length);
  console.log('hartmann:', JSON.stringify(S.hart).slice(0, 90));
  console.log('upper we =', a.upper.we.toFixed(2), ' xe =', a.upper.xe.toFixed(5));
  console.log('lower we =', a.lower.we.toFixed(2), ' xe =', a.lower.xe.toFixed(5));

  // walk every step
  const rail = () => window.document.querySelectorAll('.rail button');
  const nSteps = rail().length;
  console.log('steps in the rail:', nSteps);
  for (let i = 0; i < nSteps; i++) {
    rail()[i].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const body = window.document.getElementById('steps').innerHTML;
    if (!body || body.length < 60) errors.push('step ' + i + ' rendered almost nothing');
    process.stdout.write('  step ' + i + ' -> ' + body.length + ' chars\n');
  }

  // answers
  const qa = window.document.querySelector('[data-answer="q1"]');
  if (qa) { qa.value = 'answer'; qa.dispatchEvent(new window.Event('input', { bubbles: true })); }

  // report + graphs
  rail()[10].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const g = window.LabState.graphs;
  console.log('graphs:', Object.keys(g).join(', '));
  rail()[13].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const rep = window.document.getElementById('reportHost').innerHTML;
  console.log('report length:', rep.length);
  fs.writeFileSync(path.join(__dirname, '..', 'docs', 'sample-report.html'),
    '<!doctype html><meta charset=utf-8><link rel=stylesheet href=../../../shared/css/base.css><div class=report>' + rep + '</div>');

  // the student's arithmetic must come back consistent after the demo fill
  let ticks = 0, crosses = 0;
  for (const i of [5, 6, 7, 8, 9]) {
    rail()[i].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const body = window.document.getElementById('steps').innerHTML;
    ticks += (body.match(/mark ok/g) || []).length;
    crosses += (body.match(/mark off/g) || []).length;
  }
  console.log('consistency marks — ok:', ticks, 'off:', crosses);
  if (!ticks) errors.push('no consistency checks passed after the demo fill');
  if (crosses) errors.push(crosses + ' checks failed on data the app generated itself');

  // a wrong entry must be caught
  rail()[8].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const dg = window.document.querySelector('[data-dg-up="0"]');
  dg.value = '900'; dg.dispatchEvent(new window.Event('input', { bubbles: true }));
  window.LabState.state.work.up.dg[0] = '900';
  rail()[8].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const bad = (window.document.getElementById('steps').innerHTML.match(/mark off/g) || []).length;
  console.log('after typing a wrong first difference, entries flagged:', bad);
  if (!bad) errors.push('a wrong difference was not flagged');
  window.LabState.state.work.up.dg[0] = String(window.LabState.analysis().upper.first[0].value.toFixed(1));

  // comparator interaction
  rail()[6].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  setInput('#drive', String(window.LabState.plate.bands[3].d + 0.02));
  window.document.querySelector('[data-nudge="-0.001"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log('readout:', window.document.getElementById('readBig').textContent.trim(),
    '|', window.document.getElementById('readParts').textContent);
} catch (e) {
  errors.push('walk: ' + e.stack.split('\n').slice(0, 4).join(' | '));
}

// the calculator and the look-back panel
try {
  const doc = window.document;
  const launch = doc.getElementById('benchLaunch');
  const panel = doc.getElementById('benchPanel');
  if (!launch || !panel) throw new Error('the tools panel was never built');
  if (!panel.hidden) errors.push('the tools panel starts open');

  // open it from the upper-state step, on the reference tab
  window.document.querySelectorAll('.rail button')[8]
    .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const refBtn = doc.querySelector('[data-action="showRef"]');
  if (!refBtn) throw new Error('no button to show the table');
  refBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const ref = doc.getElementById('benchRef').innerHTML;
  const cells = (ref.match(/<td class="num">/g) || []).length;
  console.log('reference panel: open =', !panel.hidden, '| wavenumber cells shown =', cells,
    '| says which way to subtract =', /down a column/.test(ref));
  if (panel.hidden) errors.push('the panel did not open');
  if (cells < 10) errors.push('the wavenumber table was not carried into the panel');
  if (!/down a column/.test(ref)) errors.push('the panel does not say which way to subtract');

  // the calculator
  doc.querySelector('[data-bench-tab="calc"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const input = doc.getElementById('benchInput');
  const sums = [['20652.3 − 19687.0', '965.3'], ['(862.8 - 855.9)', '6.9'], ['3.45/869.7', '0.003967']];
  sums.forEach(([src, want]) => {
    input.value = src;
    doc.querySelector('[data-bench-key="="]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    const top = doc.querySelector('#benchTape li b');
    const got = top ? top.textContent : '';
    console.log('  calculator:', src.padEnd(20), '=', got);
    if (Math.abs(parseFloat(got) - parseFloat(want)) > Math.abs(parseFloat(want)) * 0.001) {
      errors.push('calculator got ' + src + ' wrong: ' + got);
    }
  });
  input.value = '4/(';
  doc.querySelector('[data-bench-key="="]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const bad = doc.querySelector('#benchTape li b').textContent;
  console.log('  nonsense in:', JSON.stringify(bad));
  if (/\d/.test(bad)) errors.push('the calculator invented an answer for nonsense');
  if ((doc.querySelectorAll('#benchTape li').length) < 4) errors.push('the tape is not keeping its lines');
} catch (e) {
  errors.push('bench tools: ' + e.message);
}

// submitting finishes the experiment: the working must be gone afterwards
try {
  const S = window.LabState.state;
  const before = window.LabState.bandEntries().length;
  window.confirm = () => true;
  window.LabState.finish();
  const after = window.LabState.bandEntries().length;
  const reg = window.LabState.state.student.register;
  console.log('after finishing — bands kept:', after, '| register kept:', JSON.stringify(reg));
  if (before === 0) errors.push('nothing was recorded before the finish test');
  if (after !== 0) errors.push('readings survived a submission');
  if (reg !== '') errors.push('the candidate details survived a submission');
  const notice = window.document.getElementById('steps').innerHTML;
  if (!/Submitted\./.test(notice)) errors.push('no confirmation shown after submitting');
  if (!/fresh experiment/.test(notice)) errors.push('the fresh-start notice is missing');

  // nothing identifying the last candidate may remain anywhere on the page
  const page = window.document.body.innerHTML;
  ['Test Student', '2447101'].forEach(bit => {
    if (page.indexOf(bit) >= 0) errors.push('after submitting, the page still shows "' + bit + '"');
  });
  const who = window.document.getElementById('whoami');
  console.log('after submitting — masthead shows:', JSON.stringify(who ? who.textContent : ''),
    '| name or register anywhere on the page:', ['Test Student', '2447101'].some(b => page.indexOf(b) >= 0));
} catch (e) {
  errors.push('finish: ' + e.message);
}

// the reference panel must carry the wavenumber table onto the difference steps
try {
  const railBtns = () => window.document.querySelectorAll('.rail button');
  railBtns()[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  setInput('[data-student="name"]', 'Test Student');
  setInput('[data-student="register"]', '2447101');
  click('[data-action="mount"]');
  click('[data-action="fillall"]');
  railBtns()[8].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));   // upper state
  const ref = window.document.getElementById('benchRef');
  const text = ref ? ref.textContent.replace(/\s+/g, ' ') : '';
  const hasConstants = /Hartmann/.test(text);
  const hasGrid = /20652|v. . v./.test(text) || /cm⁻¹/.test(text);
  console.log('reference panel on the upper-state step — constants:', hasConstants, '| table:', hasGrid);
  if (!ref) errors.push('the reference panel is not on the page');
  if (!hasConstants || !hasGrid) errors.push('the reference panel does not carry the details from the earlier steps');
} catch (e) {
  errors.push('reference panel: ' + e.message);
}

// the bench tools: the calculator must work out what a student types, and the
// reference panel must carry the table they are working from
try {
  const bt = window.BenchTools;
  if (!bt) throw new Error('BenchTools did not load');
  const r1 = bt.evaluate ? bt.evaluate('20652.3 - 19687.0') : null;
  const calcInput = window.document.getElementById('benchInput');
  const calcOut = () => window.document.getElementById('benchTape');
  if (calcInput) {
    calcInput.value = '20652.3 - 19687.0';
    calcInput.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const tape = calcOut() ? calcOut().textContent : '';
    console.log('calculator tape:', tape.replace(/\s+/g, ' ').trim().slice(0, 60));
    if (tape.indexOf('965.3') < 0) errors.push('the calculator did not work out 20652.3 - 19687.0');
  } else {
    errors.push('the calculator input is not on the page');
  }
} catch (e) {
  errors.push('bench tools: ' + e.message);
}

// the PDF the student downloads (graphs need a canvas, so text and tables only)
(async () => {
  try {
    // rebuild a record to check the PDF path (the finish test emptied the state)
    const railBtns = () => window.document.querySelectorAll('.rail button');
    railBtns()[3].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    setInput('[data-student="name"]', 'Test Student');
    setInput('[data-student="register"]', '2447101');
    click('[data-action="mount"]');
    click('[data-action="fillall"]');
    const blocks = window.Report.blocks({ graphs: false });
    const doc = await window.ReportDoc.pdf(blocks, { title: 'test', header: 'h', footer: 'f' });
    const bytes = doc.bytes();
    const head = String.fromCharCode(...bytes.slice(0, 8));
    console.log('report blocks:', blocks.length, '| pdf bytes:', bytes.length, '| starts with', JSON.stringify(head.slice(0, 5)));
    if (!head.startsWith('%PDF-')) errors.push('the PDF does not start with a PDF header');
    if (bytes.length < 3000) errors.push('the PDF looks too small to hold the record');
    /* the illustrated sample is written by report-preview.js, which can
       rasterise the figures; this one only proves the text and tables */
  } catch (e) {
    errors.push('pdf: ' + e.message);
  }
  finish();
})();

function finish() {

if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nno errors');
}
