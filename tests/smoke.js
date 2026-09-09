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

const errors = [];
window.addEventListener('error', e => errors.push('window error: ' + e.message));

for (const f of ['js/config.js', 'js/physics.js', 'js/spectrum.js', 'js/charts.js', 'js/report.js', 'js/app.js']) {
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
    '<!doctype html><meta charset=utf-8><link rel=stylesheet href=../css/style.css><div class=report>' + rep + '</div>');

  // exports
  const csvBefore = errors.length;
  click('[data-action="dlcsv"]');
  click('[data-action="dlhtml"]');
  console.log('exports ran without throwing:', errors.length === csvBefore);

  // comparator interaction
  rail()[6].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  setInput('#drive', String(window.LabState.plate.bands[3].d + 0.02));
  window.document.querySelector('[data-nudge="-0.001"]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  console.log('readout:', window.document.getElementById('readBig').textContent.trim(),
    '|', window.document.getElementById('readParts').textContent);
} catch (e) {
  errors.push('walk: ' + e.stack.split('\n').slice(0, 4).join(' | '));
}

if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nno errors');
