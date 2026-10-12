import { assertMatchCommand } from '../../../src/lib/matchProtocol.js';
import { evaluateTrustedMatchCommand } from '../../../src/lib/trustedMatchEvaluator.js';

export class RankedCommandWorkerError extends Error {
  constructor(message, { code = 'worker_error', status = 500 } = {}) {
    super(message);
    this.name = 'RankedCommandWorkerError';
    this.code = code;
    this.status = status;
  }
}

async function callRpc(admin, name, parameters) {
  const { data, error } = await admin.rpc(name, parameters);
  if (error) {
    throw new RankedCommandWorkerError(`Database RPC failed: ${name}`, {
      code: 'database_rpc_failed',
      status: 500
    });
  }
  if (!data || typeof data !== 'object') {
    throw new RankedCommandWorkerError(`Database RPC returned no result: ${name}`, {
      code: 'database_rpc_invalid_result',
      status: 500
    });
  }
  return data;
}

const rejectionStatus = (errorCode) => {
  if (errorCode === 'unauthorized_actor') return 403;
  if (errorCode === 'match_not_found') return 404;
  if (['invalid_command_type', 'invalid_payload', 'invalid_revision'].includes(errorCode)) return 400;
  return 409;
};

export function rankedCommandHttpStatus(result) {
  return result?.status === 'rejected' ? rejectionStatus(result.errorCode) : 200;
}

/**
 * Orchestrates the server-only begin -> evaluate -> commit sequence. The actor
 * ID must come from verified authentication, never from the request body.
 */
export async function processRankedCommand({
  admin,
  actorId,
  command,
  now = new Date(),
  evaluate = evaluateTrustedMatchCommand
}) {
  if (!admin || typeof admin.rpc !== 'function') {
    throw new RankedCommandWorkerError('Admin database client is required');
  }

  try {
    assertMatchCommand(command);
  } catch (error) {
    throw new RankedCommandWorkerError(error.message, {
      code: 'invalid_command',
      status: 400
    });
  }

  const rpcIdentity = {
    p_game_id: command.gameId,
    p_command_id: command.commandId,
    p_actor_id: actorId,
    p_expected_revision: command.expectedRevision
  };
  const begun = await callRpc(admin, 'begin_authoritative_match_command_v2', {
    ...rpcIdentity,
    p_command_type: command.type,
    p_payload: command.payload
  });

  // Accepted/rejected duplicates are already sanitized by the database RPC.
  if (begun.status !== 'pending') return begun;
  if (!['playerA', 'playerB'].includes(begun.actorRole) || !begun.canonicalState) {
    throw new RankedCommandWorkerError('Begin RPC omitted trusted evaluation data', {
      code: 'database_rpc_invalid_result',
      status: 500
    });
  }

  let evaluation;
  try {
    evaluation = evaluate({
      canonicalState: begun.canonicalState,
      command,
      actorRole: begun.actorRole,
      now
    });
  } catch (error) {
    const errorCode = error instanceof TypeError
      ? 'invalid_canonical_state'
      : 'rule_rejected';
    return callRpc(admin, 'reject_authoritative_match_command_v2', {
      ...rpcIdentity,
      p_error_code: errorCode
    });
  }

  return callRpc(admin, 'commit_authoritative_match_command_v2', {
    ...rpcIdentity,
    p_new_canonical_state: evaluation.canonicalState,
    p_player_a_projection: evaluation.projections.playerA,
    p_player_b_projection: evaluation.projections.playerB,
    p_result: evaluation.canonicalState.result
  });
}

