import { describe, expect, it } from 'vitest';
import { GameLogic } from './gameLogic.js';
import {
  MATCH_COMMAND_TYPES,
  MATCH_PROTOCOL_VERSION,
  createCanonicalMatchState,
  createMatchCommand,
  createViewerProjection
} from './matchProtocol.js';

const createPieces = (count) => Array.from({ length: count }, (_, id) => ({
  id,
  correctPosition: id,
  isEdge: true
}));

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';

const createLogic = () => {
  const logic = new GameLogic(
    { rows: 2, cols: 2, totalPieces: 4 },
    createPieces(4),
    'NEXUS'
  );
  logic.playerARack = [logic.pieces[0], logic.pieces[1]];
  logic.playerBRack = [logic.pieces[2]];
  logic.piecePool = [logic.pieces[3]];
  logic.grid[3] = logic.pieces[0];
  logic.scores.playerA.score = 25;
  logic.scores.playerB.score = 10;
  logic.revealedScores.playerA.score = 5;
  logic.revealedScores.playerB.score = 0;
  logic.piecePlacedBy[3] = 'playerA';
  logic.pieceMarks[3] = { marker: 'playerB', type: 'suspect' };
  logic.gameState = 'active';
  return logic;
};

describe('match protocol commands', () => {
  it('creates an idempotent revision-checked command without client actor identity', () => {
    const command = createMatchCommand({
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      expectedRevision: 7,
      type: MATCH_COMMAND_TYPES.PLACE_PIECE,
      payload: { pieceId: 0, gridIndex: 3 }
    });

    expect(command).toEqual({
      protocolVersion: MATCH_PROTOCOL_VERSION,
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      expectedRevision: 7,
      type: 'place_piece',
      payload: { pieceId: 0, gridIndex: 3 }
    });
    expect(command).not.toHaveProperty('actorId');
  });

  it('rejects malformed commands before transport', () => {
    expect(() => createMatchCommand({
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      expectedRevision: -1,
      type: MATCH_COMMAND_TYPES.PLACE_PIECE,
      payload: { pieceId: 0, gridIndex: 3 }
    })).toThrow('expectedRevision');

    expect(() => createMatchCommand({
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      expectedRevision: 0,
      type: MATCH_COMMAND_TYPES.MARK_PIECE,
      payload: { gridIndex: 3, markType: 'correct' }
    })).toThrow('markType');

    expect(() => createMatchCommand({
      gameId: GAME_ID,
      commandId: 'reused-human-label',
      expectedRevision: 0,
      type: MATCH_COMMAND_TYPES.RESOLVE_NEXUS,
      payload: {}
    })).toThrow('commandId must be a UUID');
  });
});

describe('canonical match state and projections', () => {
  it('captures complete protected state with explicit versions and dimensions', () => {
    const canonical = createCanonicalMatchState(createLogic(), {
      gameId: GAME_ID,
      revision: 4,
      startedAt: '2026-10-12T10:00:00Z',
      endsAt: '2026-10-12T10:10:00Z'
    });

    expect(canonical).toMatchObject({
      protocolVersion: MATCH_PROTOCOL_VERSION,
      revision: 4,
      match: {
        gameId: GAME_ID,
        mode: 'NEXUS',
        rows: 2,
        cols: 2,
        rackCapacity: 10
      },
      board: [null, null, null, { pieceId: 0, correctPosition: 0 }],
      racks: { playerA: [0, 1], playerB: [2] },
      piecePool: [3]
    });
    expect(canonical.scores.playerA.score).toBe(25);
    expect(canonical.nexus.pieceMarks[3]).toEqual({ marker: 'playerB', type: 'suspect' });
  });

  it('projects only viewer-safe state and does not leak answers or true scores', () => {
    const canonical = createCanonicalMatchState(createLogic(), {
      gameId: GAME_ID,
      revision: 4,
      result: {
        status: 'finished',
        winner: 'playerA',
        finalizedAt: '2026-10-12T10:10:00Z',
        scores: { playerA: 999, playerB: 0 }
      }
    });
    const projection = createViewerProjection(canonical, 'playerA');
    const serialized = JSON.stringify(projection);

    expect(projection.rack).toEqual([0, 1]);
    expect(projection.opponentRackCount).toBe(1);
    expect(projection.piecePoolCount).toBe(1);
    expect(projection.board[3]).toEqual({ pieceId: 0 });
    expect(projection.revealedScores.playerA.score).toBe(5);
    expect(projection).not.toHaveProperty('scores');
    expect(projection).not.toHaveProperty('pieceCatalog');
    expect(projection).not.toHaveProperty('piecePool');
    expect(projection).not.toHaveProperty('moveHistory');
    expect(projection.result).toEqual({
      status: 'finished',
      winner: 'playerA',
      finalizedAt: '2026-10-12T10:10:00Z'
    });
    expect(serialized).not.toContain('correctPosition');
    expect(serialized).not.toContain('25');
    expect(serialized).not.toContain('999');
  });

  it('rejects projections for an unauthorised viewer role', () => {
    const canonical = createCanonicalMatchState(createLogic());
    expect(() => createViewerProjection(canonical, 'spectator')).toThrow('viewer');
  });
});
