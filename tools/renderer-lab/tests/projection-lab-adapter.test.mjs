import test from 'node:test';
import assert from 'node:assert/strict';
import {projectSoloAssembleState,projectPlanarEngineBoard,acceptServerViewerProjection} from '../src/engineProjection.js';
import {planarToLabState,soloAssembleToLabState} from '../src/projectionLabAdapter.js';

const tokenOf=p=>'viz_'+String(p.id).padStart(9,'0');
const solo=()=>projectSoloAssembleState({
  mode:'SINGLE_PLAYER',isComplete:false,
  grid:Array.from({length:25},(_,i)=>i===0?{id:5,correctPosition:24}:null),
  playerARack:[{id:9,correctPosition:2}],
},{sessionId:'solo-render',revision:4,rows:5,cols:5,tokenOf});
const planar=()=>projectPlanarEngineBoard(
  Array.from({length:36},(_,i)=>({id:i,kind:['sun','river','seed','ember','indigo','clay'][i%6]})),
  {sessionId:'planar-render',revision:8,tokenOf},
);

test('Planar lab adapter uses opaque IDs and original six-kind board shape',()=>{
  const frame=planar(),view=planarToLabState(frame);
  assert.equal(view.family,'planar');
  assert.equal(view.demoMoves,8);
  assert.equal(view.board[0].id,'viz_000000000');
  assert.equal(view.board[5].kind,'clay');
  assert.equal(view.board.length,36);
  assert.equal(Object.isFrozen(view.board[0]),true);
  assert.equal('scores' in view,false);
  assert.equal('rack' in view,false);
});
test('solo Assemble lab requires an explicit approved image-slice mapper',()=>{
  const frame=solo();
  assert.throws(()=>soloAssembleToLabState(frame),/SOLO ONLY/);
  assert.throws(()=>soloAssembleToLabState(frame,{allowLocalImageSlices:true}),/registry required/);
  const view=soloAssembleToLabState(frame,{allowLocalImageSlices:true,fragmentForToken:t=>
    t==='viz_000000005'?24:t==='viz_000000009'?2:-1});
  assert.equal(view.board[0],24);
  assert.deepEqual(view.rack,[2]);
  assert.equal(view.demoMoves,4);
  assert.equal(Object.isFrozen(view.board),true);
  assert.equal(view.uvProof,false);
});
test('multiplayer or server viewer Assemble snapshot cannot access local image-slice mapper',()=>{
  const frame=acceptServerViewerProjection({...solo(),origin:'server-viewer'});
  assert.throws(()=>soloAssembleToLabState(frame,{allowLocalImageSlices:true,fragmentForToken:()=>1}),/SOLO ONLY/);
});
test('current experimental lab does not claim support for arbitrary Assemble grids',()=>{
  const input={mode:'SINGLE_PLAYER',isComplete:false,grid:Array(64).fill(null),playerARack:[]};
  const frame=projectSoloAssembleState(input,{sessionId:'solo-eight',revision:2,rows:8,cols:8,tokenOf});
  assert.throws(()=>soloAssembleToLabState(frame,{allowLocalImageSlices:true,fragmentForToken:()=>0}),/5x5/);
});
test('unapproved visual fragment mapping and duplicate fragments fail closed',()=>{
  const frame=solo();
  assert.throws(()=>soloAssembleToLabState(frame,{allowLocalImageSlices:true,fragmentForToken:()=>99}),/Unapproved/);
  assert.throws(()=>soloAssembleToLabState(frame,{allowLocalImageSlices:true,fragmentForToken:()=>4}),/Ambiguous/);
});
