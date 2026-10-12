import { assertMatchCommand } from './matchProtocol.js';
import { assertCanonicalMatchState } from './trustedMatchEvaluator.js';

export const SHADOW_PARITY_REPORT_VERSION = 1;

export const SHADOW_MISMATCH_CODES = Object.freeze({
  REVISION: 'revision',
  MATCH_STATUS: 'match_status',
  BOARD: 'board',
  PIECE_ANSWERS: 'piece_answers',
  PLAYER_A_RACK: 'player_a_rack',
  PLAYER_B_RACK: 'player_b_rack',
  PIECE_POOL: 'piece_pool',
  CURRENT_TURN: 'current_turn',
  TRUE_SCORES: 'true_scores',
  REVEALED_SCORES: 'revealed_scores',
  PENDING_DECISION: 'pending_decision',
  MOVE_HISTORY: 'move_history',
  TURNS_REMAINING: 'turns_remaining',
  CHECKS_REMAINING: 'checks_remaining',
  CHECK_REVEAL_PROGRESS: 'check_reveal_progress',
  NEXUS_OWNERSHIP: 'nexus_ownership',
  NEXUS_MARKS: 'nexus_marks',
  NEXUS_RESOLUTION: 'nexus_resolution',
  RESULT: 'result',
  SHADOW_EVALUATION_FAILED: 'shadow_evaluation_failed'
});

const clone = (value) => JSON.parse(JSON.stringify(value));

const stableValue = (value) => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, stableValue(value[key])])
  );
};

const equivalent = (left, right) => (
  JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))
);

const withoutTimestamp = (value) => Object.fromEntries(
  Object.entries(value).filter(([key]) => key !== 'timestamp')
);

const withoutTiming = (entries) => entries.map(withoutTimestamp);

const parityDimensions = [
  [SHADOW_MISMATCH_CODES.REVISION, (state) => state.revision],
  [SHADOW_MISMATCH_CODES.MATCH_STATUS, (state) => state.match.status],
  [SHADOW_MISMATCH_CODES.BOARD, (state) => state.board],
  [SHADOW_MISMATCH_CODES.PIECE_ANSWERS, (state) => state.pieceCatalog],
  [SHADOW_MISMATCH_CODES.PLAYER_A_RACK, (state) => state.racks.playerA],
  [SHADOW_MISMATCH_CODES.PLAYER_B_RACK, (state) => state.racks.playerB],
  [SHADOW_MISMATCH_CODES.PIECE_POOL, (state) => state.piecePool],
  [SHADOW_MISMATCH_CODES.CURRENT_TURN, (state) => state.currentTurn],
  [SHADOW_MISMATCH_CODES.TRUE_SCORES, (state) => state.scores],
  [SHADOW_MISMATCH_CODES.REVEALED_SCORES, (state) => state.revealedScores],
  [SHADOW_MISMATCH_CODES.PENDING_DECISION, (state) => {
    if (!state.pendingDecision) return null;
    return withoutTimestamp(state.pendingDecision);
  }],
  [SHADOW_MISMATCH_CODES.MOVE_HISTORY, (state) => withoutTiming(state.moveHistory)],
  [SHADOW_MISMATCH_CODES.TURNS_REMAINING, (state) => state.turnsRemaining],
  [SHADOW_MISMATCH_CODES.CHECKS_REMAINING, (state) => state.checksRemaining],
  [SHADOW_MISMATCH_CODES.CHECK_REVEAL_PROGRESS, (state) => state.nextCheckRevealProgress],
  [SHADOW_MISMATCH_CODES.NEXUS_OWNERSHIP, (state) => state.nexus.piecePlacedBy],
  [SHADOW_MISMATCH_CODES.NEXUS_MARKS, (state) => state.nexus.pieceMarks],
  [SHADOW_MISMATCH_CODES.NEXUS_RESOLUTION, (state) => state.nexus.resolved],
  [SHADOW_MISMATCH_CODES.RESULT, (state) => state.result ? {
    status: state.result.status ?? state.match.status,
    winner: state.result.winner ?? null
  } : null]
];

const checkedAtIso = (checkedAt) => {
  const date = checkedAt instanceof Date ? checkedAt : new Date(checkedAt);
  if (Number.isNaN(date.getTime())) throw new TypeError('checkedAt must be a valid date');
  return date.toISOString();
};

const reportEnvelope = ({ command, authoritativeRevision, shadowRevision, checkedAt }) => ({
  reportVersion: SHADOW_PARITY_REPORT_VERSION,
  gameId: command.gameId,
  commandId: command.commandId,
  commandType: command.type,
  expectedRevision: command.expectedRevision,
  authoritativeRevision,
  shadowRevision,
  checkedAt: checkedAtIso(checkedAt)
});

/**
 * Compares protected state inside the trusted boundary. The report contains
 * only identifiers, revisions and stable mismatch codes, never compared data.
 */
export function compareShadowMatchStates({
  authoritativeState,
  shadowState,
  command,
  checkedAt = new Date()
}) {
  assertMatchCommand(command);
  assertCanonicalMatchState(authoritativeState, command.gameId);
  assertCanonicalMatchState(shadowState, command.gameId);

  const mismatchCodes = parityDimensions
    .filter(([, select]) => !equivalent(select(authoritativeState), select(shadowState)))
    .map(([code]) => code);

  return Object.freeze({
    ...reportEnvelope({
      command,
      authoritativeRevision: authoritativeState.revision,
      shadowRevision: shadowState.revision,
      checkedAt
    }),
    status: mismatchCodes.length === 0 ? 'parity' : 'diverged',
    mismatchCodes: Object.freeze(mismatchCodes)
  });
}

/**
 * Runs a caller-supplied legacy/shadow evaluator without allowing comparison
 * or reporting failures to affect the authoritative result.
 */
export async function observeShadowParity({
  baselineState,
  authoritativeEvaluation,
  command,
  actorRole,
  shadowEvaluate,
  emitReport = () => {},
  now = new Date()
}) {
  if (typeof shadowEvaluate !== 'function') {
    throw new TypeError('shadowEvaluate must be a function');
  }
  if (typeof emitReport !== 'function') {
    throw new TypeError('emitReport must be a function');
  }

  let report;
  try {
    const shadowEvaluation = await shadowEvaluate({
      canonicalState: clone(baselineState),
      command,
      actorRole,
      now
    });
    report = compareShadowMatchStates({
      authoritativeState: authoritativeEvaluation.canonicalState,
      shadowState: shadowEvaluation.canonicalState,
      command,
      checkedAt: now
    });
  } catch {
    report = Object.freeze({
      ...reportEnvelope({
        command,
        authoritativeRevision: authoritativeEvaluation?.canonicalState?.revision ?? null,
        shadowRevision: null,
        checkedAt: now
      }),
      status: 'shadow_error',
      mismatchCodes: Object.freeze([SHADOW_MISMATCH_CODES.SHADOW_EVALUATION_FAILED])
    });
  }

  try {
    await emitReport(report);
  } catch {
    // Shadow telemetry must never affect authoritative command processing.
  }
  return report;
}
