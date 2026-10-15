/**
 * Pass 13 — ordered, render-only presentation stream.
 * A valid data shape does not authenticate a server or authorize a move.
 * The producer must already have accepted the command and filtered each viewer's state.
 */
import { PROJECTION_PROTOCOL, freezeProjection, validateProjection } from './engineProjection.js';

export const VISUAL_EVENT_KINDS = Object.freeze({
  ASSEMBLE_SELECT:'assemble.select',
  ASSEMBLE_PLACE:'assemble.place',
  PLANAR_SHIFT:'planar.shift',
  PLANAR_CLEAR:'planar.clear',
  PLANAR_DROP:'planar.drop',
  PLANAR_REFILL:'planar.refill',
});
const TOKEN = /^viz_[A-Za-z0-9_-]{8,64}$/;
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
function assert(condition, message) { if(!condition)throw new TypeError('Visual event rejected: '+message); }
function keysOnly(value, keys, where) {
  assert(value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype,where+' must be a plain object');
  assert(Object.keys(value).every(k=>keys.includes(k)),where+' contains private/unrecognized fields');
}
function cell(index,total) { assert(Number.isSafeInteger(index)&&index>=0&&index<total,'cell out of range'); }
function token(x) { assert(typeof x==='string'&&TOKEN.test(x),'invalid opaque renderToken'); }
function distinct(list,key) { const unique=new Set(list.map(key)); assert(unique.size===list.length,'duplicate positions or tokens'); }
export function validateVisualEvent(event,frame) {
  validateProjection(frame);
  keysOnly(event,['protocol','sessionId','revision','sequence','kind','data'],'event');
  assert(event.protocol===PROJECTION_PROTOCOL,'protocol mismatch');
  assert(event.sessionId===frame.sessionId,'session mismatch');
  assert(event.revision===frame.revision,'frame revision mismatch');
  assert(Number.isSafeInteger(event.sequence)&&event.sequence>=1,'invalid event sequence');
  assert(Object.values(VISUAL_EVENT_KINDS).includes(event.kind),'unknown event kind');
  assert(event.kind.startsWith(frame.family+'.'),'wrong game family');
  const d=event.data;
  const total=frame.board.rows*frame.board.cols;
  if(event.kind===VISUAL_EVENT_KINDS.ASSEMBLE_SELECT){
    keysOnly(d,['renderToken'],'selection');
    token(d.renderToken);
    assert(frame.rack.includes(d.renderToken),'selection not in visible rack');
  } else if(event.kind===VISUAL_EVENT_KINDS.ASSEMBLE_PLACE){
    keysOnly(d,['renderToken','index'],'placement');
    token(d.renderToken);cell(d.index,total);
    assert(frame.board.cells[d.index]?.renderToken===d.renderToken,'placed tile not visible in frame');
  } else if(event.kind===VISUAL_EVENT_KINDS.PLANAR_SHIFT){
    keysOnly(d,['axis','index','direction'],'line shift');
    assert(d.axis==='row'||d.axis==='column','invalid axis');
    assert(Number.isSafeInteger(d.index)&&d.index>=0&&d.index<6,'invalid rail');
    assert(d.direction===-1||d.direction===1,'invalid direction');
  } else if(event.kind===VISUAL_EVENT_KINDS.PLANAR_CLEAR){
    keysOnly(d,['indices'],'clear');
    assert(Array.isArray(d.indices)&&d.indices.length>=1&&d.indices.length<=total,'invalid clear indices');
    d.indices.forEach(i=>cell(i,total));
    distinct(d.indices,x=>x);
  } else if(event.kind===VISUAL_EVENT_KINDS.PLANAR_DROP){
    keysOnly(d,['moves'],'drop');
    assert(Array.isArray(d.moves)&&d.moves.length<=total,'invalid drop moves');
    for(const m of d.moves){
      keysOnly(m,['renderToken','from','to'],'drop movement');
      token(m.renderToken);cell(m.from,total);cell(m.to,total);
    }
    distinct(d.moves,x=>x.renderToken);distinct(d.moves,x=>x.to);
  } else if(event.kind===VISUAL_EVENT_KINDS.PLANAR_REFILL){
    keysOnly(d,['cells'],'refill');
    assert(Array.isArray(d.cells)&&d.cells.length<=total,'invalid refill cells');
    for(const c of d.cells){
      keysOnly(c,['index','renderToken','kind'],'refill cell');
      cell(c.index,total);token(c.renderToken);
      assert(['sun','river','seed','ember','indigo','clay'].includes(c.kind),'invalid tile kind');
    }
    distinct(d.cells,x=>x.index);distinct(d.cells,x=>x.renderToken);
  }
  return true;
}
function freezeEvent(event) {
  const payload=event.data;
  let data;
  if (Array.isArray(payload.indices)) data={indices:Object.freeze([...payload.indices])};
  else if(Array.isArray(payload.moves))data={moves:Object.freeze(payload.moves.map(m=>Object.freeze({...m})))};
  else if(Array.isArray(payload.cells))data={cells:Object.freeze(payload.cells.map(c=>Object.freeze({...c})))};
  else data={...payload};
  return Object.freeze({
    protocol:event.protocol,sessionId:event.sessionId,revision:event.revision,
    sequence:event.sequence,kind:event.kind,data:Object.freeze(data),
  });
}
/** Strictly ordered snapshots and non-mutating cues.
 * Drop stale/out-of-order cues. A gap must be reconciled upstream.
 * Only explicit reset permits a new session.
 */
