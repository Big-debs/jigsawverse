import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cellPosition, KIND_COLORS, KINDS } from './demoState.js';
import { imageUvRect, glyphUvRect } from './uvContract.js';

// All runtime references point at the SINGLE versioned art library in the repository.
// Vite emits fingerprinted URLs; no duplicate 3D source art lives in this experiment.
import assembleGlbUrl from '../../../art/living-atlas/modeling/pass-06/glb/assemble_5x5_with_rack_graybox.glb?url';
import planarGlbUrl from '../../../art/living-atlas/modeling/pass-06/glb/planar_6x6_with_rails_graybox.glb?url';
import tileGlbUrl from '../../../art/living-atlas/modeling/pass-06/glb/tile_beveled.glb?url';
import glyphUrl from '../../../art/living-atlas/lookdev/pass-07/glyphs/planar_glyph_atlas.png?url';
import assembleReferenceUrl from '../../../art/living-atlas/lookdev/pass-07/fixtures/assemble_uv_reference.png?url';
import baseColorUrl from '../../../art/living-atlas/lookdev/pass-07/textures/atlas_basecolor.png?url';
import normalUrl from '../../../art/living-atlas/lookdev/pass-07/textures/atlas_normal.png?url';
import ormUrl from '../../../art/living-atlas/lookdev/pass-07/textures/atlas_orm.png?url';
import lightingPresets from '../../../art/living-atlas/lookdev/pass-07/lighting/lighting-presets.json';
import materialPresets from '../../../art/living-atlas/lookdev/pass-07/textures/material-presets.json';

const PIXEL_INSET = 8;
const QUALITY_DPR = {low:1,medium:1.5,high:2};
const PALETTE_IDS = ['atlas.limestone','atlas.brass','atlas.clay','atlas.indigo-stone'];
const texSizes = [256,256];
const col = (hex)=>new THREE.Color(hex);
const status = (material)=>material?.dispose?.();
const p95 = (values) => { if(!values.length)return null; const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.ceil(sorted.length*.95)-1]; };
const loadImage = (url) => new Promise((resolve,reject)=>{
  const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(new Error(`Texture failed: ${url}`));img.src=url;
});
function atlasTexture(image, quadrant, colorSpace=THREE.NoColorSpace) {
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d');
  // Artwork atlas convention: 2x2 material quadrants, 8px gutter on all edges.
  const x=(quadrant%2)*texSizes[0]+PIXEL_INSET,y=Math.floor(quadrant/2)*texSizes[1]+PIXEL_INSET;
  ctx.drawImage(image,x,y,240,240,0,0,256,256);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=colorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=2;t.needsUpdate=true;
  return t;
}
function imageFragmentGeometry(n,row,col,size=.914) {
  const g=new THREE.PlaneGeometry(size,size);g.rotateX(-Math.PI/2);
  const uv=g.getAttribute('uv');const {u0,u1,v0,v1}=imageUvRect(n,row,col);
  // PlaneGeometry original order: top-left, top-right, bottom-left, bottom-right.
  uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);
  uv.needsUpdate=true;
  return g;
}
function glyphGeometry(kind) {
  const g=new THREE.PlaneGeometry(.72,.72);g.rotateX(-Math.PI/2);
  const {u0,u1,v0,v1}=glyphUvRect(kind);
  const uv=g.getAttribute('uv');uv.setXY(0,u0,v1);uv.setXY(1,u1,v1);uv.setXY(2,u0,v0);uv.setXY(3,u1,v0);uv.needsUpdate=true;
  return g;
}

