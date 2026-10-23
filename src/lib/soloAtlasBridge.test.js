import { describe, expect, it } from 'vitest';
import { createSoloAtlasSession, isSoloAtlasEnabled } from './soloAtlasBridge.js';

const pieces=()=>Array.from({length:25},(_,id)=>({
  id, correctPosition:(id*7)%25, imageData:'private-image-data'
}));
const dims={rows:5,cols:5,totalPieces:25};
const game=(list=pieces())=>({
  mode:'SINGLE_PLAYER',isComplete:false,
  grid:Array.from({length:25},()=>null),
  playerARack:list.slice(0,10),
  playerBRack:[{id:777,correctPosition:3}],
  scores:{playerA:{score:250}},revealedScores:{playerA:{score:0}},
  moveHistory:[{correct:true}],pendingCheck:{correct:false},
});
describe('solo Atlas integration gates',()=>{
  it('stays off unless explicitly enabled',()=>{
    expect(isSoloAtlasEnabled({})).toBe(false);
    expect(isSoloAtlasEnabled({VITE_ENABLE_LIVING_ATLAS_SOLO_3D:'false'})).toBe(false);
    expect(isSoloAtlasEnabled({VITE_ENABLE_LIVING_ATLAS_SOLO_3D:'true'})).toBe(true);
  });
  it('rejects unsupported grid dimensions and incomplete piece registries',()=>{
    expect(createSoloAtlasSession(pieces(),{rows:8,cols:8,totalPieces:64})).toBeNull();
    expect(createSoloAtlasSession(pieces().slice(0,24),dims)).toBeNull();
    const dup=pieces();dup[2]={...dup[1],id:999};
    expect(createSoloAtlasSession(dup,dims)).toBeNull();
  });
  it('renders actual accepted solo engine state without leaking scores',()=>{
    const list=pieces();
    const session=createSoloAtlasSession(list,dims,()=> 'abc123xyz');
    expect(session).not.toBeNull();
    const state=game(list);
    const visual=session.project(state,null,0);
    expect(visual.family).toBe('assemble');
    expect(visual.board).toHaveLength(25);
    expect(visual.rack).toEqual(list.slice(0,10).map(x=>x.correctPosition));
    expect(visual.board.every(x=>x===null)).toBe(true);
    expect(JSON.stringify(visual)).not.toContain('score');
    expect(JSON.stringify(visual)).not.toContain('correctPosition');
    expect(JSON.stringify(visual)).not.toContain('private-image-data');
    expect(JSON.stringify(visual)).not.toContain('playerBRack');
    expect(session.hasFragmentInRack(state,list[0].correctPosition)).toBe(true);
    expect(session.pieceForFragment(list[0].correctPosition)).toEqual(list[0]);
  });
  it('projects placement outcome without bypassing GameLogic authority',()=>{
    const list=pieces();
    const session=createSoloAtlasSession(list,dims,()=> 'abc123xyz');
    const state=game(list);state.grid[list[0].correctPosition]=list[0];
    state.playerARack=state.playerARack.slice(1);
    const visual=session.project(state,null,1);
    expect(visual.board[list[0].correctPosition]).toBe(list[0].correctPosition);
    expect(visual.rack).not.toContain(list[0].correctPosition);
    expect(session.hasFragmentInRack(state,list[0].correctPosition)).toBe(false);
  });
  it('rejects direct multiplayer engine state',()=>{
    const list=pieces();
    const session=createSoloAtlasSession(list,dims,()=> 'abc123xyz');
    const state={...game(list),mode:'NEXUS'};
    expect(()=>session.project(state,null,0)).toThrow(/multiplayer/i);
  });
});