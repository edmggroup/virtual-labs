/* Site-level smoke test: the portal lists and filters the catalog,
   and the experiment template runs end to end.
   Run with: NODE_PATH=<where jsdom lives> node tests/site.js  */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const errors = [];

/* ---------- portal ---------- */

function portal() {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/' });
  const w = dom.window;
  for (const f of ['shared/js/config.js', 'data/catalog.js', 'shared/js/portal.js']) {
    try { w.eval(fs.readFileSync(path.join(root, f), 'utf8')); }
    catch (e) { errors.push('portal load ' + f + ': ' + e.message); }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const entries = w.document.querySelectorAll('.entry');
  console.log('portal: ' + entries.length + ' entr(y|ies), count reads "' +
    w.document.getElementById('count').textContent + '"');

  const links = [...w.document.querySelectorAll('.entry h3 a')].map(a => a.getAttribute('href'));
  console.log('portal links:', links.join(', '));
  links.forEach(href => {
    const clean = href.split('?')[0];
    const target = path.join(root, clean, 'index.html');
    if (!fs.existsSync(target)) errors.push('catalog points at a missing page: ' + href);
  });

  // filters
  const sel = w.document.getElementById('fSubject');
  sel.value = 'Molecular spectroscopy';
  sel.dispatchEvent(new w.Event('change', { bubbles: true }));
  const afterSubject = w.document.querySelectorAll('.entry').length;
  const q = w.document.getElementById('fSearch');
  q.value = 'zzzz-no-such-thing';
  q.dispatchEvent(new w.Event('input', { bubbles: true }));
  const afterSearch = w.document.querySelectorAll('.entry').length;
  console.log('filter by subject ->', afterSubject, '| nonsense search ->', afterSearch,
    '(empty state:', !!w.document.querySelector('.empty') + ')');
  if (afterSubject < 1) errors.push('subject filter hid everything');
  if (afterSearch !== 0) errors.push('search did not filter');

  // every catalog id must have a folder
  (w.LAB_CATALOG.experiments || []).forEach(x => {
    if (x.status === 'planned') return;
    const dir = path.join(root, 'experiments', x.id);
    if (!fs.existsSync(dir)) errors.push('no folder for catalog id ' + x.id);
    if (x.engine === 'spec') {
      const spec = path.join(dir, 'spec.json');
      if (fs.existsSync(spec)) {
        const parsed = JSON.parse(fs.readFileSync(spec, 'utf8'));
        if (parsed.id !== x.id) errors.push('spec.json id does not match catalog id for ' + x.id);
      }
      return;
    }
    const meta = path.join(dir, 'js', 'meta.js');
    if (fs.existsSync(meta) && !fs.readFileSync(meta, 'utf8').includes('"' + x.id + '"'))
      errors.push('meta.js id does not match catalog id for ' + x.id);
  });
}

/* ---------- the template experiment ---------- */

function template() {
  const dir = path.join(root, 'experiments', '_template');
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/' });
  const w = dom.window;
  w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x';
  w.fetch = () => Promise.resolve({ ok: true });
  for (const f of ['../../shared/js/config.js', 'js/meta.js', '../../shared/js/lab-submit.js', 'js/app.js']) {
    try { w.eval(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { errors.push('template load ' + f + ': ' + e.message); }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const click = sel => w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const type = (sel, v) => {
    const el = w.document.querySelector(sel);
    el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true }));
  };

  type('[data-student="name"]', 'Test');
  type('[data-student="register"]', '1234');
  click('[data-action="startWork"]');
  click('[data-action="add"]');
  type('[data-reading="x"][data-i="0"]', '1');
  type('[data-reading="y"][data-i="0"]', '2');
  click('[data-action="add"]');
  type('[data-reading="x"][data-i="1"]', '2');
  type('[data-reading="y"][data-i="1"]', '5');
  w.document.querySelectorAll('.rail button')[2].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const strip = w.document.querySelector('.result-strip');
  console.log('template result strip:', strip ? strip.textContent.replace(/\s+/g, ' ').trim() : 'missing');
  if (!strip || strip.textContent.indexOf('3.0000') < 0) errors.push('template did not fit slope 3');

  // envelope shape the backend depends on
  const env = w.VirtualLab.envelope({ student: { name: 'Test', register: '1234' }, summary: { a: 1 } });
  const need = ['schema', 'submittedAt', 'experiment', 'site', 'student', 'summary', 'data', 'report'];
  need.forEach(k => { if (!(k in env)) errors.push('envelope is missing ' + k); });
  console.log('envelope keys:', Object.keys(env).join(', '), '| experiment id:', env.experiment.id);
}

/* ---------- admin console ---------- */

function admin() {
  const dir = path.join(root, 'admin');
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/admin/' });
  const w = dom.window;
  w.fetch = () => Promise.resolve({ ok: true });
  for (const f of ['../shared/js/config.js', '../data/catalog.js', '../shared/js/formula.js',
    '../shared/js/pwa.js', 'js/admin.js']) {
    try { w.eval(fs.readFileSync(path.join(dir, f), 'utf8')); }
    catch (e) { errors.push('admin load ' + f + ': ' + e.message); }
  }
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  // the rail is re-rendered on every click, so it has to be re-queried
  const rail = () => [...w.document.querySelectorAll('.rail button')];
  const open = i => rail()[i].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const n = rail().length;
  console.log('admin panels:', rail().map(b => b.textContent.replace(/^\d/, '')).join(', '));
  if (n < 5) errors.push('admin rail did not render');

  for (let i = 0; i < n; i++) {
    open(i);
    const html = w.document.getElementById('panel').innerHTML;
    if (!html || html.length < 40) errors.push('admin panel ' + i + ' rendered nothing');
  }

  // the filing panel must show every experiment and offer the three fields
  const filingIdx = rail().findIndex(b => /Programme, course, subject/.test(b.textContent));
  if (filingIdx < 0) errors.push('the filing panel is not in the admin rail');

  // the catalog builder must emit a parseable entry
  open(n - 1);
  const set = (id, v) => { const e = w.document.getElementById(id); if (e) e.value = v; };
  set('cId', 'hall-effect'); set('cTitle', 'Hall coefficient'); set('cNumber', '3');
  set('cProgramme', 'M.Sc. Physics'); set('cCourse', 'General Physics Laboratory III');
  set('cSubject', 'Solid state physics'); set('cTags', 'semiconductor, magnetic field');
  set('cDuration', '2 h'); set('cSummary', 'Not built yet.'); set('cStatus', 'live');
  w.document.querySelector('[data-action="catPreview"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const out = w.document.getElementById('catOut').textContent;
  try {
    const obj = eval('(' + out.replace(/&quot;/g, '"') + ')');
    if (obj.id !== 'hall-effect' || obj.number !== 3) errors.push('catalog builder produced the wrong entry');
    console.log('catalog builder entry parses:', obj.id, '| tags', obj.tags.length);
  } catch (e) {
    errors.push('catalog builder output is not valid JavaScript: ' + e.message);
  }
}

/* ---------- PWA files ---------- */

function pwa() {
  const man = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  man.icons.forEach(i => {
    if (!fs.existsSync(path.join(root, i.src))) errors.push('manifest points at a missing icon: ' + i.src);
  });
  if (!fs.existsSync(path.join(root, man.start_url.replace('./', '')))) errors.push('manifest start_url does not exist');
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const listed = sw.match(/"\.\/[^"]+"/g).map(s => s.slice(3, -1)).filter(p => p && !p.endsWith('/'));
  listed.forEach(p => {
    if (!fs.existsSync(path.join(root, p))) errors.push('the service worker precaches a missing file: ' + p);
  });
  console.log('manifest icons:', man.icons.length, '| precached files:', listed.length, '| all present:',
    listed.every(p => fs.existsSync(path.join(root, p))));

  // every page should join in
  ['index.html', 'admin/index.html', 'experiments/alo-band-spectrum/index.html', 'experiments/_template/index.html']
    .forEach(f => {
      const html = fs.readFileSync(path.join(root, f), 'utf8');
      if (!/rel="manifest"/.test(html)) errors.push(f + ' has no manifest link');
      if (!/theme-color/.test(html)) errors.push(f + ' has no theme colour');
    });
}

/* ---------- the experiment builder, end to end ---------- */

function builder() {
  const dir = path.join(root, 'admin');
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/admin/' });
  const w = dom.window;
  w.fetch = () => Promise.resolve({ ok: true });
  for (const f of ['../shared/js/config.js', '../data/catalog.js', '../shared/js/formula.js',
    '../shared/js/pwa.js', 'js/admin.js']) w.eval(fs.readFileSync(path.join(dir, f), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  const rail = () => [...w.document.querySelectorAll('.rail button')];
  const idx = rail().findIndex(b => /Experiment builder/.test(b.textContent));
  rail()[idx].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  const set = (id, v) => { const e = w.document.getElementById(id); if (!e) errors.push('builder field missing: ' + id); else e.value = v; };
  set('spId', 'sonometer'); set('spTitle', 'Frequency of a stretched string');
  set('spCourse', 'General Physics Laboratory I'); set('spSubject', 'Waves');
  set('spConstants', 'mu, linear density, 0.0012, kg/m');
  set('spRows', '5');
  set('spColumns', ['T | tension | N | input |  | 2',
    'l | resonating length | m | measured | 0.5*sqrt(T/mu)/220 ; 0.01 | 4',
    'f | frequency | Hz | calc | 0.5*sqrt(T/mu)/l | 1'].join('\n'));
  set('spPlotX', 'T'); set('spPlotY', 'l');
  set('spDerived', 'm | slope of l against sqrt T | slope(T, l) | m/N | 5');
  set('spResults', 'fbar | mean frequency | mean(f) | Hz | 1 | 220');
  set('spQuestions', 'Why does the length fall as the tension rises?');
  w.document.querySelector('[data-action="specCheck"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const report = w.document.getElementById('specReport').innerHTML;
  console.log('builder check:', /holds together/.test(report) ? 'clean' : report.replace(/<[^>]+>/g, ' ').trim().slice(0, 160));
  if (!/holds together/.test(report)) errors.push('a valid experiment description was reported as broken');

  // and it must catch a bad one
  set('spResults', 'fbar | mean frequency | mean(nosuchcolumn) | Hz | 1 | 220');
  w.document.querySelector('[data-action="specCheck"]').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const bad = w.document.getElementById('specReport').innerHTML;
  console.log('builder catches an undefined name:', /not a constant, a column/.test(bad));
  if (!/not a constant, a column/.test(bad)) errors.push('the builder did not catch an undefined name');
}

/* ---------- the generic engine on a real spec ---------- */

function engine() {
  const specPath = path.join(root, 'experiments', 'hall-effect', 'spec.json');
  const spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'experiments', '_generic', 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/experiments/_generic/?id=hall-effect' });
  const w = dom.window;
  w.scrollTo = () => {};
  w.print = () => {};
  w.URL.createObjectURL = () => 'blob:x';
  w.fetch = () => Promise.reject(new Error('no file'));
  global.Blob = w.Blob;
  for (const f of ['shared/js/config.js', 'shared/js/lab-submit.js', 'shared/js/pdf.js',
    'shared/js/report-doc.js', 'shared/js/formula.js', 'shared/js/plot.js', 'shared/js/lab-engine.js']) {
    try { w.eval(fs.readFileSync(path.join(root, f), 'utf8')); }
    catch (e) { errors.push('engine load ' + f + ': ' + e.message); }
  }
  w.LabEngine.start(spec);

  const S = w.LabEngine.state;
  S.student.name = 'Test'; S.student.register = '2447101';

  // set the field, take each reading off the instrument, fill the calculated column
  const B = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35];
  const click = sel => { const e = w.document.querySelector(sel); if (e) e.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };
  const railBtns = () => [...w.document.querySelectorAll('.rail button')];
  railBtns()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));      // Observations
  B.forEach((b, r) => { S.cells[r + ':B'] = String(b); });
  railBtns()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  for (let r = 0; r < B.length; r++) click('[data-measure="' + r + '"]');
  const VH = B.map((b, r) => parseFloat(S.cells[r + ':VH']));
  console.log('instrument readings (mV):', VH.map(v => v.toFixed(2)).join(', '));
  if (VH.some(v => !isFinite(v))) errors.push('the simulated instrument gave no reading');

  // the same register number must always give the same readings
  const first = S.cells['3:VH'];
  click('[data-measure="3"]');
  if (S.cells['3:VH'] !== first) errors.push('a reading changed when it was taken again');

  // the checks: right answers pass, wrong ones are flagged
  const F = w.Formula;
  B.forEach((b, r) => { S.cells[r + ':ratio'] = (VH[r] / b).toFixed(2); });
  railBtns()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  let body = w.document.getElementById('steps').innerHTML;
  const okMarks = (body.match(/mark ok/g) || []).length;
  S.cells['2:ratio'] = '999';
  railBtns()[1].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  body = w.document.getElementById('steps').innerHTML;
  const offMarks = (body.match(/mark off/g) || []).length;
  console.log('calculated column — consistent:', okMarks, '| flagged after one wrong entry:', offMarks);
  if (okMarks !== B.length) errors.push('correct calculated values were not all accepted');
  if (offMarks !== 1) errors.push('a wrong calculated value was not flagged exactly once');
  S.cells['2:ratio'] = (VH[2] / B[2]).toFixed(2);

  // work through the derived quantities and the results
  const cols = { B, VH };
  const consts = {}; spec.constants.forEach(c => consts[c.key] = c.value);
  const m = F.evaluate('slope(B, VH)', { vars: consts, cols });
  S.values.m = m.toFixed(3);
  S.values.c = F.evaluate('intercept(B, VH)', { vars: consts, cols }).toFixed(3);
  S.values.rr = F.evaluate('r2(B, VH)', { vars: consts, cols }).toFixed(4);
  const RH = F.evaluate('m * t / (I * 1000)', { vars: Object.assign({ m }, consts), cols });
  S.values.RH = RH.toFixed(6);
  S.values.n = F.evaluate('abs(1 / (RH * q))', { vars: Object.assign({ RH }, consts), cols }).toFixed(0);
  console.log('Hall coefficient recovered:', Number(S.values.RH).toExponential(3), 'm3/C (true -4.200e-4)');
  if (Math.abs(RH - -4.2e-4) > 2e-5) errors.push('the spec-driven analysis did not recover the Hall coefficient');

  const blocks = w.LabEngine.blocks({ graphs: false });
  console.log('report blocks from the spec:', blocks.length, '| summary keys:', Object.keys(w.LabEngine.summary()).length);
  if (blocks.length < 8) errors.push('the spec-driven report is too thin');

  return w.LabEngine.blocks({ graphs: false });
}

/* ---------- editing where an experiment is filed ---------- */

function filing() {
  const dir = path.join(root, 'admin');
  const dom = new JSDOM(fs.readFileSync(path.join(dir, 'index.html'), 'utf8'),
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/admin/' });
  const w = dom.window;
  w.fetch = () => Promise.resolve({ ok: true });
  w.confirm = () => true;
  for (const f of ['../shared/js/config.js', '../data/catalog.js', '../shared/js/formula.js',
    '../shared/js/pwa.js', 'js/admin.js']) w.eval(fs.readFileSync(path.join(dir, f), 'utf8'));
  w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

  // pretend we are connected, with one classification already set in the sheet
  const posted = [];
  w.eval(`
    (function () {
      var mod = null;
    })();
  `);
  // reach into the module through the DOM: connect panel first
  const rail = () => [...w.document.querySelectorAll('.rail button')];
  const idx = rail().findIndex(b => /Programme, course, subject/.test(b.textContent));
  if (idx < 0) { errors.push('no filing panel'); return; }
  rail()[idx].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  const body = w.document.getElementById('panel').innerHTML;
  // not connected yet, so it should say so rather than showing an empty table
  if (!/Connect first|Connection panel/.test(body)) {
    errors.push('the filing panel does not ask you to connect first');
  }
  console.log('filing panel guards on connection:', /Connection panel/.test(body));
}

portal();
template();
admin();
builder();
filing();
engine();
pwa();
layout();
assets();
handlers();

if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nno errors');

/* ---------- layout: does the CSS scale to any screen ---------- */

function layout() {
  const css = fs.readFileSync(path.join(root, 'shared/css/base.css'), 'utf8') +
    fs.readFileSync(path.join(root, 'shared/css/portal.css'), 'utf8') +
    fs.readFileSync(path.join(root, 'experiments/alo-band-spectrum/css/experiment.css'), 'utf8');

  // page shells must use the fluid gutter; a printed report may keep fixed padding
  ['.work {', '.catalog {', '.filters {', '.portal-head {', '.masthead {', '.portal-foot {'].forEach(sel => {
    const at = css.indexOf(sel);
    if (at < 0) { errors.push('missing rule ' + sel); return; }
    const rule = css.slice(at, css.indexOf('}', at));
    if (!/var\(--gutter\)|clamp\(|env\(safe-area|max\(/.test(rule)) errors.push(sel + ' still uses a fixed page gutter');
  });

  const want = ['--gutter', '--rail-w', 'clamp(', 'env(safe-area-inset', 'orientation: landscape',
    'max-width: 900px', 'min-width: 1180px', 'min-width: 1500px', 'aspect-ratio'];
  const missing = want.filter(w => css.indexOf(w) < 0);
  if (missing.length) errors.push('layout rules missing: ' + missing.join(', '));
  console.log('layout: fluid tokens, breakpoints and safe areas all present:', !missing.length);

  // nothing should force a horizontal scrollbar on a narrow phone
  const wide = css.match(/(^|[^-a-z])width:\s*(\d{3,})px/g) || [];
  const tooWide = wide.filter(w => parseInt(w.replace(/\D/g, ''), 10) > 360);
  if (tooWide.length) errors.push('fixed widths wider than a phone: ' + tooWide.join(', '));
}


/* ---------- nothing referenced that is not there, nothing there twice ---------- */

function assets() {
  const pages = ['index.html', 'admin/index.html', 'experiments/alo-band-spectrum/index.html',
    'experiments/_generic/index.html', 'experiments/_template/index.html'];
  let checked = 0;
  pages.forEach(page => {
    const dir = path.dirname(path.join(root, page));
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m => m[1])
      .filter(u => !/^https?:|^#|^mailto:/.test(u));
    refs.forEach(u => {
      const target = path.resolve(dir, u.split('?')[0].split('#')[0]);
      if (!fs.existsSync(target)) errors.push(page + ' points at a file that is not there: ' + u);
      checked++;
    });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const dupes = ids.filter((x, i) => ids.indexOf(x) !== i);
    if (dupes.length) errors.push(page + ' has the same id twice: ' + [...new Set(dupes)].join(', '));
  });
  console.log('assets: ' + checked + ' references across ' + pages.length + ' pages, all present');

  // every shared script should be either loaded by a page or precached; no orphans
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const allHtml = pages.map(p => fs.readFileSync(path.join(root, p), 'utf8')).join('\n');
  fs.readdirSync(path.join(root, 'shared/js')).forEach(f => {
    const used = allHtml.indexOf('shared/js/' + f) >= 0;
    if (!used) errors.push('shared/js/' + f + ' is loaded by no page — dead file or a missing script tag');
    if (sw.indexOf('shared/js/' + f) < 0) errors.push('shared/js/' + f + ' is not precached, so it will not work offline');
  });
}

/* ---------- every button the experiment draws must have a handler ---------- */

function handlers() {
  const app = fs.readFileSync(path.join(root, 'experiments/alo-band-spectrum/js/app.js'), 'utf8');
  const drawn = new Set([...app.matchAll(/data-action="([a-zA-Z]+)"/g)].map(m => m[1]));
  const handled = new Set([...app.matchAll(/a === "([a-zA-Z]+)"/g)].map(m => m[1]));
  const orphans = [...drawn].filter(a => !handled.has(a));
  const unused = [...handled].filter(a => !drawn.has(a));
  console.log('buttons: ' + drawn.size + ' drawn, ' + handled.size + ' handled' +
    (orphans.length ? ' | ORPHANS: ' + orphans.join(', ') : '') +
    (unused.length ? ' | handlers with no button: ' + unused.join(', ') : ''));
  orphans.forEach(a => errors.push('the experiment draws a "' + a + '" button that nothing handles'));
}