export class ViewerPresentationStream {
  constructor({onFrame=()=>{},onEvent=()=>{}}={}) {
    if(typeof onFrame!=='function'||typeof onEvent!=='function') throw new TypeError('Callbacks required');
    this.onFrame=onFrame;this.onEvent=onEvent;this.reset();
  }
  reset() {
    this.frame=null;this.lastSequence=0;
    return {status:'reset'};
  }
  pushFrame(incoming) {
    const safe=freezeProjection(incoming);
    if(this.frame) {
      if(safe.sessionId!==this.frame.sessionId||safe.family!==this.frame.family) return {status:'new-session-requires-reset'};
      if(safe.revision<=this.frame.revision)return {status:'stale-frame'};
    }
    const skipped=this.frame && safe.revision>this.frame.revision+1;
    this.frame=safe;
    this.onFrame(safe);
    return {status:skipped?'frame-gap-resynced':'applied-frame'};
  }
  pushEvent(incoming) {
    if(!this.frame)return {status:'missing-frame'};
    // Validate data before checking order; malformed private payloads cannot be silently replayed.
    validateVisualEvent(incoming,this.frame);
    if(incoming.sequence<=this.lastSequence)return {status:'stale-event'};
    if(incoming.sequence!==this.lastSequence+1)return {status:'event-gap'};
    const event=freezeEvent(incoming);
    this.lastSequence=event.sequence;
    this.onEvent(event);
    return {status:'applied-event'};
  }
  getFrame(){return this.frame;}
}
/** Pure playback for an already viewer-sanitized diagnostic trace. */
export function replayPresentationTrace(trace) {
  if(!Array.isArray(trace))throw new TypeError('Trace must be an array');
  const frames=[],events=[];
  const stream=new ViewerPresentationStream({onFrame:f=>frames.push(f),onEvent:e=>events.push(e)});
  const statuses=trace.map(item=>{
    keysOnly(item,['type','value'],'trace entry');
    if(item.type==='frame')return stream.pushFrame(item.value).status;
    if(item.type==='event')return stream.pushEvent(item.value).status;
    throw new TypeError('Invalid trace entry');
  });
  return Object.freeze({frames:Object.freeze(frames),events:Object.freeze(events),statuses:Object.freeze(statuses)});
}
