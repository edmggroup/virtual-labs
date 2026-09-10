/* Builds the whole record — tables, plate images and graphs — and writes a
   PDF, so the figures can be looked at rather than assumed.

   jsdom has no canvas, so the two steps a browser would do natively are done
   here with what the container has: the plate is drawn through the real
   PlateView code into an ImageData buffer, the graphs are rasterised with
   resvg, and both are turned into JPEG by Pillow. Everything after that —
   the block list, the layout, the PDF itself — is the shipping code.

   Run: NODE_PATH=<jsdom> node tests/report-preview.js                     */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const { JSDOM } = require('jsdom');
const { Resvg } = require('@resvg/resvg-js');

const root = path.join(__dirname, '..');
const site = path.join(root, '..', '..');
const tmp = path.join(__dirname, '.preview');
fs.mkdirSync(tmp, { recursive: true });

/* ---------- 1. run the experiment headlessly ---------- */

const calls = {};
const ctxStub = () => new Proxy({}, {
  get(t, k) {
    if (k === 'createImageData') return (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h });
    if (k === 'measureText') return () => ({ width: 40 });
    if (k === 'putImageData') return img => { lastImage = img; };
    return function () { calls[k] = (calls[k] || 0) + 1; };
  }
});
let lastImage = null;

const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'),
  { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://example.org/x/?demo=1' });
const w = dom.window;
w.HTMLCanvasElement.prototype.getContext = function () { return ctxStub(); };
w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,';
Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientWidth', { get() { return this.__off ? 0 : 900; } });
Object.defineProperty(w.HTMLCanvasElement.prototype, 'clientHeight', { get() { return this.__off ? 0 : 130; } });
w.scrollTo = () => {}; w.print = () => {};
w.URL.createObjectURL = () => 'blob:x';
w.URL.revokeObjectURL = () => {};
w.fetch = () => Promise.resolve({ ok: true });
global.Blob = w.Blob;

for (const f of ['../../shared/js/config.js', 'js/meta.js', '../../shared/js/lab-submit.js',
  '../../shared/js/pdf.js', '../../shared/js/report-doc.js',
  'js/physics.js', 'js/spectrum.js', 'js/charts.js', 'js/report.js', 'js/app.js']) {
  w.eval(fs.readFileSync(path.join(root, f), 'utf8'));
}
w.document.dispatchEvent(new w.Event('DOMContentLoaded', { bubbles: true }));

const rail = () => w.document.querySelectorAll('.rail button');
const click = sel => w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const type = (sel, v) => {
  const el = w.document.querySelector(sel);
  el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true }));
};

rail()[3].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
type('[data-student="name"]', 'A. Student');
type('[data-student="register"]', '2447101');
click('[data-action="mount"]');
click('[data-action="fillall"]');
w.LabState.state.answers.errors = 'Setting the crosswire on a shaded head is the largest single source of error; the two yellow mercury lines are close enough that the field had to be narrowed to separate them.';
w.LabState.state.work.notes.hart = 'R = (l1-l2)(d3-d2) / (l2-l3)(d2-d1) = 1.8423, d0 = (R d1 - d3)/(R - 1) = 27.1298 cm, then C from the first pair and l0 from the first line.';
['q1', 'q2', 'q3', 'q4'].forEach((q, i) => {
  w.LabState.state.answers[q] = 'Answer ' + (i + 1) + ' as written in the record book.';
});

/* ---------- 2. the plate, drawn through the real code ---------- */

function plateJpeg(source, marks, file) {
  const cv = w.document.createElement('canvas');
  cv.__off = true;
  cv.width = 1700; cv.height = 300;
  const view = w.LabState.view ? w.LabState.view() : null;
  const pv = view || new w.PlateView({
    plate: cv, trace: cv, overlay: cv, mag: null
  });
  pv.setPlate(w.LabState.plate);
  lastImage = null;
  const before = calls.fillText || 0;
  pv.snapshot({ source, marks, width: 1700, height: 300 });
  if (!lastImage) throw new Error('the plate snapshot drew nothing');
  /* the readings must actually be ticked off on the plate: one label each,
     on top of whatever the scale itself writes */
  const labels = (calls.fillText || 0) - before;
  if (labels < marks.length) {
    throw new Error('only ' + labels + ' labels drawn for ' + marks.length + ' readings on the ' + source + ' plate');
  }
  console.log('  ' + source + ' plate: ' + marks.length + ' readings marked, ' +
    lastImage.width + '×' + lastImage.height + ' px');
  const png = path.join(tmp, file + '.png');
  writePng(lastImage, png);
  return toJpeg(png);
}

