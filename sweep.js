/* Every student gets their own plate, so the guarantees have to hold for all
   of them, not for the one I happened to look at. This works 300 plates the
   way a careful student would and reports the worst case of each thing that
   could go wrong.

   Run: node tests/sweep.js                                              */

const P = require('../js/physics.js');

const N = 300;
const worst = { residual: 0, weU: 0, weL: 0, xeU: 0, xeL: 0, gap: 1e9, span: 1e9 };
const problems = [];

for (let n = 0; n < N; n++) {
  const reg = '24471' + String(n).padStart(3, '0');
  const plate = P.makePlate(reg);

  /* three well-spread mercury lines, as the instructions say */
  const pick = [0, 3, 6].map(i => ({ lambda: plate.hg[i].lambda, d: plate.hg[i].d }));
  const h = P.hartmannFromThree(pick[0], pick[1], pick[2]);
  if (!h || !isFinite(h.lam0) || !isFinite(h.C) || !isFinite(h.d0)) {
    problems.push(reg + ': the Hartmann solution failed'); continue;
  }
  if (h.d0 > plate.dMin && h.d0 < plate.dMax) {
    problems.push(reg + ': d0 falls inside the measured range, so the formula blows up on the plate');
  }

  plate.hg.forEach(l => {
    const dev = Math.abs(P.lambdaFromHartmann(h, l.d) - l.lambda);
    worst.residual = Math.max(worst.residual, dev);
    if (dev > 1.5) problems.push(reg + ': mercury line off by ' + dev.toFixed(2) + ' A');
  });

  /* the fourteen bands of the Deslandre block must all be on the plate */
  const req = plate.bands.filter(b => b.vu <= 3 && b.vl <= 3);
  if (req.length !== 14) problems.push(reg + ': ' + req.length + ' required bands, not 14');

  /* no two features so close that the comparator cannot separate them */
  const ds = plate.bands.map(b => b.d).concat(plate.hg.map(l => l.d)).sort((a, b) => a - b);
  for (let i = 1; i < ds.length; i++) {
    const gap = ds[i] - ds[i - 1];
    if (gap > 0) worst.gap = Math.min(worst.gap, gap);
  }
  worst.span = Math.min(worst.span, plate.dMax - plate.dMin);

  /* work it through as a student would, rounding as they would write it */
  const entries = req.map(b => {
    const lam = +P.lambdaFromHartmann(h, b.d).toFixed(2);
    return { vu: b.vu, vl: b.vl, lambda: lam, nu: +(1e8 / lam).toFixed(1) };
  });
  const a = P.analyse(entries);

  ['upper', 'lower'].forEach(which => {
    const st = a[which];
    const byV = {};
    st.first.forEach(f => { byV[f.v] = f; });
    if (!byV[0] || !byV[1] || !byV[2]) {
      problems.push(reg + ': the ' + which + ' state cannot offer three successive intervals');
      return;
    }
    const dg = [byV[0].value, byV[1].value, byV[2].value];
    const d2 = dg[0] - dg[1];
    const we = dg[0] + d2;
    const xe = (d2 / 2) / we;
    const lw = which === 'upper' ? P.LIT.we_u : P.LIT.we_l;
    const lx = which === 'upper' ? P.LIT.xe_u : P.LIT.xe_l;
    const ew = Math.abs(we - lw) / lw * 100;
    const ex = Math.abs(xe - lx) / lx * 100;
    if (which === 'upper') { worst.weU = Math.max(worst.weU, ew); worst.xeU = Math.max(worst.xeU, ex); }
    else { worst.weL = Math.max(worst.weL, ew); worst.xeL = Math.max(worst.xeL, ex); }
    if (ew > 1) problems.push(reg + ': ' + which + ' we out by ' + ew.toFixed(2) + '%');
    if (ex > 25) problems.push(reg + ': ' + which + ' xe out by ' + ex.toFixed(0) + '%');
    if (d2 <= 0) problems.push(reg + ': ' + which + ' second difference came out negative');
  });
}

console.log(N + ' plates worked through as a student would\n');
console.log('  worst mercury residual      ' + worst.residual.toFixed(2) + ' A');
console.log('  worst error in we (upper)   ' + worst.weU.toFixed(2) + ' %');
console.log('  worst error in we (lower)   ' + worst.weL.toFixed(2) + ' %');
console.log('  worst error in xe (upper)   ' + worst.xeU.toFixed(1) + ' %');
console.log('  worst error in xe (lower)   ' + worst.xeL.toFixed(1) + ' %');
console.log('  closest two features        ' + (worst.gap * 10).toFixed(2) + ' mm on the comparator');
console.log('  shortest plate              ' + worst.span.toFixed(2) + ' cm');

if (problems.length) {
  console.log('\n' + problems.length + ' PROBLEM(S):');
  problems.slice(0, 25).forEach(p => console.log(' - ' + p));
  process.exit(1);
}
console.log('\nno problems on any plate');
