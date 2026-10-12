import { GameLogic } from './gameLogic.js';
import {
  ASSEMBLE_RULESET_VERSION,
  MATCH_COMMAND_TYPES,
  MATCH_PROTOCOL_VERSION,
  MATCH_STATE_SCHEMA_VERSION,
  assertMatchCommand,
  createViewerProjection
} from './matchProtocol.js';

const PLAYER_ROLES = new Set(['playerA', 'playerB']);

const clone = (value) => JSON.parse(JSON.stringify(value));

const assertInteger = (value, name, minimum = 0) => {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer of at least ${minimum}`);
  }
};

const collectPieceIds = (state) => [
  ...state.board.filter(Boolean).map((cell) => cell.pieceId),
  ...state.racks.playerA.filter((id) => id !== null),
  ...state.racks.playerB.filter((id) => id !== null),
  ...state.piecePool
];

export function assertCanonicalMatchState(state, expectedGameId = null) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    throw new TypeError('Canonical state must be an object');
  }
  if (state.schemaVersion !== MATCH_STATE_SCHEMA_VERSION) {
    throw new TypeError('Canonical state uses an unsupported schema version');
  }
  if (state.protocolVersion !== MATCH_PROTOCOL_VERSION) {
    throw new TypeError('Canonical state uses an unsupported protocol version');
  }
  if (state.rulesetVersion !== ASSEMBLE_RULESET_VERSION) {
    throw new TypeError('Canonical state uses an unsupported ruleset version');
  }
  assertInteger(state.revision, 'Canonical revision');

  const match = state.match;
  if (!match || typeof match !== 'object') throw new TypeError('Canonical match metadata is required');
  if (expectedGameId && match.gameId !== expectedGameId) {
    throw new TypeError('Canonical state belongs to a different match');
  }
  assertInteger(match.rows, 'match.rows', 1);
  assertInteger(match.cols, 'match.cols', 1);
  assertInteger(match.totalPieces, 'match.totalPieces', 1);
  assertInteger(match.rackCapacity, 'match.rackCapacity', 1);
  if (match.rows * match.cols !== match.totalPieces) {
    throw new TypeError('Canonical board dimensions do not match totalPieces');
  }
  if (!Array.isArray(state.board) || state.board.length !== match.totalPieces) {
    throw new TypeError('Canonical board length does not match totalPieces');
  }
  if (!Array.isArray(state.pieceCatalog) || state.pieceCatalog.length !== match.totalPieces) {
    throw new TypeError('Canonical piece catalogue length does not match totalPieces');
  }
  if (!state.racks || !Array.isArray(state.racks.playerA) || !Array.isArray(state.racks.playerB)) {
    throw new TypeError('Canonical player racks are required');
  }
  if (!Array.isArray(state.piecePool)) throw new TypeError('Canonical piece pool is required');
  if (!Array.isArray(state.moveHistory)) throw new TypeError('Canonical move history is required');
  if (!state.scores || !state.revealedScores) throw new TypeError('Canonical score state is required');
  if (!state.nexus || typeof state.nexus !== 'object') throw new TypeError('Canonical Nexus state is required');

  for (const timestamp of [match.startedAt, match.endsAt].filter(Boolean)) {
    if (Number.isNaN(new Date(timestamp).getTime())) {
      throw new TypeError('Canonical match timestamps must be valid dates');
    }
  }

  const catalogueIds = new Set();
  const answerPositions = new Set();
  const answerByPieceId = new Map();
  for (const entry of state.pieceCatalog) {
    assertInteger(entry?.pieceId, 'pieceCatalog.pieceId');
    assertInteger(entry?.correctPosition, 'pieceCatalog.correctPosition');
    if (entry.correctPosition >= match.totalPieces) {
      throw new TypeError('Piece answer is outside the board');
    }
    if (catalogueIds.has(entry.pieceId) || answerPositions.has(entry.correctPosition)) {
      throw new TypeError('Piece catalogue IDs and answers must be unique');
    }
    catalogueIds.add(entry.pieceId);
    answerPositions.add(entry.correctPosition);
    answerByPieceId.set(entry.pieceId, entry.correctPosition);
  }

  state.board.forEach((cell) => {
    if (!cell) return;
    if (!catalogueIds.has(cell.pieceId)) throw new TypeError('Board contains an unknown piece');
    if (cell.correctPosition !== answerByPieceId.get(cell.pieceId)) {
      throw new TypeError('Board answer mapping differs from the piece catalogue');
    }
  });

  const distributedIds = collectPieceIds(state);
  if (distributedIds.length !== match.totalPieces || new Set(distributedIds).size !== match.totalPieces) {
    throw new TypeError('Every piece must appear exactly once across board, racks, and pool');
  }
  if (distributedIds.some((id) => !catalogueIds.has(id))) {
    throw new TypeError('Piece distribution contains an unknown piece');
  }

  return state;
}

function hydrateGameLogic(state) {
  const pieces = state.pieceCatalog.map(({ pieceId, correctPosition }) => ({
    id: pieceId,
    correctPosition
  }));
  const logic = new GameLogic({
    rows: state.match.rows,
    cols: state.match.cols,
    totalPieces: state.match.totalPieces
  }, pieces, state.match.mode);

  logic.rackCapacity = state.match.rackCapacity;
  logic.importGameState({
    grid: state.board.map((cell) => cell?.pieceId ?? null),
    playerARack: clone(state.racks.playerA),
    playerBRack: clone(state.racks.playerB),
    piecePool: clone(state.piecePool),
    currentTurn: state.currentTurn,
    scores: clone(state.scores),
    revealedScores: clone(state.revealedScores),
    pendingCheck: clone(state.pendingDecision),
    moveHistory: clone(state.moveHistory),
    gameState: state.match.status,
    mode: state.match.mode,
    turnsRemaining: clone(state.turnsRemaining),
    checksRemaining: clone(state.checksRemaining),
    nextCheckRevealProgress: state.nextCheckRevealProgress,
    piecePlacedBy: clone(state.nexus.piecePlacedBy),
    pieceMarks: clone(state.nexus.pieceMarks),
    nexusResolved: state.nexus.resolved
  }, pieces);

  return logic;
}

function applyCommand(logic, actorRole, command) {
  switch (command.type) {
    case MATCH_COMMAND_TYPES.PLACE_PIECE:
      return logic.placePiece(actorRole, command.payload.pieceId, command.payload.gridIndex);
    case MATCH_COMMAND_TYPES.RESPOND_TO_CHECK:
      if (logic.pendingCheck?.player === actorRole) {
        throw new Error('The placing player cannot answer their own pending check');
      }
      return logic.handleOpponentCheck(actorRole, command.payload.decision);
    case MATCH_COMMAND_TYPES.MARK_PIECE:
      return logic.markPiece(actorRole, command.payload.gridIndex, command.payload.markType);
    case MATCH_COMMAND_TYPES.RESOLVE_NEXUS:
      return logic.resolveNexusEndGame();
    default:
      throw new TypeError(`Unsupported match command type: ${command.type}`);
  }
}

/**
 * Applies one command inside the trusted worker. The returned rule result is
 * server-only because existing GameLogic results can contain correctness.
 */
export function evaluateTrustedMatchCommand({ canonicalState, command, actorRole, now = new Date() }) {
  assertMatchCommand(command);
  assertCanonicalMatchState(canonicalState, command.gameId);
  if (!PLAYER_ROLES.has(actorRole)) throw new TypeError('actorRole must be playerA or playerB');
  if (command.expectedRevision !== canonicalState.revision) {
    throw new Error('Command revision does not match canonical state');
  }
  if (canonicalState.match.status !== 'active') {
    throw new Error('Match is not active');
  }

  const evaluatedAt = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(evaluatedAt.getTime())) throw new TypeError('now must be a valid date');
  if (canonicalState.match.endsAt && evaluatedAt >= new Date(canonicalState.match.endsAt)) {
    throw new Error('Match deadline has expired');
  }

  const logic = hydrateGameLogic(canonicalState);
  const pinnedPieceCatalog = JSON.stringify(canonicalState.pieceCatalog);
  const priorMoveCount = logic.moveHistory.length;
  const ruleResult = applyCommand(logic, actorRole, command);
  if (!ruleResult?.success) {
    throw new Error(ruleResult?.message || 'Command was rejected by the ruleset');
  }

  if (logic.moveHistory.length > priorMoveCount) {
    logic.moveHistory[logic.moveHistory.length - 1].timestamp = evaluatedAt.getTime();
  }

  if (logic.mode !== 'NEXUS' && logic.isGameComplete() && !logic.pendingCheck) {
    logic.gameState = 'finished';
  }

  const isFinished = logic.gameState === 'finished';
  const canonicalResult = isFinished ? {
    status: 'finished',
    winner: logic.getWinner(),
    finalizedAt: evaluatedAt.toISOString(),
    ruleResult: clone(ruleResult)
  } : canonicalState.result;

  const nextState = logic.exportCanonicalState({
    gameId: canonicalState.match.gameId,
    revision: canonicalState.revision + 1,
    rulesetVersion: canonicalState.rulesetVersion,
    startedAt: canonicalState.match.startedAt,
    endsAt: canonicalState.match.endsAt,
    result: canonicalResult
  });
  assertCanonicalMatchState(nextState, command.gameId);
  if (JSON.stringify(nextState.pieceCatalog) !== pinnedPieceCatalog) {
    throw new Error('Piece answer mapping changed during command evaluation');
  }

  return {
    canonicalState: nextState,
    projections: {
      playerA: createViewerProjection(nextState, 'playerA'),
      playerB: createViewerProjection(nextState, 'playerB')
    },
    ruleResult
  };
}
