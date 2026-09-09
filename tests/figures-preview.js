const fs=require('fs'),path=require('path');
const {JSDOM}=require('jsdom');const {Resvg}=require('@resvg/resvg-js');
const root=path.join(__dirname,'..');
const w=new JSDOM('<div></div>',{runScripts:'outside-only'}).window;
for(const f of ['js/physics.js','js/charts.js']) w.eval(fs.readFileSync(path.join(root,f),'utf8'));
const C=w.Charts;
const figs={
 'fig-atlas':C.bandAtlas({title:'The AlO band system as it appears on the plate'}),
 'fig-levels':C.energyDiagram({title:'Vibrational levels and the transitions between them'}),
 'fig-head':C.headFormation({title:'How a band head forms'})
};
for(const [n,svg] of Object.entries(figs))
  fs.writeFileSync(path.join(root,'docs',n+'.png'), new Resvg(svg,{fitTo:{mode:'width',value:n==='fig-atlas'?1000:660}}).render().asPng());
console.log('done');