function writePng(img, file) {
  const { width: W, height: H, data } = img;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(data.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))
  ]));
}
let TAB = null;
function crc32(buf) {
  if (!TAB) { TAB = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TAB[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* Pillow stands in for the browser's canvas.toDataURL('image/jpeg') */
function toJpeg(pngFile) {
  const out = execFileSync('python3', ['-c', `
from PIL import Image
import base64, io, sys
im = Image.open(${JSON.stringify(pngFile)}).convert('RGB')
buf = io.BytesIO()
im.save(buf, 'JPEG', quality=84)
print(im.width, im.height)
print(base64.b64encode(buf.getvalue()).decode())
`]).toString().trim().split('\n');
  const [wd, ht] = out[0].split(' ').map(Number);
  return { dataUrl: 'data:image/jpeg;base64,' + out[1], w: wd, h: ht };
}

function svgJpeg(svg, name) {
  const png = path.join(tmp, name + '.png');
  fs.writeFileSync(png, new Resvg(svg, { fitTo: { mode: 'width', value: 1500 } }).render().asPng());
  return toJpeg(png);
}

/* ---------- 3. the record ---------- */

const bands = w.LabState.bandEntries().map(b => ({ d: b.d, label: '(' + b.vu + ',' + b.vl + ')' }));
const hg = w.LabState.hgEntries().filter(h => isFinite(h.d)).map(h => ({ d: h.d, label: String(Math.round(h.lambda)) }));

const plateAlo = plateJpeg('alo', bands, 'plate-alo');
const plateHg = plateJpeg('hg', hg, 'plate-hg');
console.log('plate images:', plateAlo.w + '×' + plateAlo.h, 'and', plateHg.w + '×' + plateHg.h);

const blocks = w.Report.blocks({ graphs: false });

// put the plates where the shipping code puts them
function insertBefore(caption, block) {
  const at = blocks.findIndex(b => b.type === 'table' && b.caption && b.caption.indexOf(caption) === 0);
  if (at < 0) throw new Error('could not find ' + caption);
  blocks.splice(at, 0, block);
}
insertBefore('Table 1', {
  type: 'image', dataUrl: plateHg.dataUrl, w: plateHg.w, h: plateHg.h, key: 'phg',
  caption: 'The mercury comparison spectrum, with the lines measured marked and labelled by wavelength in Å.'
});
insertBefore('Table 3', {
  type: 'image', dataUrl: plateAlo.dataUrl, w: plateAlo.w, h: plateAlo.h, key: 'palo',
  caption: 'The AlO band system as recorded on the plate. Each mark is a band head measured with the comparator.'
});

// and the graphs, rasterised the way the browser would
const G = w.LabState.graphs;
const figures = [
  [G.spectrum, 'The densitometer trace of the same plate, on a wavelength scale from your own calibration.'],
  [G.calibration, 'Hartmann dispersion curve through the mercury lines.'],
  [G.bsUpper, 'Birge–Sponer plot for the upper state.'],
  [G.bsLower, 'Birge–Sponer plot for the lower state.']
].filter(f => f[0]);
blocks.push({ type: 'heading', text: 'Graphs' });
figures.forEach((f, i) => {
  const im = svgJpeg(f[0], 'fig' + i);
  blocks.push({ type: 'image', dataUrl: im.dataUrl, w: im.w, h: im.h, caption: f[1], key: 'g' + i });
});

/* ---------- 4. the PDF ---------- */

w.ReportDoc.pdf(blocks, {
  title: 'AlO band spectrum — A. Student',
  author: 'A. Student',
  header: 'Vibrational constants of AlO from its electronic band spectrum  ·  experiment 8',
  footer: 'A. Student  ·  2447101'
}).then(doc => {
  const bytes = doc.bytes();
  const out = path.join(root, 'docs', 'sample-report.pdf');
  fs.writeFileSync(out, Buffer.from(bytes));
  const images = blocks.filter(b => b.type === 'image').length;
  console.log('blocks:', blocks.length, '| figures:', images, '| pdf:', (bytes.length / 1024).toFixed(0) + ' kB');
  if (images !== 6) throw new Error('expected six figures in the record, got ' + images);
  fs.rmSync(tmp, { recursive: true, force: true });
}).catch(e => { console.error('failed:', e.message); process.exit(1); });
