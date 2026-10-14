import test from 'node:test';
import assert from 'node:assert/strict';
import { initialAssemble, initialPlanar, assemblePlace, planarShift } from '../src/demoState.js';
import { MOTION_TYPES, PLANAR_PREVIEW_MS, cueForTransition, motionDuration, previewFrame } from '../src/motionContract.js';

test('Assemble placement emits a neutral cue without correctness or score',()=>{
  const start=initialAssemble();
  const selected={...start,selected:15};
  const placed=assemblePlace(selected,15);
  const cue=cueForTransition(selected,placed,{type:'place',cell:15});
  assert.deepEqual(cue,{type:MOTION_TYPES.PLACE,pieceId:15,cell:15});
  assert.equal('correct' in cue,false);
  assert.equal('score' in cue,false);
  assert.equal(placed.board[15],15);
  assert.equal(start.board[15],null);
});
test('Select cues only use visible rack, never hidden answers',()=>{
  const start=initialAssemble();
  const selected={...start,selected:15};
  assert.deepEqual(cueForTransition(start,selected,{type:'select',pieceId:15}),{type:MOTION_TYPES.SELECT,pieceId:15});
  assert.equal(cueForTransition(start,{...start,selected:99},{type:'select',pieceId:99}),null);
});
test('Planar one-cell shift cue has no match detection and preserves fixture semantics',()=>{
  const start=initialPlanar();
  const shifted=planarShift(start,'row',2,1);
  const cue=cueForTransition(start,shifted,{type:'shift',axis:'row',index:2,direction:1});
  assert.deepEqual(cue,{type:MOTION_TYPES.SHIFT,axis:'row',index:2,direction:1});
  assert.equal('matches' in cue,false);
  assert.equal('score' in cue,false);
  assert.equal(start.demoMoves,0);
  assert.equal(shifted.demoMoves,1);
});
test('Storyboard boundaries sequence clear, drop, refill deterministically',()=>{
  assert.equal(previewFrame(0).type,MOTION_TYPES.CLEAR);
  assert.equal(previewFrame(260).type,MOTION_TYPES.DROP);
  assert.equal(previewFrame(560).type,MOTION_TYPES.REFILL);
  assert.deepEqual(previewFrame(PLANAR_PREVIEW_MS),{type:'complete',progress:1,done:true});
  assert.deepEqual(previewFrame(1,true),{type:'complete',progress:1,done:true});
});
test('Reduced motion snaps cues and errors on unknown events',()=>{
  assert.equal(motionDuration(MOTION_TYPES.PLACE),240);
  assert.equal(motionDuration(MOTION_TYPES.PLACE,true),0);
  assert.throws(()=>motionDuration('secret.answer'),RangeError);
  assert.equal(cueForTransition(initialAssemble(),initialPlanar(),{type:'place',cell:1}),null);
});
