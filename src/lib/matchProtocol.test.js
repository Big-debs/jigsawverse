import { describe, expect, it } from 'vitest';
import { GameLogic } from './gameLogic.js';
import {
  MATCH_COMMAND_TYPES,
  MATCH_PROTOCOL_VERSION,
  VIEWER_PROJECTION_ALLOW_LIST,
  assertMatchCommand,
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

    expect(() => assertMatchCommand({
      protocolVersion: MATCH_PROTOCOL_VERSION,
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      expectedRevision: 0,
      type: MATCH_COMMAND_TYPES.PLACE_PIECE,
      payload: { pieceId: 0, gridIndex: 0, scores: { playerA: 999 } }
    })).toThrow('payload.scores is not allowed');
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
    expect(projection.hintsUsed).toBe(0);
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

  it('emits exactly the reviewed projection shape', () => {
    const canonical = createCanonicalMatchState(createLogic(), {
      gameId: GAME_ID,
      revision: 4,
      result: { status: 'finished', winner: 'playerA', finalizedAt: '2026-10-12T10:10:00Z' }
    });
    canonical.pendingDecision = {
      player: 'playerA',
      pieceId: 0,
      gridIndex: 3,
      correct: true,
      timestamp: 12345,
      revealCorrectness: false,
      scoreResult: { points: 999 }
    };
    const projection = createViewerProjection(canonical, 'playerB');

    expect(Object.keys(projection).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.topLevel].sort());
    expect(Object.keys(projection.match).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.match].sort());
    expect(Object.keys(projection.board[3]).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.boardCell].sort());
    expect(Object.keys(projection.revealedScores).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.revealedScores].sort());
    expect(Object.keys(projection.revealedScores.playerA).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.revealedScore].sort());
    expect(Object.keys(projection.turnsRemaining).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.remainingCounters].sort());
    expect(Object.keys(projection.checksRemaining).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.remainingCounters].sort());
    expect(Object.keys(projection.pendingDecision).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.pendingDecision].sort());
    expect(Object.keys(projection.nexus).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.nexus].sort());
    expect(Object.keys(projection.result).sort()).toEqual([...VIEWER_PROJECTION_ALLOW_LIST.result].sort());
    expect(projection.pendingDecision).not.toHaveProperty('correct');
    expect(projection.pendingDecision).not.toHaveProperty('timestamp');
    expect(projection.pendingDecision).not.toHaveProperty('scoreResult');
  });

  it('does not leak tainted protected values through any projection path', () => {
    const canonical = createCanonicalMatchState(createLogic(), { gameId: GAME_ID, revision: 4 });
    canonical.board[3].correctPosition = 'SECRET_BOARD_ANSWER';
    canonical.pieceCatalog = [{ pieceId: 0, correctPosition: 'SECRET_CATALOGUE_ANSWER' }];
    canonical.piecePool = ['SECRET_POOL_ID'];
    canonical.scores.playerA.score = 'SECRET_TRUE_SCORE';
    canonical.scores.playerB.score = 'SECRET_OPPONENT_SCORE';
    canonical.moveHistory = [{ correct: 'SECRET_MOVE_CORRECTNESS' }];
    canonical.pendingDecision = {
      player: 'playerB',
      pieceId: 2,
      gridIndex: 1,
      correct: 'SECRET_PENDING_CORRECTNESS',
      revealCorrectness: false
    };
    canonical.result = {
      status: 'finished',
      winner: 'playerA',
      finalizedAt: '2026-10-12T10:10:00Z',
      scores: 'SECRET_RESULT_SCORES'
    };
    canonical.match.internalAnswer = 'SECRET_MATCH_EXTENSION';
    canonical.revealedScores.playerA.internalScore = 'SECRET_REVEALED_EXTENSION';
    canonical.revealedScores.playerA.score = 'SECRET_REVEALED_SCORE_VALUE';
    canonical.turnsRemaining.internalCounter = 'SECRET_TURN_EXTENSION';
    canonical.checksRemaining.internalCounter = 'SECRET_CHECK_EXTENSION';
    canonical.nexus.piecePlacedBy.internal = 'SECRET_OWNER_EXTENSION';

    for (const viewer of ['playerA', 'playerB']) {
      const viewerCanonical = JSON.parse(JSON.stringify(canonical));
      const opponent = viewer === 'playerA' ? 'playerB' : 'playerA';
      viewerCanonical.racks[opponent] = ['SECRET_FOREIGN_RACK'];
      const serialized = JSON.stringify(createViewerProjection(viewerCanonical, viewer));
      for (const secret of [
        'SECRET_BOARD_ANSWER',
        'SECRET_CATALOGUE_ANSWER',
        'SECRET_FOREIGN_RACK',
        'SECRET_POOL_ID',
        'SECRET_TRUE_SCORE',
        'SECRET_OPPONENT_SCORE',
        'SECRET_MOVE_CORRECTNESS',
        'SECRET_PENDING_CORRECTNESS',
        'SECRET_RESULT_SCORES',
        'SECRET_MATCH_EXTENSION',
        'SECRET_REVEALED_EXTENSION',
        'SECRET_REVEALED_SCORE_VALUE',
        'SECRET_TURN_EXTENSION',
        'SECRET_CHECK_EXTENSION',
        'SECRET_OWNER_EXTENSION'
      ]) {
        expect(serialized).not.toContain(secret);
      }
    }
  });

  it('keeps Nexus marks private to their marker until resolution', () => {
    const canonical = createCanonicalMatchState(createLogic(), { gameId: GAME_ID, revision: 4 });
    canonical.nexus.pieceMarks = {
      1: { marker: 'playerA', type: 'confident', internalNote: 'SECRET_A' },
      2: { marker: 'playerB', type: 'suspect', internalNote: 'SECRET_B' }
    };

    const beforeResolution = createViewerProjection(canonical, 'playerA');
    expect(beforeResolution.nexus.pieceMarks).toEqual({
      1: { marker: 'playerA', type: 'confident' }
    });
    expect(Object.keys(beforeResolution.nexus.pieceMarks[1]).sort())
      .toEqual([...VIEWER_PROJECTION_ALLOW_LIST.nexusMark].sort());
    expect(createViewerProjection(canonical, 'playerB').nexus.pieceMarks).toEqual({
      2: { marker: 'playerB', type: 'suspect' }
    });

    canonical.nexus.resolved = true;
    const afterResolution = createViewerProjection(canonical, 'playerA');
    expect(afterResolution.nexus.pieceMarks).toEqual({
      1: { marker: 'playerA', type: 'confident' },
      2: { marker: 'playerB', type: 'suspect' }
    });
    expect(JSON.stringify(afterResolution)).not.toContain('internalNote');
  });

  it('rejects projections for an unauthorised viewer role', () => {
    const canonical = createCanonicalMatchState(createLogic());
    expect(() => createViewerProjection(canonical, 'spectator')).toThrow('viewer');
  });
});
