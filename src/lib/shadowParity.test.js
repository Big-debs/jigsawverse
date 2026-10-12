import { describe, expect, it, vi } from 'vitest';
import { GameLogic } from './gameLogic.js';
import { MATCH_COMMAND_TYPES, createMatchCommand } from './matchProtocol.js';
import {
  SHADOW_MISMATCH_CODES,
  compareShadowMatchStates,
  observeShadowParity
} from './shadowParity.js';
import { evaluateTrustedMatchCommand } from './trustedMatchEvaluator.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const pieces = Array.from({ length: 4 }, (_, id) => ({ id, correctPosition: id }));

const createState = () => {
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

const command = createMatchCommand({
  gameId: GAME_ID,
  commandId: COMMAND_ID,
  expectedRevision: 0,
  type: MATCH_COMMAND_TYPES.PLACE_PIECE,
  payload: { pieceId: 0, gridIndex: 0 }
});

const evaluate = (state = createState()) => evaluateTrustedMatchCommand({
  canonicalState: state,
  command,
  actorRole: 'playerA',
  now: '2026-10-12T10:01:00.000Z'
});

describe('shadow parity diagnostics', () => {
  it('reports parity without including protected state', () => {
    const authoritative = evaluate();
    const report = compareShadowMatchStates({
      authoritativeState: authoritative.canonicalState,
      shadowState: JSON.parse(JSON.stringify(authoritative.canonicalState)),
      command,
      checkedAt: '2026-10-12T10:01:01.000Z'
    });

    expect(report).toMatchObject({
      status: 'parity',
      gameId: GAME_ID,
      commandId: COMMAND_ID,
      authoritativeRevision: 1,
      shadowRevision: 1,
      mismatchCodes: []
    });
    expect(report).not.toHaveProperty('authoritativeState');
    expect(report).not.toHaveProperty('shadowState');
  });

  it('emits stable mismatch codes without leaking compared values', () => {
    const authoritative = evaluate();
    const shadowState = JSON.parse(JSON.stringify(authoritative.canonicalState));
    shadowState.scores.playerA.score = 987654321;
    shadowState.nexus.pieceMarks[0] = { marker: 'playerA', type: 'suspect' };
    shadowState.result = { status: 'finished', winner: 'playerB', secret: 'PROTECTED_RESULT' };

    const report = compareShadowMatchStates({
      authoritativeState: authoritative.canonicalState,
      shadowState,
      command,
      checkedAt: '2026-10-12T10:01:01.000Z'
    });
    const serialized = JSON.stringify(report);

    expect(report.status).toBe('diverged');
    expect(report.mismatchCodes).toEqual([
      SHADOW_MISMATCH_CODES.TRUE_SCORES,
      SHADOW_MISMATCH_CODES.NEXUS_MARKS,
      SHADOW_MISMATCH_CODES.RESULT
    ]);
    expect(serialized).not.toContain('987654321');
    expect(serialized).not.toContain('PROTECTED_RESULT');
    expect(serialized).not.toContain('suspect');
  });

  it('ignores nondeterministic timestamps while comparing move semantics', () => {
    const authoritative = evaluate();
    authoritative.canonicalState.pendingDecision = {
      player: 'playerA', pieceId: 0, gridIndex: 0, correct: true, timestamp: 1000
    };
    authoritative.canonicalState.result = {
      status: 'active', winner: null, finalizedAt: '2026-10-12T10:01:00.000Z'
    };
    const shadowState = JSON.parse(JSON.stringify(authoritative.canonicalState));
    shadowState.moveHistory[0].timestamp += 5000;
    shadowState.pendingDecision.timestamp += 5000;
    shadowState.result.finalizedAt = '2026-10-12T10:01:05.000Z';

    const report = compareShadowMatchStates({
      authoritativeState: authoritative.canonicalState,
      shadowState,
      command,
      checkedAt: '2026-10-12T10:01:01.000Z'
    });

    expect(report.status).toBe('parity');
  });

  it('isolates shadow evaluator and telemetry failures from authority', async () => {
    const authoritativeEvaluation = evaluate();
    const emitReport = vi.fn(async () => { throw new Error('telemetry unavailable'); });

    const report = await observeShadowParity({
      baselineState: createState(),
      authoritativeEvaluation,
      command,
      actorRole: 'playerA',
      shadowEvaluate: async () => { throw new Error('protected legacy failure detail'); },
      emitReport,
      now: '2026-10-12T10:01:01.000Z'
    });

    expect(report).toMatchObject({
      status: 'shadow_error',
      mismatchCodes: [SHADOW_MISMATCH_CODES.SHADOW_EVALUATION_FAILED]
    });
    expect(JSON.stringify(report)).not.toContain('protected legacy failure detail');
    expect(emitReport).toHaveBeenCalledWith(report);
  });
});
