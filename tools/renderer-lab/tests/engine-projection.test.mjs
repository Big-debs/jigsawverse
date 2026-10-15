import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PROJECTION_PROTOCOL,validateProjection,freezeProjection,
  projectSoloAssembleState,projectPlanarEngineBoard,acceptServerViewerProjection,
} from '../src/engineProjection.js';

const tokenize=piece=>'viz_'+String(piece.id).padStart(9,'0');
const makeSolo=()=>({
  mode:'SINGLE_PLAYER',gameState:'active',isComplete:false,
  grid:Array.from({length:25},(_,i)=>i===1?{id:5,correctPosition:23,imageData:'SECRET'}:null),
  playerARack:[{id:9,correctPosition:12,imageData:'PRIVATE'}],
  playerBRack:[{id:10,correctPosition:2}],piecePoolCount:13,
  scores:{playerA:{score:750}},revealedScores:{playerA:{score:0}},
  pendingCheck:{correct:true},moveHistory:[{correct:true}],
});
const makeFrame=()=>projectSoloAssembleState(makeSolo(),{sessionId:'solo-fixture',revision:0,rows:5,cols:5,tokenOf:tokenize});
const planar=()=>Array.from({length:36},(_,i)=>({id:i,kind:['sun','river','seed','ember','indigo','clay'][i%6],internalSecret:'omit'}));

test('solo Assemble adapter strips all private engine and opponent fields',()=>{
  const state=makeSolo();const frame=makeFrame();const serialized=JSON.stringify(frame);
  assert.equal(frame.protocol,PROJECTION_PROTOCOL);
  assert.equal(frame.family,'assemble');
  assert.equal(frame.board.cells[1].renderToken,'viz_000000005');
  assert.deepEqual(frame.rack,['viz_000000009']);
  for(const forbidden of ['correctPosition','imageData','scores','score','piecePool','moveHistory','pendingCheck','playerBRack','correct']){
    assert.equal(serialized.includes(forbidden),false,forbidden);
  }
  assert.equal(state.grid[1].correctPosition,23,'engine input remains unchanged');
  assert.equal(Object.isFrozen(frame.board.cells[1]),true);
  assert.equal(Object.isFrozen(frame.rack),true);
});

test('raw multiplayer getGameState cannot use solo shortcut',()=>{
  const state=makeSolo();state.mode='NEXUS';
  assert.throws(()=>projectSoloAssembleState(state,{sessionId:'room-1',revision:0,rows:5,cols:5,tokenOf:tokenize}),/raw multiplayer/);
});
test('Assemble supports real engine rectangular dimensions without assuming all puzzles are 5x5',()=>{
  const state=makeSolo();state.grid=state.grid.slice(0,20);
  const frame=projectSoloAssembleState(state,{sessionId:'solo-rect',revision:1,rows:4,cols:5,tokenOf:tokenize});
  assert.equal(frame.board.cells.length,20);
  assert.equal(frame.board.rows,4);
  assert.equal(frame.board.cols,5);
});
test('Planar adapter accepts PR50 six-kind tile shape without leaking unrelated engine data',()=>{
  const b=planar();
  const frame=projectPlanarEngineBoard(b,{sessionId:'planar-match',revision:2,tokenOf:tokenize});
  assert.equal(frame.board.cells.length,36);
  assert.equal(frame.board.cells[0].kind,'sun');
  assert.equal('rack' in frame,false);
  assert.equal(JSON.stringify(frame).includes('internalSecret'),false);
  assert.equal(b[0].internalSecret,'omit');
});
test('malformed viewer projection fails closed instead of silently removing fields',()=>{
  const frame=makeFrame();
  assert.throws(()=>acceptServerViewerProjection({...frame,origin:'server-viewer',scores:{playerA:900}}),/unapproved field/);
  assert.throws(()=>acceptServerViewerProjection({...frame,origin:'server-viewer',board:{...frame.board,cells:[{renderToken:'viz_abcdefgh',correctPosition:4},...frame.board.cells.slice(1)]}}),/unapproved field/);
  assert.throws(()=>acceptServerViewerProjection({...frame,origin:'server-viewer',playerBRack:[1,2]}),/unapproved field/);
});
test('duplicate and raw piece tokens are rejected',()=>{
  const state=makeSolo();state.playerARack=[state.grid[1]];
  assert.throws(()=>projectSoloAssembleState(state,{sessionId:'dup',revision:0,rows:5,cols:5,tokenOf:tokenize}),/duplicate renderToken/);
  const good=makeSolo();
  assert.throws(()=>projectSoloAssembleState(good,{sessionId:'bad',revision:0,rows:5,cols:5,tokenOf:piece=>String(piece.id)}),/invalid opaque/);
});
test('version, shape, origin and family gates reject incompatible frames',()=>{
  const frame=makeFrame();
  assert.throws(()=>validateProjection({...frame,version:2}),/version mismatch/);
  assert.throws(()=>validateProjection({...frame,origin:'planar-local'}),/invalid Assemble origin/);
  assert.throws(()=>validateProjection({...frame,board:{...frame.board,cols:6}}),/cell count mismatch/);
  assert.throws(()=>validateProjection({...frame,family:'planar'}),/Planar requires 6x6/);
});
test('frozen server viewer frame is a detached snapshot',()=>{
  const input={...makeFrame(),origin:'server-viewer'};
  const stable=acceptServerViewerProjection(input);
  input.board.cells[1]={renderToken:'viz_modified12'};
  assert.equal(stable.board.cells[1].renderToken,'viz_000000005');
  assert.equal(Object.isFrozen(stable),true);
});
