/* Every number a student can end up comparing against a textbook, checked
   against the published value rather than against my own model.

   Sources
     Huber & Herzberg, Constants of Diatomic Molecules
       X²Σ⁺  ωe 979.23, ωexe 6.97, Be 0.64136, αe 0.00580, re 1.6179 Å
       B²Σ⁺  ωe 870.05, ωexe 3.52, Be 0.60443, αe 0.00590, re 1.6670 Å
     Coxon & Naxakis, J. Mol. Spectrosc. 111 (1985) — the B–X analysis
     Patrascu, Yurchenko & Tennyson, MNRAS 449 (2015) — ExoMol AlO line
       list; ground-state term values, and the sequence ranges in its Fig. 7
     (0,0) head at 4842 Å and (0,1) at 5079 Å — quoted in laboratory and
       stellar work on this band system
     NIST Atomic Spectra Database — the mercury standards

   Run: node tests/values-check.js                                        */

const P = require('../js/physics.js');

const problems = [];
let checks = 0;

function near(what, got, want, tol, unit) {
  checks++;
  const off = Math.abs(got - want);
  const ok = off <= tol;
  const line = '  ' + (ok ? 'ok  ' : 'BAD ') + what.padEnd(46) +
    fmt(got) + '   published ' + fmt(want) + (unit ? ' ' + unit : '') +
    '   off by ' + fmt(off);
  console.log(line);
  if (!ok) problems.push(what + ': ' + fmt(got) + ' against ' + fmt(want));
}
function fmt(x) {
  if (!isFinite(x)) return String(x);
  const a = Math.abs(x);
  if (a !== 0 && (a < 1e-3 || a >= 1e6)) return x.toExponential(4);
  return String(Math.round(x * 10000) / 10000);
}
function is(what, cond, detail) {
  checks++;
  console.log('  ' + (cond ? 'ok  ' : 'BAD ') + what + (detail ? '   ' + detail : ''));
  if (!cond) problems.push(what);
}

/* ---------- 1. the constants the experiment is built on ---------- */

console.log('\n1. Vibrational constants (Huber & Herzberg)\n');
near('ωe″, ground state X²Σ⁺', P.TRUTH.we_l, 979.23, 0.001, 'cm⁻¹');
near('ωexe″', P.TRUTH.wexe_l, 6.97, 0.001, 'cm⁻¹');
near('ωe′, excited state B²Σ⁺', P.TRUTH.we_u, 870.05, 0.001, 'cm⁻¹');
near('ωexe′', P.TRUTH.wexe_u, 3.52, 0.001, 'cm⁻¹');

console.log('\n   and the values the student is marked against are the same\n');
near('literature ωe″ shown to the student', P.LIT.we_l, 979.23, 0.001, 'cm⁻¹');
near('literature ωe′ shown to the student', P.LIT.we_u, 870.05, 0.001, 'cm⁻¹');
near('literature xe″ shown to the student', P.LIT.xe_l, 6.97 / 979.23, 1e-9);
near('literature xe′ shown to the student', P.LIT.xe_u, 3.52 / 870.05, 1e-9);

/* ---------- 2. the ground-state ladder ---------- */

console.log('\n2. Ground-state term values: the measured ladder against the two constants\n');
const GX = [0, 965.435, 1916.845, 2854.206, 3777.504, 4686.660, 5581.907];
for (let v = 1; v <= 6; v++) {
  const formula = P.G(v, P.TRUTH.we_l, P.TRUTH.wexe_l) - P.G(0, P.TRUTH.we_l, P.TRUTH.wexe_l);
  near('G″(' + v + ') − G″(0)', P.nuBand(0, 0) - P.nuBand(0, v), GX[v], 0.02, 'cm⁻¹');
  if (Math.abs(formula - GX[v]) > 2.5) {
    problems.push('the ExoMol ladder and the two-constant formula disagree by more than 2.5 cm⁻¹ at v=' + v);
  }
}

/* ---------- 3. where the bands actually fall ---------- */

console.log('\n3. Band heads against the published positions\n');
const head = (vu, vl) => P.nuToLambda(P.nuBand(vu, vl));
near('(0,0) head', head(0, 0), 4842.0, 0.2, 'Å');
near('(0,1) head', head(0, 1), 5079.0, 1.0, 'Å');
near('(1,0) head', head(1, 0), 4648.0, 1.0, 'Å');

console.log('\n   sequence ranges against ExoMol Fig. 7\n');
const bands = P.buildBands();
function seqRange(dv) {
  const l = bands.filter(b => b.dv === dv).map(b => b.lambda);
  return [Math.min(...l), Math.max(...l)];
}
[[1, 4640, 4780], [0, 4840, 4960], [-1, 5080, 5200]].forEach(([dv, lo, hi]) => {
  const [a, b] = seqRange(dv);
  is('Δv = ' + (dv > 0 ? '+' : '') + dv + ' sequence lies within ' + lo + '–' + hi + ' Å',
    a >= lo - 6 && b <= hi + 6, 'heads run ' + fmt(a) + ' to ' + fmt(b) + ' Å');
});
is('all five sequences are on the plate',
  [2, 1, 0, -1, -2].every(dv => bands.some(b => b.dv === dv)),
  [2, 1, 0, -1, -2].map(dv => bands.filter(b => b.dv === dv).length + ' at Δv=' + dv).join(', '));

