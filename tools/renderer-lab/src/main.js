import { FallbackRenderer } from './fallback.js';
import { cueForTransition } from './motionContract.js';
import { FeedbackController } from './feedbackController.js';
import { initialAssemble, initialPlanar, assemblePlace, planarShift } from './demoState.js';

const $ = (selector) => document.querySelector(selector);
const prefs = {
  family: 'assemble', quality: 'low', light: 'daylight-gameplay', renderer: 'auto', world: 'workshop',
  axis: 'row', index: 2, showUV: false,
};
let previewState = initialAssemble();
let active = null, activeKind = 'none', bootToken = 0;
let diagnostics = { renderer: 'initializing', frameP95Ms: null, drawCalls: null, triangles: null, textures: null };

$('#app').innerHTML = `
<main class="shell">
  <header class="top">
    <div><div class="eyebrow">Jigsawverse · Concept engineering</div><div class="brand">The Living Atlas</div><div class="subbrand">ATLAS WORKSHOP · RENDERER LAB / 12</div></div>
    <div class="top-copy">Real GLB geometry, UV and material experiments for <strong>Assemble</strong> and <strong>Planar</strong>. Isolated from production gameplay, scoring, realtime rooms and CAESAR telemetry.</div>
  </header>
  <div class="page-grid">
    <section class="stage-card" aria-label="Game rendering laboratory">
      <div class="stage-head"><div><div class="stage-title" id="viewTitle">Assemble · Image restoration</div><div class="stage-sub" id="viewSub">5 × 5 / 25 cells · fixed ten-piece visual rack</div></div><span class="badge" id="rendererBadge">LOADING</span></div>
      <div class="stage" id="viewport" aria-label="3D scene or 2D fallback">
        <div class="render-surface" id="renderSurface"></div>
        <span class="hint-overlay" id="stageTip">Tap a rack tile, then an empty cell. This is a local demo only.</span>
      </div>
      <div class="stage-foot"><span id="stageStatus" role="status">Preparing renderer…</span><span id="stageCount">0 demo interactions</span></div>
      <div class="feedback-row"><span role="status" aria-live="polite" id="feedbackStatus">Sound off · visual feedback available</span><button type="button" class="control" id="soundToggle" aria-pressed="false">Sound: Off</button></div>
      <div class="mobile-action-host" id="mobileActionHost"></div>
    </section>
    <aside class="side" aria-label="Laboratory controls">
      <section class="panel"><div class="panel-title">Choose a game family</div><div class="seg" role="group" aria-label="Game family">
        <button class="control active" id="assembleBtn" type="button" aria-pressed="true">▦ Assemble</button>
        <button class="control" id="planarBtn" type="button" aria-pressed="false">⬡ Planar</button></div>
        <div class="label">Rendering mode</div><div class="seg" role="group" aria-label="Rendering mode">
        <button class="control active" id="autoBtn" type="button" aria-pressed="true">Three.js · Auto</button>
        <button class="control" id="fallbackBtn" type="button" aria-pressed="false">2D fallback</button></div>
        <div class="label">Graphics quality</div><div class="triple" role="group" aria-label="Graphics quality">
        <button class="control active" data-quality="low" type="button">Low</button><button class="control" data-quality="medium" type="button">Medium</button><button class="control" data-quality="high" type="button">High</button></div>
        <div class="label"><label for="lightSelect">Environment lighting</label></div>
        <select id="lightSelect" class="select"><option value="daylight-gameplay">Daylight · Gameplay</option><option value="golden-hour-menu">Golden Hour · Preview</option><option value="night-tournament-menu">Tournament Night · Preview</option></select>
        <div class="label">Decorative 3D environment</div><div class="seg" role="group" aria-label="Decorative world"><button class="control active" id="workshopBtn" type="button" aria-pressed="true">Atlas Workshop</button><button class="control" id="boardOnlyBtn" type="button" aria-pressed="false">Board only</button></div><p class="small">Visual-only scene; the 2D fallback remains independent.</p>
      </section>
      <section class="panel" id="actionPanel"><div class="panel-title">Gameplay controls · visual fixture</div>
      <div id="assembleControls"><p class="muted">Select any tile in the ten-piece rack, then select an empty board cell. This tests semantic picking and animated placement, not correctness.</p>
      <div class="seg"><button class="control" id="uvBtn" type="button" aria-pressed="false">UV corner proof</button><button class="control" id="resetAssemble" type="button">Reset preview</button></div></div>
      <div id="planarControls" hidden><p class="muted">Choose a line and shift it one cell. Wrapping is demonstrated, but matches, scoring and cascades remain the real game's responsibility.</p>
      <div class="line-controls"><select id="axisSelect" class="select" aria-label="Line direction"><option value="row">Row</option><option value="column">Column</option></select><select id="indexSelect" class="select" aria-label="Line number"></select></div>
      <div class="seg" style="margin-top:8px"><button class="control" id="minusBtn" type="button">← / ↑ Shift −1</button><button class="control" id="plusBtn" type="button">→ / ↓ Shift +1</button></div><button class="control" style="width:100%;margin-top:8px" id="resetPlanar" type="button">Reset lattice</button><button class="control" style="width:100%;margin-top:8px" id="previewCascade" type="button">Preview clear → drop → refill (illustration only)</button></div>
      <p class="note">No validity checks, matching, scoring, timer authority or multiplayer synchronization are implemented in this laboratory.</p></section>
      <section class="panel"><div class="panel-title">Renderer diagnostics</div><div class="metrics">
        <div class="metric"><div class="metric-value" id="metricFps">—</div><div class="metric-key">Sampled frame p95 (ms)</div></div>
        <div class="metric"><div class="metric-value" id="metricCalls">—</div><div class="metric-key">Draw calls</div></div>
        <div class="metric"><div class="metric-value" id="metricTriangles">—</div><div class="metric-key">Submitted triangles</div></div>
        <div class="metric"><div class="metric-value" id="metricTextures">—</div><div class="metric-key">GPU textures (Three.js count)</div></div><div class="metric"><div class="metric-value" id="metricWorkshop">—</div><div class="metric-key">Visible workshop props</div></div><div class="metric"><div class="metric-value" id="metricGlyph">—</div><div class="metric-key">Planar glyph size (CSS px)</div></div>
      </div><div class="seg" style="margin-top:12px"><button class="control" id="copyBtn" type="button">Copy technical report</button><button class="control" id="contextLossBtn" type="button" disabled>Test context loss</button></div>
      <p class="small">Measurements are browser-session samples only; they are not physical-device FPS certification.</p></section>
    </aside>
  </div>
  <div class="link-row"><span>Art: Living Atlas / Passes 06–07</span><span>Scene: orthographic, XZ board, glTF Y-up</span><span>Safety: gameplay rules untouched</span></div>
  <p class="foot">Preview-only, with deterministic test fixtures. Image reconstruction and glyphs are illustrative; competitive Assemble continues to require authoritative server-side secrets and state handling before ranked release.</p>
</main>`;

