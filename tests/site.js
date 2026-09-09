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
    const target = path.join(root, href, 'index.html');
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
    if (!fs.existsSync(path.join(root, 'experiments', x.id))) errors.push('no folder for catalog id ' + x.id);
    const meta = path.join(root, 'experiments', x.id, 'js', 'meta.js');
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

portal();
template();

if (errors.length) { console.log('\nERRORS:'); errors.forEach(e => console.log(' - ' + e)); process.exit(1); }
console.log('\nno errors');
