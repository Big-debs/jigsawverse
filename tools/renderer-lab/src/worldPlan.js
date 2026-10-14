/** Pass 10: Atlas Workshop noninteractive modular environment plan.
 * Pure coordinates independent of React, Three.js and gameplay mechanics.
 * Y up, board lies on XZ; decorative geometry never occludes live input.
 */
export const WORLD_ID = 'atlas-workshop';
export const WORLD_QUALITY = Object.freeze({
  low: Object.freeze({ maxProps: 8, maxTriangles: 1500, dprCap: 1 }),
  medium: Object.freeze({ maxProps: 24, maxTriangles: 7000, dprCap: 1.5 }),
  high: Object.freeze({ maxProps: 40, maxTriangles: 14000, dprCap: 2 }),
});
export const WORLD_MATERIALS = Object.freeze([
  'atlas.limestone','atlas.brass','atlas.clay','atlas.indigo-stone','kind.river','kind.seed',
]);
export const SAFE_PLAY_REGIONS = Object.freeze({
  assemble: Object.freeze({ left:-3.15, right:3.15, back:-3.2, front:5.1 }),
  planar: Object.freeze({ left:-3.8, right:3.8, back:-3.8, front:3.8 }),
});
const make = (id,tier,kind,material,x,y,z,sx,sy,sz,extra={}) => ({
  id,tier,kind,material,x,y,z,sx,sy,sz,...extra,
});
const box=(id,tier,material,x,y,z,sx,sy,sz,extra={})=>make(id,tier,'box',material,x,y,z,sx,sy,sz,extra);
const cyl=(id,tier,material,x,y,z,sx,sy,sz,extra={})=>make(id,tier,'cylinder',material,x,y,z,sx,sy,sz,extra);
const cone=(id,tier,material,x,y,z,sx,sy,sz,extra={})=>make(id,tier,'cone',material,x,y,z,sx,sy,sz,extra);
const dome=(id,tier,material,x,y,z,sx,sy,sz,extra={})=>make(id,tier,'dome',material,x,y,z,sx,sy,sz,extra);
const BASE=[
  box('workshop.foundation','low','atlas.limestone',0,-.46,0,11.6,.18,13.2,{underBoard:true}),
  box('workshop.back-plinth','low','atlas.clay',0,-.18,-5.65,11.6,.4,.65),
  box('workshop.west-inlay','low','atlas.brass',-4.45,-.2,.15,.095,.055,8.65,{underBoard:true}),
  box('workshop.east-inlay','low','atlas.brass',4.45,-.2,.15,.095,.055,8.65,{underBoard:true}),
  box('workshop.front-rim','low','atlas.brass',0,-.2,5.65,10.6,.1,.13),
];
const MID=[
  cyl('workshop.west-column','medium','atlas.limestone',-4.9,1.05,-4.55,.57,2.4,.57),
  cyl('workshop.east-column','medium','atlas.limestone',4.9,1.05,-4.55,.57,2.4,.57),
  box('workshop.west-cap','medium','atlas.brass',-4.9,2.3,-4.55,.86,.2,.86),
  box('workshop.east-cap','medium','atlas.brass',4.9,2.3,-4.55,.86,.2,.86),
  box('workshop.civic-lintel','medium','atlas.clay',0,2.65,-4.68,9.7,.45,.42),
  box('workshop.lintel-inlay','medium','atlas.brass',0,2.46,-4.39,9.4,.07,.06),
  cyl('workshop.west-planter','medium','atlas.clay',-4.72,.15,-1.1,.8,.72,.8),
  cyl('workshop.east-planter','medium','atlas.clay',4.72,.15,-1.1,.8,.72,.8),
  cone('workshop.west-foliage','medium','kind.seed',-4.72,.94,-1.1,.94,1.18,.94),
  cone('workshop.east-foliage','medium','kind.seed',4.72,.94,-1.1,.94,1.18,.94),
  box('workshop.canal-band','medium','kind.river',0,-.17,-6.3,10.3,.045,.65),
  box('workshop.distant-wall','medium','atlas.limestone',0,.7,-7.15,10.7,1.9,.4),
];
const HIGH=[
  box('workshop.west-banner','high','atlas.indigo-stone',-4,1.77,-4.33,.55,1.5,.055),
  box('workshop.east-banner','high','atlas.indigo-stone',4,1.77,-4.33,.55,1.5,.055),
  box('workshop.west-banner-trim','high','atlas.brass',-4,2.54,-4.29,.62,.06,.06),
  box('workshop.east-banner-trim','high','atlas.brass',4,2.54,-4.29,.62,.06,.06),
  box('workshop.skyline-west','high','atlas.limestone',-3.7,2.15,-8.05,1.2,3.3,.9),
  box('workshop.skyline-mid','high','atlas.clay',-.45,2.45,-8.1,1.6,4.05,1.05),
  box('workshop.skyline-east','high','atlas.limestone',3.3,2,-8.05,1.15,3.15,.9),
  dome('workshop.skyline-dome','high','atlas.brass',-.45,4.61,-8.1,1.5,.8,1.5),
  cone('workshop.west-tree','high','kind.seed',-5.45,1.6,-2.65,1.15,2.2,1.15),
  cone('workshop.east-tree','high','kind.seed',5.45,1.6,-2.65,1.15,2.2,1.15),
  box('workshop.back-channels','high','kind.river',0,-.12,-6.85,8.9,.065,.13),
];
const TIERS={low:BASE,medium:[...BASE,...MID],high:[...BASE,...MID,...HIGH]};
export function buildWorkshopPlan(quality='low',family='assemble'){
  if(!Object.hasOwn(TIERS,quality))throw new RangeError('Unknown graphics tier');
  if(!Object.hasOwn(SAFE_PLAY_REGIONS,family))throw new RangeError('Unknown game family');
  return {
    id:WORLD_ID,family,quality,
    props:TIERS[quality].map(prop=>({...prop,interactive:false,decorative:true})),
    budget:WORLD_QUALITY[quality],
  };
}
function intersectsPlayRegion(p,r){
  return p.x+p.sx/2>r.left&&p.x-p.sx/2<r.right&&p.z+p.sz/2>r.back&&p.z-p.sz/2<r.front;
}
export function verifyWorkshopPlan(plan){
  const safe=SAFE_PLAY_REGIONS[plan.family];
  if(!safe)throw Error('Unknown family');
  if(plan.id!==WORLD_ID||plan.props.length>plan.budget.maxProps)throw Error('Invalid workshop budget');
  const ids=new Set();
  for(const p of plan.props){
    if(ids.has(p.id))throw Error('Duplicate world prop ID: '+p.id);
    ids.add(p.id);
    if(p.interactive!==false||p.decorative!==true)throw Error('World props cannot own gameplay input');
    if(!WORLD_MATERIALS.includes(p.material))throw Error('Unknown world material '+p.material);
    for(const n of [p.x,p.y,p.z,p.sx,p.sy,p.sz])if(!Number.isFinite(n))throw Error('Invalid world dimensions');
    if(p.sx<=0||p.sy<=0||p.sz<=0)throw Error('Nonpositive dimensions');
    if(intersectsPlayRegion(p,safe)&&!(p.underBoard&&p.y+p.sy/2<=-.1))
      throw Error('World prop intrudes on gameplay: '+p.id);
  }
  return true;
}
