import test from 'node:test';
import assert from 'node:assert/strict';
import { projectPlanarEngineBoard,projectSoloAssembleState, PROJECTION_PROTOCOL } from '../src/engineProjection.js';
import { ViewerPresentationStream,validateVisualEvent,VISUAL_EVENT_KINDS,replayPresentationTrace } from '../src/presentationStream.js';

const tokenOf=piece=>'viz_'+String(piece.id).padStart(9,'0');
const planar=revision=>projectPlanarEngineBoard(Array.from({length:36},(_,i)=>({
  id:i,kind:['sun','river','seed','ember','indigo','clay'][i%6],
})),{sessionId:'trial2026',revision,tokenOf});
const event=(revision,sequence,kind,data)=>({
  protocol:PROJECTION_PROTOCOL,sessionId:'trial2026',revision,sequence,kind,data,
});

test('ordered Planar frame and engine-supplied shift are presented without changing board',()=>{
  const snapshots=[],events=[];
  const s=new ViewerPresentationStream({onFrame:f=>snapshots.push(f),onEvent:e=>events.push(e)});
  const f=planar(1);
  assert.equal(s.pushFrame(f).status,'applied-frame');
  const e=event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:2,direction:1});
  assert.equal(s.pushEvent(e).status,'applied-event');
  assert.equal(events[0].kind,'planar.shift');
  assert.equal(s.getFrame().board.cells[0].renderToken,f.board.cells[0].renderToken);
  assert.equal('score' in events[0].data,false);
  assert.equal(Object.isFrozen(events[0].data),true);
});

test('duplicate visual events cannot replay',()=>{
  const s=new ViewerPresentationStream();
  s.pushFrame(planar(1));
  const e=event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'column',index:1,direction:-1});
  assert.equal(s.pushEvent(e).status,'applied-event');
  assert.equal(s.pushEvent(e).status,'stale-event');
});
test('out-of-order event sequence returns an explicit gap instead of rendering',()=>{
  let emitted=0;
  const s=new ViewerPresentationStream({onEvent:()=>emitted++});
  s.pushFrame(planar(1));
  assert.equal(s.pushEvent(event(1,2,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:0,direction:1})).status,'event-gap');
  assert.equal(emitted,0);
  assert.equal(s.pushEvent(event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:0,direction:1})).status,'applied-event');
});
test('new session and stale frame require explicit reset',()=>{
  const s=new ViewerPresentationStream();
  s.pushFrame(planar(2));
  assert.equal(s.pushFrame(planar(1)).status,'stale-frame');
  const other=projectPlanarEngineBoard(Array.from({length:36},(_,i)=>({id:i,kind:'sun'})),{sessionId:'other-room',revision:0,tokenOf});
  assert.equal(s.pushFrame(other).status,'new-session-requires-reset');
  assert.equal(s.pushFrame({...planar(3),origin:'server-viewer'}).status,'new-session-requires-reset');
  s.reset();
  assert.equal(s.pushFrame(other).status,'applied-frame');
});
test('events with secret scores and mismatched revisions fail closed',()=>{
  const f=planar(1);
  assert.throws(()=>validateVisualEvent(event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:1,direction:1,correct:true}),f),/private\/unrecognized/);
  assert.throws(()=>validateVisualEvent({...event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:1,direction:1}),scores:{playerA:10}},f),/private\/unrecognized/);
  assert.throws(()=>validateVisualEvent(event(0,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:1,direction:1}),f),/revision mismatch/);
});
test('renderer cannot infer clears: only supplied clear/drop/refill events are replayed',()=>{
  const frame=planar(3);const s=new ViewerPresentationStream();s.pushFrame(frame);
  const c=event(3,1,VISUAL_EVENT_KINDS.PLANAR_CLEAR,{indices:[1,2,3]});
  const d=event(3,2,VISUAL_EVENT_KINDS.PLANAR_DROP,{moves:[{renderToken:'viz_000000001',from:7,to:13}]});
  const r=event(3,3,VISUAL_EVENT_KINDS.PLANAR_REFILL,{cells:[{index:1,renderToken:'viz_newtile001',kind:'seed'}]});
  for(const item of [c,d,r])assert.equal(s.pushEvent(item).status,'applied-event');
  assert.equal(s.getFrame().board.cells[1].kind,frame.board.cells[1].kind);
  assert.equal('score' in s.getFrame(),false);
});
test('invalid clear coordinates or duplicate destinations are rejected',()=>{
  const frame=planar(1);
  assert.throws(()=>validateVisualEvent(event(1,1,VISUAL_EVENT_KINDS.PLANAR_CLEAR,{indices:[0,0]}),frame),/duplicate/);
  assert.throws(()=>validateVisualEvent(event(1,1,VISUAL_EVENT_KINDS.PLANAR_DROP,{moves:[
    {renderToken:'viz_000000001',from:0,to:2},
    {renderToken:'viz_000000002',from:1,to:2},
  ]}),frame),/duplicate/);
});
test('Assemble placement cue references a viewer-visible placed token only',()=>{
  const raw={mode:'SINGLE_PLAYER',grid:Array.from({length:25},(_,i)=>i===0?{id:1}:null),playerARack:[{id:2}],isComplete:false};
  const f=projectSoloAssembleState(raw,{sessionId:'solo1',revision:1,rows:5,cols:5,tokenOf});
  const e={protocol:PROJECTION_PROTOCOL,sessionId:'solo1',revision:1,sequence:1,kind:VISUAL_EVENT_KINDS.ASSEMBLE_PLACE,data:{renderToken:'viz_000000001',index:0}};
  assert.equal(validateVisualEvent(e,f),true);
  assert.throws(()=>validateVisualEvent({...e,data:{...e.data,correct:true}},f),/private\/unrecognized/);
  assert.throws(()=>validateVisualEvent({...e,data:{renderToken:'viz_000000002',index:0}},f),/not visible/);
});
test('diagnostic replay produces deterministic immutable event and frame history',()=>{
  const f=planar(1),e=event(1,1,VISUAL_EVENT_KINDS.PLANAR_SHIFT,{axis:'row',index:3,direction:-1});
  const a=replayPresentationTrace([{type:'frame',value:f},{type:'event',value:e}]);
  const b=replayPresentationTrace([{type:'frame',value:f},{type:'event',value:e}]);
  assert.deepEqual(a,b);
  assert.deepEqual(a.statuses,['applied-frame','applied-event']);
  assert.equal(Object.isFrozen(a.frames[0].board),true);
  assert.equal(Object.isFrozen(a.events[0]),true);
});