export class AtlasThreeRenderer {
  constructor(container, onAction, onMetrics, onContextLost) {
    this.container=container;this.onAction=onAction;this.onMetrics=onMetrics;this.onContextLost=onContextLost;
    this.disposed=false;this.models={};this.boardGeometries=new Set();this.pieceGeometries=new Set();this.ownedTextures=new Set();this.materials=new Set();this.qualityMaterials=new Set();this.qualityTextures=new Set();this.clickMaterial=null;this.frameTimes=[];this.tiles=new Map();this.pickables=[];
    this.canvas=document.createElement('canvas');this.canvas.className='three-canvas';this.canvas.setAttribute('aria-label','Interactive 3D visual reference. Accessibility controls are available in the side panel.');
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,alpha:true,antialias:true,powerPreference:'low-power',preserveDrawingBuffer:false});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;
    this.scene=new THREE.Scene();this.scene.background=col('#121f35');
    this.camera=new THREE.OrthographicCamera(-4,4,4,-4,.01,100);
    this.sceneRoot=new THREE.Group();this.scene.add(this.sceneRoot);
    this.hemisphere=new THREE.HemisphereLight(0xffffff,0x715c49,.8);
    this.key=new THREE.DirectionalLight(0xffe3bf,2);
    this.fill=new THREE.AmbientLight(0xc6d4ec,.35);
    this.scene.add(this.hemisphere,this.key,this.fill);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    this.handlePointer=e=>this.pick(e);this.handleLoss=e=>{e.preventDefault();if(!this.disposed)this.onContextLost();};
    this.canvas.addEventListener('pointerdown',this.handlePointer);
    this.canvas.addEventListener('webglcontextlost',this.handleLoss,{passive:false});
    container.replaceChildren(this.canvas);
    this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(container);
  }

  async mount(state, options) {
    // Load original Pass 06 GLBs and Pass 07 assets, with loader lifecycle in one scene owner.
    const loader=new GLTFLoader();const textureLoader=new THREE.TextureLoader();
    const glb=(url)=>loader.loadAsync(url);
    const [assemble,planar,tile,image,glyph,base,normal,orm]=await Promise.all([
      glb(assembleGlbUrl),glb(planarGlbUrl),glb(tileGlbUrl),
      textureLoader.loadAsync(assembleReferenceUrl),textureLoader.loadAsync(glyphUrl),
      loadImage(baseColorUrl),loadImage(normalUrl),loadImage(ormUrl),
    ]);
    if(this.disposed)return;
    this.models={assemble:assemble.scene,planar:planar.scene,tile:tile.scene};
    this.images={base,normal,orm};this.imageTexture=image;this.glyphTexture=glyph;
    for(const t of [image,glyph]){t.colorSpace=THREE.SRGBColorSpace;t.flipY=true;t.anisotropy=2;this.ownedTextures.add(t);}
    this.unlitImage=new THREE.MeshBasicMaterial({map:image,toneMapped:false,side:THREE.DoubleSide});this.materials.add(this.unlitImage);
    this.unlitGlyph=new THREE.MeshBasicMaterial({map:glyph,transparent:true,alphaTest:.12,depthWrite:false,toneMapped:false,side:THREE.DoubleSide});this.materials.add(this.unlitGlyph);
    this.resize();this.setState(state,options);
    this.running=true;this.lastFrame=performance.now();this.animate(this.lastFrame);
  }

  createMaterials(quality) {
    const list={};const defs=materialPresets.materials;
    for(let i=0;i<PALETTE_IDS.length;i++){
      const def=defs.find(d=>d.id===PALETTE_IDS[i]);if(!def)throw new Error(`Missing material ${PALETTE_IDS[i]}`);
      const mat=new THREE.MeshStandardMaterial({color:def.base,roughness:def.roughness,metalness:def.metallic});
      if(quality!=='low'){
        const map=atlasTexture(this.images.base,i,THREE.SRGBColorSpace);mat.color.set('#ffffff');mat.map=map;this.qualityTextures.add(map);
        const mr=atlasTexture(this.images.orm,i);mat.roughnessMap=mr;mat.metalnessMap=mr;this.qualityTextures.add(mr);
        if(quality==='high'){
          const normalMap=atlasTexture(this.images.normal,i);mat.normalMap=normalMap;mat.normalScale.set(def.normalScale??.15,def.normalScale??.15);this.qualityTextures.add(normalMap);
        }
      }
      list[PALETTE_IDS[i]]=mat;this.qualityMaterials.add(mat);
    }
    for(const [kind,hex] of KINDS.map((k,i)=>[k,KIND_COLORS[i]])){
      const mat=new THREE.MeshStandardMaterial({color:hex,metalness:0.12,roughness:quality==='high'?.42:.7});
      list[`kind.${kind}`]=mat;this.qualityMaterials.add(mat);
    }
    return list;
  }

  applyLighting(options) {
    const preset=lightingPresets.presets.find(p=>p.id===options.light)||lightingPresets.presets[0];
    this.hemisphere.color.set(preset.hemisphere.sky);this.hemisphere.groundColor.set(preset.hemisphere.ground);this.hemisphere.intensity=preset.hemisphere.intensity;
    this.key.color.set(preset.key.color);this.key.intensity=preset.key.intensity;
    this.key.position.set(...preset.key.direction);
    this.fill.color.set(preset.fill.color);this.fill.intensity=preset.fill.intensity;
    const useShadows=options.quality==='high'&&preset.key.castShadow==='high-only';
    this.renderer.shadowMap.enabled=useShadows;this.key.castShadow=useShadows;
    if(useShadows){this.key.shadow.mapSize.set(1024,1024);this.key.shadow.camera.left=-6;this.key.shadow.camera.right=6;this.key.shadow.camera.top=6;this.key.shadow.camera.bottom=-6;}
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,QUALITY_DPR[options.quality]||1));
    this.scene.background=new THREE.Color(preset.id==='night-tournament-menu'?'#0e152c':preset.id==='golden-hour-menu'?'#3a2f3b':'#14283a');
    this.resize();
  }

  setState(state, options) {
    if(this.disposed||!this.models.assemble)return;
    const modeChanged=this.mode!==state.family,qualityChanged=this.quality!==options.quality;
    const lightChanged=this.light!==options.light;
    const prev=this.state;
    this.state=state;this.options={...options};
    if(qualityChanged){this.clearQualityResources();this.materialMap=this.createMaterials(options.quality);this.quality=options.quality;}
    if(modeChanged||qualityChanged){this.mode=state.family;this.buildStatic();}
    else if(prev!==state){this.rebuildPieces(prev);}
    if(modeChanged||qualityChanged||lightChanged){this.applyLighting(options);this.light=options.light;}
  }

  clearQualityResources() {
    for(const mat of this.qualityMaterials)mat.dispose();
    for(const texture of this.qualityTextures)texture.dispose();
    this.qualityMaterials.clear();this.qualityTextures.clear();
  }

  buildStatic() {
    this.clearGeneratedGeometries();
    if(this.clickMaterial){this.clickMaterial.dispose();this.materials.delete(this.clickMaterial);this.clickMaterial=null;}
    while(this.sceneRoot.children.length)this.sceneRoot.remove(this.sceneRoot.children[0]);
    this.boardRoot=new THREE.Group();this.sceneRoot.add(this.boardRoot);
    const src=this.models[this.mode].clone(true);
    src.traverse(obj=>{
      if(!obj.isMesh)return;
      // Remove source-file demonstration pieces: live fixture pieces are generated from IDs below.
      if(/\.piece\.|\.tile\./.test(obj.name)){obj.visible=false;return;}
      const s=obj.name;
      let material='atlas.limestone';
      if(s.includes('frame')||s.includes('rail'))material='atlas.brass';
      else if(s.includes('divider')||s.includes('slot'))material='atlas.clay';
      else if(s.includes('playfield')||s.includes('rack.base'))material='atlas.indigo-stone';
      obj.material=this.materialMap[material];
    });
    this.boardRoot.add(src);
    this.pieceRoot=new THREE.Group();this.boardRoot.add(this.pieceRoot);
    this.pickables=[];this.tiles=new Map();
    if(this.mode==='assemble')this.makeClickCells();
    this.rebuildPieces(null);
  }

  makeClickCells() {
    const invisible=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0,depthWrite:false,side:THREE.DoubleSide});this.materials.add(invisible);this.clickMaterial=invisible;
    for(let cell=0;cell<25;cell++){
      const row=Math.floor(cell/5),col=cell%5,point=cellPosition(row,col,5);
      const g=new THREE.PlaneGeometry(.98,.98);g.rotateX(-Math.PI/2);this.boardGeometries.add(g);
      const mesh=new THREE.Mesh(g,invisible);mesh.position.set(point.x,.17,point.z);
      mesh.userData.pick={type:'place',cell};this.boardRoot.add(mesh);this.pickables.push(mesh);
    }
  }

  createPiece(id,kind,fragmentId) {
    const group=this.models.tile.clone(true);
    group.traverse(obj=>{if(obj.isMesh){obj.material=kind?this.materialMap[`kind.${kind}`]:this.materialMap['atlas.limestone'];obj.castShadow=this.quality==='high';}});
    let geometry;
    if(kind) geometry=glyphGeometry(kind);
    else {const row=Math.floor(fragmentId/5),col=fragmentId%5;geometry=imageFragmentGeometry(5,row,col);}
    this.pieceGeometries.add(geometry);
    const top=new THREE.Mesh(geometry,kind?this.unlitGlyph:this.unlitImage);top.position.y=.105;top.renderOrder=3;
    top.userData.pick={type:'select',pieceId:id};group.add(top);
    if(!kind)this.pickables.push(top);
    return group;
  }

  clearGeneratedGeometries() {
    for(const geo of this.boardGeometries)geo.dispose();
    for(const geo of this.pieceGeometries)geo.dispose();
    this.boardGeometries.clear();this.pieceGeometries.clear();
  }

  rebuildPieces(previous) {
    if(!this.pieceRoot)return;
    for(const geo of this.pieceGeometries)geo.dispose();this.pieceGeometries.clear();
    const priorPositions=new Map();
    for(const [id,group] of this.tiles)priorPositions.set(id,group.position.clone());
    while(this.pieceRoot.children.length)this.pieceRoot.remove(this.pieceRoot.children[0]);
    // UV/selection meshes are regenerated as small fixtures; geometry and material reuse is intentional.
    this.pickables=this.pickables.filter(x=>x.userData.pick?.type==='place');
    this.tiles=new Map();this.tweens=[];
    if(this.mode==='assemble'){
      const board=this.state.uvProof?Array.from({length:25},(_,i)=>i):this.state.board;
      board.forEach((id,idx)=>{if(id==null)return;const p=cellPosition(Math.floor(idx/5),idx%5,5);this.insertTile(id,null,id,p,priorPositions,previous);});
      if(!this.state.uvProof)this.state.rack.forEach((id,idx)=>{
        const p={x:idx%5-2,z:3.5+Math.floor(idx/5)};this.insertTile(id,null,id,p,priorPositions,previous);
      });
    }else{
      this.state.board.forEach((t,idx)=>{
        const p=cellPosition(Math.floor(idx/6),idx%6,6);this.insertTile(t.id,t.kind,null,p,priorPositions,previous);
      });
    }
  }

  insertTile(id,kind,fragment,point,old,previous) {
    const piece=this.createPiece(id,kind,fragment);const goal=new THREE.Vector3(point.x,0,point.z);
    const start=old.get(id);
    piece.position.copy(start??goal);
    this.tiles.set(id,piece);this.pieceRoot.add(piece);
    if(start&&start.distanceTo(goal)>.005&&previous?.demoMoves!==this.state.demoMoves){
      const distance=start.distanceTo(goal),wrap=this.mode==='planar'&&distance>1.5;
      this.tweens.push({piece,start:start.clone(),goal,begin:performance.now(),duration:wrap?320:210,wrap});
    }
  }

  pick(e) {
    if(this.disposed||this.mode!=='assemble')return;
    const rect=this.canvas.getBoundingClientRect();this.pointer.x=((e.clientX-rect.left)/rect.width)*2-1;this.pointer.y=-((e.clientY-rect.top)/rect.height)*2+1;
    this.raycaster.setFromCamera(this.pointer,this.camera);
    const hits=this.raycaster.intersectObjects(this.pickables,false);
    // Prefer the nearest rack image top over invisible board hitboxes where they overlap.
    const obj=hits[0]?.object;if(obj?.userData?.pick)this.onAction(obj.userData.pick);
  }

  resize() {
    if(this.disposed||!this.renderer)return;
    const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight),aspect=w/h;
    const needW=this.mode==='planar'?8.4:6.8, needH=this.mode==='planar'?8.4:9.1;
    let viewW=Math.max(needW,needH*aspect);let viewH=viewW/aspect;
    this.camera.left=-viewW/2;this.camera.right=viewW/2;this.camera.top=viewH/2;this.camera.bottom=-viewH/2;
    this.camera.position.set(0,18,4.2);this.camera.lookAt(0,0,this.mode==='assemble'?1.17:0);
    this.camera.near=.1;this.camera.far=50;this.camera.updateProjectionMatrix();
    this.renderer.setSize(w,h,false);
  }

  animate(time) {
    if(!this.running||this.disposed)return;
    const dt=time-this.lastFrame;if(this.lastFrame&&dt>0&&dt<500){this.frameTimes.push(dt);if(this.frameTimes.length>150)this.frameTimes.shift();}
    this.lastFrame=time;
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(this.tweens?.length){
      this.tweens=this.tweens.filter(t=>{
        let u=Math.min(1,(time-t.begin)/t.duration);if(reduced)u=1;
        const eased=u*u*(3-2*u);
        if(t.wrap){
          // Wrapping enters/exits at opposite edges, never traverses across the entire board.
          const delta=t.goal.clone().sub(t.start);const axis=Math.abs(delta.x)>Math.abs(delta.z)?'x':'z';
          const sign=Math.sign(delta[axis]);const threshold=3.45;
          const leaving=t.start.clone(),arriving=t.goal.clone();
          if(u<.5){leaving[axis]-=sign*threshold*(u*2*.35);t.piece.position.copy(leaving);}
          else{arriving[axis]+=sign*threshold*(1-u)*2*.35;t.piece.position.copy(arriving);}
        } else {t.piece.position.copy(t.start).lerp(t.goal,eased);t.piece.position.y=Math.sin(Math.PI*u)*.17;}
        if(u>=1)t.piece.position.copy(t.goal);return u<1;
      });
    }
    this.renderer.render(this.scene,this.camera);
    if(this.onMetrics&&(!this.lastReport||time-this.lastReport>1100)){
      this.lastReport=time;
      this.onMetrics({frameP95Ms:p95(this.frameTimes),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,textures:this.renderer.info.memory.textures});
    }
    this.raf=requestAnimationFrame(t=>this.animate(t));
  }

  dispose() {
    if(this.disposed)return;this.disposed=true;this.running=false;cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.canvas.removeEventListener('pointerdown',this.handlePointer);
    this.canvas.removeEventListener('webglcontextlost',this.handleLoss);
    for(const m of this.materials)status(m);
    this.clearGeneratedGeometries();this.clearQualityResources();
    for(const t of this.ownedTextures)t.dispose();
    for(const model of Object.values(this.models)){model.traverse(obj=>{if(obj.isMesh)obj.geometry.dispose();});}
    this.renderer.dispose();this.canvas.remove();
  }
}
