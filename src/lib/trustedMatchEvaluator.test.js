import { describe, expect, it } from 'vitest';
import { GameLogic } from './gameLogic.js';
import {
  MATCH_COMMAND_TYPES,
  createMatchCommand
} from './matchProtocol.js';
import {
  assertCanonicalMatchState,
  evaluateTrustedMatchCommand
} from './trustedMatchEvaluator.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const commandId = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;
const pieces = Array.from({ length: 4 }, (_, id) => ({ id, correctPosition: id }));

const createNexusState = () => {
  const logic = new GameLogic({ rows: 2, cols: 2, totalPieces: 4 }, pieces, 'NEXUS');
  logic.playerARack = [pieces[0], pieces[1]];
  logic.playerBRack = [pieces[2]];
  logic.piecePool = [pieces[3]];
  logic.gameState = 'active';
  return logic.exportCanonicalState({
    gameId: GAME_ID,
    revision: 0,
    startedAt: '2026-10-12T10:00:00.000Z',
    endsAt: '2026-10-12T10:10:00.000Z'
  });
};

const placeCommand = ({ id = '2', revision = 0, pieceId = 0, gridIndex = 0 } = {}) => createMatchCommand({
  gameId: GAME_ID,
  commandId: commandId(id),
  expectedRevision: revision,
  type: MATCH_COMMAND_TYPES.PLACE_PIECE,
  payload: { pieceId, gridIndex }
});

describe('trusted match evaluator', () => {
  it('applies a placement deterministically and produces safe viewer projections', () => {
    const result = evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command: placeCommand(),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    });

    expect(result.canonicalState.revision).toBe(1);
    expect(result.canonicalState.board[0]).toEqual({ pieceId: 0, correctPosition: 0 });
    expect(result.canonicalState.moveHistory[0].timestamp).toBe(
      new Date('2026-10-12T10:01:00.000Z').getTime()
    );
    expect(result.canonicalState.nexus.piecePlacedBy[0]).toBe('playerA');
    expect(result.projections.playerA.board[0]).toEqual({ pieceId: 0 });
    expect(result.projections.playerA.rack).toEqual([1, 3]);
    expect(JSON.stringify(result.projections)).not.toContain('correctPosition');
    expect(JSON.stringify(result.projections)).not.toContain('scores');
  });

  it('rejects a player attempting to place a foreign rack piece', () => {
    expect(() => evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command: placeCommand({ pieceId: 2 }),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    })).toThrow('Piece is not available in your rack');
  });

  it('serializes a same-cell collision by rejecting the second command', () => {
    const first = evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command: placeCommand(),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    });

    expect(() => evaluateTrustedMatchCommand({
      canonicalState: first.canonicalState,
      command: placeCommand({ id: '3', revision: 1, pieceId: 2, gridIndex: 0 }),
      actorRole: 'playerB',
      now: '2026-10-12T10:01:01.000Z'
    })).toThrow('Position occupied');
  });

  it('rejects stale commands and expired deadlines', () => {
    expect(() => evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command: placeCommand({ revision: 1 }),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    })).toThrow('revision');

    expect(() => evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command: placeCommand(),
      actorRole: 'playerA',
      now: '2026-10-12T10:10:00.000Z'
    })).toThrow('deadline');
  });

  it('rejects commands after finalization', () => {
    const state = createNexusState();
    state.match.status = 'finished';

    expect(() => evaluateTrustedMatchCommand({
      canonicalState: state,
      command: placeCommand(),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    })).toThrow('not active');
  });

  it('prevents the placing player from answering their own check', () => {
    const logic = new GameLogic({ rows: 2, cols: 2, totalPieces: 4 }, pieces, 'CLASSIC');
    logic.playerARack = [pieces[0], pieces[1]];
    logic.playerBRack = [pieces[2]];
    logic.piecePool = [pieces[3]];
    logic.gameState = 'active';
    const state = logic.exportCanonicalState({
      gameId: GAME_ID,
      revision: 0,
      startedAt: '2026-10-12T10:00:00.000Z',
      endsAt: '2026-10-12T10:10:00.000Z'
    });
    const placed = evaluateTrustedMatchCommand({
      canonicalState: state,
      command: placeCommand(),
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    });
    const response = createMatchCommand({
      gameId: GAME_ID,
      commandId: commandId('5'),
      expectedRevision: 1,
      type: MATCH_COMMAND_TYPES.RESPOND_TO_CHECK,
      payload: { decision: 'check' }
    });

    expect(() => evaluateTrustedMatchCommand({
      canonicalState: placed.canonicalState,
      command: response,
      actorRole: 'playerA',
      now: '2026-10-12T10:01:01.000Z'
    })).toThrow('cannot answer their own');
  });

  it('detects duplicate, missing, and mutated answer mappings', () => {
    const duplicate = createNexusState();
    duplicate.racks.playerA[1] = duplicate.racks.playerA[0];
    expect(() => assertCanonicalMatchState(duplicate, GAME_ID)).toThrow('exactly once');

    const mutatedAnswer = createNexusState();
    mutatedAnswer.board[0] = { pieceId: 0, correctPosition: 3 };
    mutatedAnswer.racks.playerA.shift();
    expect(() => assertCanonicalMatchState(mutatedAnswer, GAME_ID)).toThrow('answer mapping');
  });

  it('rejects unapproved command payload fields before evaluation', () => {
    const command = {
      ...placeCommand(),
      payload: { pieceId: 0, gridIndex: 0, scores: { playerA: 1000 } }
    };

    expect(() => evaluateTrustedMatchCommand({
      canonicalState: createNexusState(),
      command,
      actorRole: 'playerA',
      now: '2026-10-12T10:01:00.000Z'
    })).toThrow('payload.scores is not allowed');
  });
});
