/* Runs the real PlateView drawing code and writes the pixels to a PNG. */
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const dom = new JSDOM('<canvas id=p></canvas><canvas id=t></canvas><canvas id=o></canvas><canvas id=m></canvas>',
  { runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;

const captured = {};
function makeCtx(name, W, H) {
  return new Proxy({}, {
    get(t, k) {
      if (k === 'createImageData') return (w2, h2) => ({ data: new Uint8ClampedArray(w2 * h2 * 4), width: w2, height: h2 });
      if (k === 'putImageData') return img => { captured[name] = img; };
      if (k === 'measureText') return () => ({ width: 30 });
      if (k === 'canvas') return { width: W, height: H };
      return () => {};
    }
  });
}
const SIZES = { p: [1000, 132], t: [1000, 118], o: [1000, 254], m: [300, 92] };
w.HTMLCanvasElement.prototype.getContext = function () { return makeCtx(this.id, ...SIZES[this.id]); };
for (const id of Object.keys(SIZES)) {
  const el = w.document.getElementById(id);
  Object.defineProperty(el, 'clientWidth', { get: () => SIZES[id][0] });
  Object.defineProperty(el, 'clientHeight', { get: () => SIZES[id][1] });
}
Object.defineProperty(w, 'devicePixelRatio', { get: () => 1 });

for (const f of ['js/physics.js', 'js/spectrum.js']) w.eval(fs.readFileSync(path.join(root, f), 'utf8'));

const view = new w.PlateView({
  plate: w.document.getElementById('p'), trace: w.document.getElementById('t'),
  overlay: w.document.getElementById('o'), mag: w.document.getElementById('m')
});
view.setPlate(w.AlOPhysics.makePlate('2447101'));

function png(img, file) {
  const { width: W, height: H, data } = img;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 4 + 1)] = 0;
    Buffer.from(data.buffer, y * W * 4, W * 4).copy(raw, y * (W * 4 + 1) + 1);
  }
  const chunks = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const td = Buffer.concat([Buffer.from(type), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunks.push(chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)));
  fs.writeFileSync(file, Buffer.concat(chunks));
}
let TAB = null;
function crc32(buf) {
  if (!TAB) { TAB = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; TAB[n] = c >>> 0; } }
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TAB[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

png(captured.p, path.join(__dirname, '..', 'docs', 'plate.png'));
png(captured.m, path.join(__dirname, '..', 'docs', 'magnifier.png'));
console.log('wrote plate.png', captured.p.width + 'x' + captured.p.height,
  ' magnifier.png', captured.m.width + 'x' + captured.m.height);
