import { MOTION_TYPES, PLANAR_PREVIEW_MS, previewFrame } from './motionContract.js';

const LABELS = Object.freeze({
  [MOTION_TYPES.SELECT]: 'Tile selected',
  [MOTION_TYPES.PLACE]: 'Tile placed · result hidden',
  [MOTION_TYPES.SHIFT]: 'Line shifted',
  [MOTION_TYPES.CLEAR]: 'Illustration: clear',
  [MOTION_TYPES.DROP]: 'Illustration: drop',
  [MOTION_TYPES.REFILL]: 'Illustration: refill',
});
const reduced = () => typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Inert presentation side effects. A parent may replay/remove this without mutating the board. */
export class FeedbackController {
  constructor(node) {
    this.node=node;
    this.enabled=false;
    this.sequenceId=0;
    this.raf=0;
    this.audio=null;
    this.label('Sound off · visual feedback available');
  }
  label(value){this.node.textContent=value;}
  setSound(enabled) {
    this.enabled=Boolean(enabled);
    this.label(this.enabled?'Sound enabled on next interaction':'Sound muted');
  }
  play(cue) {
    if(!cue)return;
    this.cancelPreview();
    this.label(LABELS[cue.type] || 'Visual interaction');
    if(this.enabled)this.beep(cue.type);
  }
  beep(type) {
    // No third-party sound tracks or speech. Synth initializes only after user opt-in.
    try {
      const Ctx=window.AudioContext || window.webkitAudioContext;
      if(!Ctx)return;
      if(!this.audio)this.audio=new Ctx();
      if(this.audio.state==='suspended')void this.audio.resume();
      const now=this.audio.currentTime;
      const source=this.audio.createOscillator(),gain=this.audio.createGain();
      source.type='sine';
      source.frequency.setValueAtTime(type===MOTION_TYPES.SELECT?320:type===MOTION_TYPES.SHIFT?390:460,now);
      gain.gain.setValueAtTime(0.0001,now);
      gain.gain.exponentialRampToValueAtTime(0.035,now+0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001,now+0.095);
      source.connect(gain).connect(this.audio.destination);
      source.start(now);source.stop(now+0.1);
      source.onended=()=>{source.disconnect();gain.disconnect();};
    }catch{this.enabled=false;this.label('Audio unsupported · visual feedback active');}
  }
  cancelPreview() {
    const wasPlaying=this.raf!==0;
    this.sequenceId++;
    if(this.raf)cancelAnimationFrame(this.raf);
    this.raf=0;
    // Only announce an interruption when a storyboard was actually playing.
    if(wasPlaying)this.label('Preview stopped · no game changes');
  }
  playPreview() {
    this.cancelPreview();
    const id=this.sequenceId;
    if(reduced()){this.label('Storyboard complete (reduced motion) · no game changes');return;}
    const start=performance.now();
    const tick=(time)=>{
      if(id!==this.sequenceId)return;
      const frame=previewFrame(time-start);
      if(frame.done){
        this.label('Storyboard complete · no game changes');
        this.raf=0;
        return;
      }
      this.label((LABELS[frame.type]||'Storyboard')+' · '+Math.round(frame.progress*100)+'% · demo only');
      this.raf=requestAnimationFrame(tick);
    };
    this.raf=requestAnimationFrame(tick);
  }
  dispose(){
    this.cancelPreview();
    if(this.audio){void this.audio.close().catch(()=>{});this.audio=null;}
  }
}
