import { describe, expect, it, vi } from 'vitest';
import {
  processRankedCommand,
  rankedCommandHttpStatus
} from './rankedCommandWorker.js';
import { MATCH_COMMAND_TYPES, createMatchCommand } from '../../../src/lib/matchProtocol.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';
const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const command = createMatchCommand({
  gameId: GAME_ID,
  commandId: COMMAND_ID,
  expectedRevision: 0,
  type: MATCH_COMMAND_TYPES.PLACE_PIECE,
  payload: { pieceId: 0, gridIndex: 0 }
});

const createAdmin = (responses) => ({
  rpc: vi.fn(async (name) => {
    const response = responses[name];
    if (!response) return { data: null, error: { message: `Unexpected RPC: ${name}` } };
    return typeof response === 'function' ? response() : response;
  })
});

describe('ranked command worker orchestration', () => {
  it('uses the verified actor for begin and commits evaluated projections', async () => {
    const canonicalState = { revision: 0, marker: 'protected' };
    const nextState = { revision: 1, result: null };
    const playerA = { revision: 1, viewer: 'playerA' };
    const playerB = { revision: 1, viewer: 'playerB' };
    const admin = createAdmin({
      begin_authoritative_match_command_v2: {
        data: { status: 'pending', actorRole: 'playerA', canonicalState },
        error: null
      },
      commit_authoritative_match_command_v2: {
        data: { status: 'accepted', revision: 1, projection: playerA },
        error: null
      }
    });
    const evaluate = vi.fn(() => ({
      canonicalState: nextState,
      projections: { playerA, playerB }
    }));

    const result = await processRankedCommand({
      admin,
      actorId: ACTOR_ID,
      command,
      now: '2026-10-12T10:01:00.000Z',
      evaluate
    });

    expect(result).toEqual({ status: 'accepted', revision: 1, projection: playerA });
    expect(evaluate).toHaveBeenCalledWith(expect.objectContaining({
      canonicalState,
      actorRole: 'playerA'
    }));
    expect(admin.rpc).toHaveBeenNthCalledWith(1, 'begin_authoritative_match_command_v2', expect.objectContaining({
      p_actor_id: ACTOR_ID,
      p_game_id: GAME_ID,
      p_command_id: COMMAND_ID
    }));
    expect(admin.rpc).toHaveBeenNthCalledWith(2, 'commit_authoritative_match_command_v2', expect.objectContaining({
      p_actor_id: ACTOR_ID,
      p_new_canonical_state: nextState,
      p_player_a_projection: playerA,
      p_player_b_projection: playerB
    }));
  });

  it('observes accepted evaluations without allowing shadow failures to block commits', async () => {
    const canonicalState = { revision: 0, marker: 'protected' };
    const nextState = { revision: 1, result: null };
    const admin = createAdmin({
      begin_authoritative_match_command_v2: {
        data: { status: 'pending', actorRole: 'playerA', canonicalState },
        error: null
      },
      commit_authoritative_match_command_v2: {
        data: { status: 'accepted', revision: 1, projection: { revision: 1 } },
        error: null
      }
    });
    const observeEvaluation = vi.fn(async () => {
      throw new Error('shadow telemetry failed');
    });

    const result = await processRankedCommand({
      admin,
      actorId: ACTOR_ID,
      command,
      evaluate: () => ({
        canonicalState: nextState,
        projections: { playerA: { revision: 1 }, playerB: { revision: 1 } }
      }),
      observeEvaluation
    });

    expect(result.status).toBe('accepted');
    expect(observeEvaluation).toHaveBeenCalledWith(expect.objectContaining({
      baselineState: canonicalState,
      command,
      actorRole: 'playerA'
    }));
  });

  it('returns an idempotent accepted result without reevaluating', async () => {
    const accepted = { status: 'accepted', revision: 1, projection: { revision: 1 } };
    const admin = createAdmin({
      begin_authoritative_match_command_v2: { data: accepted, error: null }
    });
    const evaluate = vi.fn();

    const result = await processRankedCommand({ admin, actorId: ACTOR_ID, command, evaluate });

    expect(result).toEqual(accepted);
    expect(evaluate).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledOnce();
  });

  it('closes a pending ledger entry when rules reject the command', async () => {
    const admin = createAdmin({
      begin_authoritative_match_command_v2: {
        data: { status: 'pending', actorRole: 'playerA', canonicalState: { revision: 0 } },
        error: null
      },
      reject_authoritative_match_command_v2: {
        data: { status: 'rejected', errorCode: 'rule_rejected' },
        error: null
      }
    });

    const result = await processRankedCommand({
      admin,
      actorId: ACTOR_ID,
      command,
      evaluate: () => { throw new Error('protected correctness detail'); }
    });

    expect(result).toEqual({ status: 'rejected', errorCode: 'rule_rejected' });
    expect(JSON.stringify(result)).not.toContain('protected correctness detail');
    expect(admin.rpc).toHaveBeenLastCalledWith('reject_authoritative_match_command_v2', expect.objectContaining({
      p_error_code: 'rule_rejected'
    }));
    expect(rankedCommandHttpStatus(result)).toBe(409);
  });

  it('classifies malformed canonical state without exposing evaluator details', async () => {
    const admin = createAdmin({
      begin_authoritative_match_command_v2: {
        data: { status: 'pending', actorRole: 'playerA', canonicalState: { revision: 0 } },
        error: null
      },
      reject_authoritative_match_command_v2: {
        data: { status: 'rejected', errorCode: 'invalid_canonical_state' },
        error: null
      }
    });

    const result = await processRankedCommand({
      admin,
      actorId: ACTOR_ID,
      command,
      evaluate: () => { throw new TypeError('secret canonical detail'); }
    });

    expect(result).toEqual({ status: 'rejected', errorCode: 'invalid_canonical_state' });
    expect(JSON.stringify(result)).not.toContain('secret canonical detail');
    expect(admin.rpc).toHaveBeenLastCalledWith('reject_authoritative_match_command_v2', expect.objectContaining({
      p_error_code: 'invalid_canonical_state'
    }));
  });

  it('maps authorization and stale revision rejections to safe HTTP statuses', async () => {
    expect(rankedCommandHttpStatus({ status: 'rejected', errorCode: 'unauthorized_actor' })).toBe(403);
    expect(rankedCommandHttpStatus({ status: 'rejected', errorCode: 'match_not_found' })).toBe(404);
    expect(rankedCommandHttpStatus({ status: 'rejected', errorCode: 'stale_revision' })).toBe(409);
    expect(rankedCommandHttpStatus({ status: 'accepted' })).toBe(200);
  });
});