console.log('\n   heads run to the red as v rises within a sequence\n');
[2, 1, 0, -1, -2].forEach(dv => {
  const set = bands.filter(b => b.dv === dv).sort((x, y) => x.vu - y.vu);
  const rising = set.every((b, i) => i === 0 || b.lambda > set[i - 1].lambda);
  is('Δv = ' + (dv > 0 ? '+' : '') + dv + ' runs in order of v′', rising);
});

/* ---------- 4. rotational structure ---------- */

console.log('\n4. Rotational constants, and the bond lengths they imply\n');
const MU = 26.981538 * 15.994915 / (26.981538 + 15.994915);
near('reduced mass of 27Al16O', MU, 10.0424, 0.001, 'u');
const re = Be => Math.sqrt(16.8576 / (MU * Be));
near('re, ground state, from Be″', re(P.ROT.Be_l), 1.6179, 0.002, 'Å');
near('re, excited state, from Be′', re(P.ROT.Be_u), 1.6670, 0.003, 'Å');
near('Be″', P.ROT.Be_l, 0.64136, 0.0005, 'cm⁻¹');
near('Be′', P.ROT.Be_u, 0.60443, 0.0005, 'cm⁻¹');
is('the molecule is larger when excited, so bands shade to the red',
  P.ROT.Be_u < P.ROT.Be_l, 'B′ = ' + fmt(P.ROT.Be_u) + ' < B″ = ' + fmt(P.ROT.Be_l));

const Bu = P.Bv(0, P.ROT.Be_u, P.ROT.alpha_u), Bl = P.Bv(0, P.ROT.Be_l, P.ROT.alpha_l);
const mHead = -(Bu + Bl) / (2 * (Bu - Bl));
near('R branch turns back at m', mHead, 17, 1.5);
near('(0,0) head lies above its origin by', P.headOffset(0, 0), 10.4, 0.6, 'cm⁻¹');

/* ---------- 5. the mercury standards ---------- */

console.log('\n5. Mercury calibration lines against NIST\n');
const NIST = [4046.563, 4077.831, 4358.328, 4916.036, 5460.735, 5769.598, 5790.663];
P.HG_LINES.forEach((l, i) => near('Hg ' + l.name, l.lambda, NIST[i], 0.006, 'Å'));
is('the mercury lines bracket the AlO system',
  P.HG_LINES[0].lambda < Math.min(...bands.map(b => b.lambda)) &&
  P.HG_LINES[6].lambda > Math.max(...bands.map(b => b.lambda)),
  'Hg ' + fmt(P.HG_LINES[0].lambda) + '–' + fmt(P.HG_LINES[6].lambda) + ' Å around AlO ' +
  fmt(Math.min(...bands.map(b => b.lambda))) + '–' + fmt(Math.max(...bands.map(b => b.lambda))) + ' Å');

/* ---------- 6. the plate a student is given ---------- */

console.log('\n6. The plate, and what it gives back\n');
const plate = P.makePlate('2447101');
is('the dispersion runs one way over the whole plate',
  plate.bands.every((b, i) => i === 0 || b.d > plate.bands[i - 1].d),
  'd rises with λ across all ' + plate.bands.length + ' bands');
const h = P.hartmannFromThree(
  { lambda: plate.hg[0].lambda, d: plate.hg[0].d },
  { lambda: plate.hg[3].lambda, d: plate.hg[3].d },
  { lambda: plate.hg[6].lambda, d: plate.hg[6].d });
is('Hartmann has no pole inside the measured range',
  h.d0 < plate.dMin || h.d0 > plate.dMax, 'd0 = ' + fmt(h.d0) + ' cm, plate ' +
  fmt(plate.dMin) + '–' + fmt(plate.dMax) + ' cm');

const entries = plate.bands.filter(b => b.vu <= 3 && b.vl <= 3).map(b => {
  const lam = +P.lambdaFromHartmann(h, b.d).toFixed(2);
  return { vu: b.vu, vl: b.vl, lambda: lam, nu: +(1e8 / lam).toFixed(1) };
});
const a = P.analyse(entries);
const byV = st => { const m = {}; st.first.forEach(f => { m[f.v] = f.value; }); return m; };
['upper', 'lower'].forEach(which => {
  const g = byV(a[which]);
  const d2 = g[0] - g[1];
  const we = g[0] + d2;
  const want = which === 'upper' ? P.LIT.we_u : P.LIT.we_l;
  near('ωe recovered from the plate, ' + which, we, want, want * 0.005, 'cm⁻¹');
  is('Δ²G is positive, ' + which, d2 > 0, 'Δ²G = ' + fmt(d2) + ' cm⁻¹');
});

console.log('\n' + checks + ' values checked');
if (problems.length) {
  console.log('\n' + problems.length + ' DISAGREE WITH THE PUBLISHED VALUE:');
  problems.forEach(p => console.log(' - ' + p));
  process.exit(1);
}
console.log('every value agrees with the published one\n');