// Narrow viewports prioritize playable controls immediately beneath the stage.
const controlParent=$('#actionPanel').parentNode;
const actionPanel=$('#actionPanel');
function positionActionPanel(){
  const mobile=window.matchMedia('(max-width: 720px)').matches;
  const destination=mobile?$('#mobileActionHost'):controlParent;
  if(mobile){destination.appendChild(actionPanel);} else if(actionPanel.parentNode!==controlParent){
    controlParent.insertBefore(actionPanel,controlParent.querySelector('.panel:nth-child(2)'));
  }
  $('#mobileActionHost').hidden=!mobile;
}
positionActionPanel();
window.matchMedia('(max-width: 720px)').addEventListener('change',positionActionPanel);
for(let i=0;i<6;i++)$('#indexSelect').insertAdjacentHTML('beforeend',`<option value="${i}" ${i===2?'selected':''}>Line ${i+1}</option>`);
function setStatus(value){$('#stageStatus').textContent=value;}
function updateButtons(){
  $('#assembleBtn').classList.toggle('active',prefs.family==='assemble'); $('#planarBtn').classList.toggle('active',prefs.family==='planar');
  $('#assembleBtn').setAttribute('aria-pressed',String(prefs.family==='assemble'));$('#planarBtn').setAttribute('aria-pressed',String(prefs.family==='planar'));
  $('#autoBtn').classList.toggle('active',prefs.renderer==='auto');$('#fallbackBtn').classList.toggle('active',prefs.renderer==='fallback');
  $('#autoBtn').setAttribute('aria-pressed',String(prefs.renderer==='auto'));$('#fallbackBtn').setAttribute('aria-pressed',String(prefs.renderer==='fallback'));
  document.querySelectorAll('[data-quality]').forEach(b=>{b.classList.toggle('active',b.dataset.quality===prefs.quality);b.setAttribute('aria-pressed',String(b.dataset.quality===prefs.quality));});
  $('#assembleControls').hidden=prefs.family!=='assemble';$('#planarControls').hidden=prefs.family!=='planar';
  $('#viewTitle').textContent=prefs.family==='assemble'?'Assemble · Image restoration':'Planar · The shifting lattice';
  $('#viewSub').textContent=prefs.family==='assemble'?'5 × 5 / 25 cells · fixed ten-piece visual rack':'6 × 6 / 36 cells · six glyph kinds · whole-line shifts';
  $('#stageTip').textContent=prefs.family==='assemble'?'Tap a rack tile, then an empty cell. Visual demo, no scoring.':'Choose a rail in the controls; whole lines wrap one cell. No match logic.';
  for(const [id,selected] of [['#workshopBtn',prefs.world==='workshop'],['#boardOnlyBtn',prefs.world==='board-only']]){$(id).classList.toggle('active',selected);$(id).setAttribute('aria-pressed',String(selected));}
  $('#uvBtn').setAttribute('aria-pressed',String(previewState.uvProof||false));
  $('#uvBtn').classList.toggle('active',Boolean(previewState.uvProof));
  $('#contextLossBtn').disabled=activeKind!=='3d';
  $('#stageCount').textContent=`${previewState.demoMoves} demo interaction${previewState.demoMoves===1?'':'s'}`;
}
const feedback=new FeedbackController($('#feedbackStatus'));
$('#soundToggle').addEventListener('click',()=>{
  const enabled=!feedback.enabled;feedback.setSound(enabled);
  $('#soundToggle').setAttribute('aria-pressed',String(enabled));
  $('#soundToggle').textContent=enabled?'Sound: On':'Sound: Off';
});
function emitCue(previous,action){
  const cue=cueForTransition(previous,previewState,action);
  feedback.play(cue);
  active?.playCue?.(cue);
}
function onAction(action){
  const previous=previewState;
  if(prefs.family==='assemble'){
    if(action.type==='select' && previewState.rack.includes(action.pieceId))previewState={...previewState,selected:action.pieceId};
    if(action.type==='place')previewState=assemblePlace(previewState,action.cell);
  }
  sync();emitCue(previous,action);
}
function sync(){updateButtons();if(active)active.setState(previewState,prefs);}
function disposeActive(){if(active){active.dispose();active=null;}activeKind='none';}
function openFallback(reason){
  feedback.cancelPreview();
  disposeActive();active=new FallbackRenderer($('#renderSurface'),onAction);activeKind='2d';
  diagnostics={renderer:'Canvas2D',frameP95Ms:null,drawCalls:null,triangles:null,textures:null};
  $('#rendererBadge').textContent='2D FALLBACK';setStatus(reason||'Playable presentation fallback');sync();refreshMetrics();
}
function hasWebGL2(){try{const c=document.createElement('canvas');const gl=c.getContext('webgl2',{antialias:false});const supported=Boolean(gl);gl?.getExtension('WEBGL_lose_context')?.loseContext();return supported;}catch{return false;}}
async function boot(){
  const token=++bootToken;
  if(prefs.renderer==='fallback'){openFallback('2D fallback selected');return;}
  if(!hasWebGL2()){openFallback('WebGL2 unsupported · 2D fallback activated');return;}
  setStatus('Loading Three.js and GLB assets…');$('#rendererBadge').textContent='LOADING 3D';
  try{
    const { AtlasThreeRenderer }=await import('./threeScene.js');if(token!==bootToken)return;
    disposeActive();
    const scene=new AtlasThreeRenderer($('#renderSurface'),onAction,(values)=>{diagnostics={renderer:'WebGL2 / Three.js',...values};refreshMetrics();},()=>{
      if(token===bootToken && prefs.renderer==='auto'){++bootToken;prefs.renderer='fallback';updateButtons();openFallback('WebGL context lost · safe fallback');}
    });
    active=scene;activeKind='3d';await scene.mount(previewState,prefs);
    if(token!==bootToken||active!==scene){scene.dispose();return;}
    $('#rendererBadge').textContent='THREE.JS · WEBGL2';setStatus('Real GLBs loaded · visual fixture ready');sync();
  }catch(err){if(token!==bootToken)return;console.warn('3D renderer unavailable',err);openFallback(`3D unavailable: ${String(err.message||err).slice(0,80)}. 2D fallback active.`);}
}
function refreshMetrics(){
  const val=(k)=>diagnostics[k];
  $('#metricFps').textContent=val('frameP95Ms')==null?'—':Number(val('frameP95Ms')).toFixed(1);
  $('#metricCalls').textContent=val('drawCalls')??'—';$('#metricTriangles').textContent=val('triangles')??'—';$('#metricTextures').textContent=val('textures')??'—';$('#metricWorkshop').textContent=val('workshopProps')??'—';$('#metricGlyph').textContent=val('glyphPx')??'—';
}
$('#assembleBtn').addEventListener('click',()=>{feedback.cancelPreview();prefs.family='assemble';previewState=initialAssemble();sync();});
$('#planarBtn').addEventListener('click',()=>{feedback.cancelPreview();prefs.family='planar';previewState=initialPlanar();sync();});
$('#autoBtn').addEventListener('click',()=>{feedback.cancelPreview();prefs.renderer='auto';updateButtons();void boot();});
$('#fallbackBtn').addEventListener('click',()=>{feedback.cancelPreview();prefs.renderer='fallback';++bootToken;openFallback('Manual fallback selected');});
for(const el of document.querySelectorAll('[data-quality]'))el.addEventListener('click',()=>{prefs.quality=el.dataset.quality;sync();});
$('#lightSelect').addEventListener('change',e=>{prefs.light=e.target.value;sync();});
$('#workshopBtn').addEventListener('click',()=>{prefs.world='workshop';sync();});
$('#boardOnlyBtn').addEventListener('click',()=>{prefs.world='board-only';sync();});
$('#uvBtn').addEventListener('click',()=>{previewState={...previewState,uvProof:!previewState.uvProof};sync();});
$('#resetAssemble').addEventListener('click',()=>{feedback.cancelPreview();previewState=initialAssemble();sync();});
$('#resetPlanar').addEventListener('click',()=>{feedback.cancelPreview();previewState=initialPlanar();sync();});
$('#axisSelect').addEventListener('change',e=>{prefs.axis=e.target.value;sync();});
$('#indexSelect').addEventListener('change',e=>{prefs.index=Number(e.target.value);sync();});
for(const [id,dir] of [['#minusBtn',-1],['#plusBtn',1]])$(id).addEventListener('click',()=>{const before=previewState;previewState=planarShift(previewState,prefs.axis,prefs.index,dir);sync();emitCue(before,{type:'shift',axis:prefs.axis,index:prefs.index,direction:dir});});
$('#previewCascade').addEventListener('click',()=>feedback.playPreview());
$('#copyBtn').addEventListener('click',async()=>{
  const report={pass:12,mode:prefs.family,quality:prefs.quality,lighting:prefs.light,world:prefs.world,adapter:activeKind,...diagnostics,userAgent:navigator.userAgent,viewport:{width:$('#viewport').clientWidth,height:$('#viewport').clientHeight},timestamp:new Date().toISOString(),note:'Local renderer visual fixture; not gameplay or device certification'};
  try{await navigator.clipboard.writeText(JSON.stringify(report,null,2));setStatus('Technical report copied to clipboard');}catch{setStatus('Clipboard unavailable. See developer console for report.');console.info(report);}
});
$('#contextLossBtn').addEventListener('click',()=>{
  const gl=$('#renderSurface canvas')?.getContext('webgl2');
  const extension=gl?.getExtension('WEBGL_lose_context');
  if(extension)extension.loseContext();else setStatus('WEBGL_lose_context unavailable in this browser');
});
updateButtons();openFallback('Safe 2D preview while Three.js initializes');void boot();
