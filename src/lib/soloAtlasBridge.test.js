import { describe, expect, it } from 'vitest';
import { createEnabledSoloAtlasSession, createSoloAtlasSession, isSoloAtlasEnabled } from './soloAtlasBridge.js';
import { GameLogic } from './gameLogic.js';

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
  it('creates an enabled session without requiring secure-context browser crypto',()=>{
    const enabled={VITE_ENABLE_LIVING_ATLAS_SOLO_3D:'true'};
    expect(createEnabledSoloAtlasSession(pieces(),dims,enabled,()=> 'fallback123')).not.toBeNull();
    expect(createEnabledSoloAtlasSession(pieces(),dims,{},()=> 'fallback123')).toBeNull();
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
  it('tracks a real engine through refill, wrong milestone recovery, and completion',()=>{
    const list=pieces();
    const engine=new GameLogic(dims,list,'SINGLE_PLAYER');
    engine.initializeSinglePlayer();
    const session=createSoloAtlasSession(list,dims,()=> 'engine123');
    let revision=0;

    for(let attempt=0;attempt<5;attempt++){
      const piece=engine.playerARack[0];
      const wrongCell=engine.grid.findIndex((cell,index)=>cell===null&&index!==piece.correctPosition);
      expect(engine.placePiece('playerA',piece.id,wrongCell).success).toBe(true);
      const milestone=engine.reconcileSinglePlayerMilestone();
      expect(milestone.reached).toBe(attempt===4);
      const view=session.project(engine.getGameState(),null,++revision);
      expect(JSON.stringify(view)).not.toMatch(/score|correctPosition|moveHistory|playerBRack/);
    }

    expect(engine.grid.every(cell=>cell===null)).toBe(true);
    expect(engine.playerARack).toHaveLength(10);
    expect(engine.scores.playerA.totalPlacements).toBe(5);

    let safety=0;
    while(!engine.isGameComplete()&&safety++<30){
      const piece=engine.playerARack[0];
      expect(piece).toBeTruthy();
      expect(engine.placePiece('playerA',piece.id,piece.correctPosition).success).toBe(true);
      engine.reconcileSinglePlayerMilestone();
    }

    expect(engine.isGameComplete()).toBe(true);
    const finalView=session.project(engine.getGameState(),null,++revision);
    expect(finalView.board.every(fragment=>Number.isSafeInteger(fragment))).toBe(true);
    expect(finalView.rack).toEqual([]);
    expect(JSON.stringify(finalView)).not.toMatch(/score|correctPosition|moveHistory|playerBRack/);
  });
});
