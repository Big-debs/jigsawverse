/** Lightweight Atlas Workshop geometry for the Pass 10 laboratory.
 * Shared materials are owned by AtlasThreeRenderer, not this world.
 * All environment geometry is decorative, with no raycasting or rules.
 */
import * as THREE from 'three';
import { buildWorkshopPlan, verifyWorkshopPlan } from './worldPlan.js';

const FACTORIES = {
  box: ()=>new THREE.BoxGeometry(1,1,1),
  cylinder: ()=>new THREE.CylinderGeometry(.5,.5,1,10,1),
  cone: ()=>new THREE.ConeGeometry(.5,1,6,1),
  dome: ()=>new THREE.SphereGeometry(.5,12,8,0,Math.PI*2,0,Math.PI/2),
};
export function createWorkshopScene({quality='low',family='assemble',materials}){
  const plan=buildWorkshopPlan(quality,family);
  verifyWorkshopPlan(plan);
  const group=new THREE.Group();
  group.name='LivingAtlas.AtlasWorkshop.'+quality;
  group.userData={decorative:true,interactive:false};
  const geometries=new Map();
  const geom=(kind)=>{
    if(!FACTORIES[kind])throw Error('Unsupported workshop geometry '+kind);
    if(!geometries.has(kind))geometries.set(kind,FACTORIES[kind]());
    return geometries.get(kind);
  };
  try{
    for(const p of plan.props){
      const material=materials[p.material];
      if(!material)throw Error('Unknown workshop material '+p.material);
      const mesh=new THREE.Mesh(geom(p.kind),material);
      mesh.name=p.id;
      mesh.position.set(p.x,p.y,p.z);
      mesh.scale.set(p.sx,p.sy,p.sz);
      mesh.castShadow=quality==='high'&&p.kind==='cylinder';
      mesh.receiveShadow=quality==='high'&&p.id==='workshop.foundation';
      mesh.userData={decorative:true,interactive:false};
      group.add(mesh);
    }
  }catch(error){
    for(const geometry of geometries.values())geometry.dispose();
    throw error;
  }
  let disposed=false;
  return {
    group,plan,
    dispose(){
      if(disposed)return;
      disposed=true;
      group.parent?.remove(group);
      group.clear();
      for(const geometry of geometries.values())geometry.dispose();
      geometries.clear();
    }
  };
}
