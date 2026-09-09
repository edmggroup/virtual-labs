const P = require('../js/physics.js');

function run(key) {
  const plate = P.makePlate(key);
  // student measures 3 Hg lines
  const pick = [plate.hg[0], plate.hg[3], plate.hg[6]];
  const h = P.hartmannFromThree(pick[0], pick[1], pick[2]);
  // residuals on the remaining Hg lines
  const res = plate.hg.map(l => P.lambdaFromHartmann(h, l.d) - l.lambda);

  const entries = plate.bands.map(b => {
    const lam = P.lambdaFromHartmann(h, b.d);
    return { vu: b.vu, vl: b.vl, lambda: lam, nu: P.lambdaToNu(lam), I: b.intensity };
  });
  const a = P.analyse(entries);
  return { key, plate, h, res, a, entries };
}

for (const key of ['2447101', 'AB-19', 'demo', 'MPH-2026-07']) {
  const r = run(key);
  console.log('== ' + key + '  bands=' + r.plate.bands.length +
    '  d range ' + r.plate.dMin.toFixed(2) + '–' + r.plate.dMax.toFixed(2));
  console.log('   Hartmann residuals (Å): ' + r.res.map(x => x.toFixed(2)).join(', '));
  const u = r.a.upper, l = r.a.lower;
  console.log('   ΔG\' : ' + u.first.map(f => f.value.toFixed(1)).join(', '));
  console.log('   ΔG" : ' + l.first.map(f => f.value.toFixed(1)).join(', '));
  console.log('   upper  2wexe=' + u.twoWexe.toFixed(2) + '  we=' + u.we.toFixed(1) +
    ' (lit 870.0)  xe=' + u.xe.toFixed(5) + '  BS we=' + u.birgeSponer.we.toFixed(1) +
    ' wexe=' + u.birgeSponer.wexe.toFixed(2) + ' r2=' + u.birgeSponer.r2.toFixed(4));
  console.log('   lower  2wexe=' + l.twoWexe.toFixed(2) + '  we=' + l.we.toFixed(1) +
    ' (lit 979.2)  xe=' + l.xe.toFixed(5) + '  BS we=' + l.birgeSponer.we.toFixed(1) +
    ' wexe=' + l.birgeSponer.wexe.toFixed(2) + ' r2=' + l.birgeSponer.r2.toFixed(4));
}

// band inventory for the default plate
const r = run('demo');
const bySeq = {};
r.plate.bands.forEach(b => { (bySeq[b.dv] = bySeq[b.dv] || []).push(b.label + ' ' + b.lambda.toFixed(1) + 'Å d=' + b.d.toFixed(3) + ' I=' + b.intensity.toFixed(2)); });
Object.keys(bySeq).sort((a, b) => b - a).forEach(k => console.log('Δv=' + k + ': ' + bySeq[k].join(' | ')));
