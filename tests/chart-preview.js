const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');const {Resvg}=require('@resvg/resvg-js');
const root=path.join(__dirname,'..');
const dom=new JSDOM('<div></div>',{runScripts:'outside-only'});const w=dom.window;
for(const f of ['js/physics.js','js/charts.js']) w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const P=w.AlOPhysics, C=w.Charts;
const plate=P.makePlate('2447101');
const h=P.hartmannFromThree({lambda:plate.hg[0].lambda,d:plate.hg[0].d},{lambda:plate.hg[3].lambda,d:plate.hg[3].d},{lambda:plate.hg[6].lambda,d:plate.hg[6].d});
const entries=plate.bands.map(b=>{const lam=P.lambdaFromHartmann(h,b.d);return{vu:b.vu,vl:b.vl,lambda:lam,nu:P.lambdaToNu(lam)};});
const a=P.analyse(entries);
const spec=C.spectrumChart({xrange:[Math.min(...entries.map(e=>e.lambda))-60,Math.max(...entries.map(e=>e.lambda))+90],
 title:'AlO B²Σ⁺ → X²Σ⁺ band system, calibrated with the mercury lines',
 intensity:lam=>plate.alo.at(lam,1.1),
 marks:entries.map(b=>({lambda:b.lambda,label:'('+b.vu+','+b.vl+')',intensity:plate.alo.at(b.lambda+1.5,1.1)}))});
const bs=C.scatterFit({points:a.upper.first.map(f=>[f.v+1,f.value]),fit:a.upper.birgeSponer,xlabel:'v + 1',ylabel:'ΔG(v + ½)  (cm⁻¹)',title:'Birge–Sponer plot — upper state B²Σ⁺',annotation:'ωe = '+a.upper.birgeSponer.we.toFixed(1)+' cm⁻¹, ωexe = '+a.upper.birgeSponer.wexe.toFixed(2)+' cm⁻¹'});
const cal=C.calibrationChart({points:plate.hg.map(l=>[l.d,l.lambda]),curve:d=>P.lambdaFromHartmann(h,d),title:'Hartmann dispersion curve',annotation:'λ0 = '+h.lam0.toFixed(1)+' Å, C = '+h.C.toFixed(0)+', d0 = '+h.d0.toFixed(3)+' cm'});
for(const [name,svg] of [['spectrum',spec],['birge-sponer',bs],['calibration',cal]]){
  fs.writeFileSync(path.join(root,'docs',name+'.png'), new Resvg(svg,{fitTo:{mode:'width',value:name==='spectrum'?1000:640}}).render().asPng());
}
console.log('done');
