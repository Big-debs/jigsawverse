export const MATCH_STATE_SCHEMA_VERSION = 1;
export const MATCH_PROTOCOL_VERSION = 2;
export const ASSEMBLE_RULESET_VERSION = 1;

export const MATCH_COMMAND_TYPES = Object.freeze({
  PLACE_PIECE: 'place_piece',
  RESPOND_TO_CHECK: 'respond_to_check',
  MARK_PIECE: 'mark_piece',
  RESOLVE_NEXUS: 'resolve_nexus'
});

const COMMAND_TYPES = new Set(Object.values(MATCH_COMMAND_TYPES));
const PLAYERS = new Set(['playerA', 'playerB']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireNonEmptyString = (value, name) => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
};

const requireUuid = (value, name) => {
  requireNonEmptyString(value, name);
  if (!UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID`);
  }
  return value;
};

const requireNonNegativeInteger = (value, name) => {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative integer`);
  }
  return value;
};

const pieceId = (piece) => piece?.id ?? null;

const serializableCounter = (value) => Number.isFinite(value) ? value : null;

const cloneJsonValue = (value) => {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value));
};

function validateCommandPayload(type, payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new TypeError('payload must be an object');
  }

  const allowedKeys = {
    [MATCH_COMMAND_TYPES.PLACE_PIECE]: ['pieceId', 'gridIndex'],
    [MATCH_COMMAND_TYPES.RESPOND_TO_CHECK]: ['decision'],
    [MATCH_COMMAND_TYPES.MARK_PIECE]: ['gridIndex', 'markType'],
    [MATCH_COMMAND_TYPES.RESOLVE_NEXUS]: []
  }[type];
  const unexpectedKey = Object.keys(payload).find((key) => !allowedKeys.includes(key));
  if (unexpectedKey) {
    throw new TypeError(`payload.${unexpectedKey} is not allowed for ${type}`);
  }

  if (type === MATCH_COMMAND_TYPES.PLACE_PIECE) {
    requireNonNegativeInteger(payload.pieceId, 'payload.pieceId');
    requireNonNegativeInteger(payload.gridIndex, 'payload.gridIndex');
  }

  if (type === MATCH_COMMAND_TYPES.RESPOND_TO_CHECK && !['check', 'pass'].includes(payload.decision)) {
    throw new TypeError('payload.decision must be check or pass');
  }

  if (type === MATCH_COMMAND_TYPES.MARK_PIECE) {
    requireNonNegativeInteger(payload.gridIndex, 'payload.gridIndex');
    if (!['suspect', 'confident'].includes(payload.markType)) {
      throw new TypeError('payload.markType must be suspect or confident');
    }
  }

  if (type === MATCH_COMMAND_TYPES.RESOLVE_NEXUS && Object.keys(payload).length > 0) {
    throw new TypeError('resolve_nexus does not accept payload fields');
  }
}

export function assertMatchCommand(command) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new TypeError('command must be an object');
  }
  if (command.protocolVersion !== MATCH_PROTOCOL_VERSION) {
    throw new TypeError('command uses an unsupported protocol version');
  }

  requireUuid(command.gameId, 'gameId');
  requireUuid(command.commandId, 'commandId');
  requireNonNegativeInteger(command.expectedRevision, 'expectedRevision');
  if (!COMMAND_TYPES.has(command.type)) {
    throw new TypeError(`Unsupported match command type: ${command.type}`);
  }
  validateCommandPayload(command.type, command.payload);
  return command;
}

/**
 * Creates the command envelope sent by a client. Actor identity is deliberately
 * absent: trusted server code must derive it from the authenticated request.
 */
export function createMatchCommand({ gameId, commandId, expectedRevision, type, payload = {} }) {
  const command = {
    protocolVersion: MATCH_PROTOCOL_VERSION,
    gameId,
    commandId,
    expectedRevision,
    type,
    payload: { ...payload }
  };
  assertMatchCommand(command);

  command.payload = Object.freeze(command.payload);
  return Object.freeze(command);
}

/**
 * Produces the complete server-only Assemble state. This object contains
 * protected answers and true scores and must never be broadcast as-is.
 */
export function createCanonicalMatchState(gameLogic, metadata = {}) {
  if (!gameLogic || typeof gameLogic !== 'object') {
    throw new TypeError('gameLogic is required');
  }

  const revision = metadata.revision ?? 0;
  requireNonNegativeInteger(revision, 'metadata.revision');

  const gameId = metadata.gameId ?? null;
  if (gameId !== null) requireUuid(gameId, 'metadata.gameId');

  return {
    schemaVersion: MATCH_STATE_SCHEMA_VERSION,
    protocolVersion: MATCH_PROTOCOL_VERSION,
    rulesetVersion: metadata.rulesetVersion ?? ASSEMBLE_RULESET_VERSION,
    revision,
    match: {
      gameId,
      mode: gameLogic.mode,
      status: gameLogic.gameState,
      rows: gameLogic.rows,
      cols: gameLogic.cols,
      totalPieces: gameLogic.totalPieces,
      rackCapacity: gameLogic.rackCapacity,
      startedAt: metadata.startedAt ?? null,
      endsAt: metadata.endsAt ?? null
    },
    board: gameLogic.grid.map((piece) => piece ? {
      pieceId: piece.id,
      correctPosition: piece.correctPosition
    } : null),
    pieceCatalog: gameLogic.pieces.map((piece) => ({
      pieceId: piece.id,
      correctPosition: piece.correctPosition
    })),
    racks: {
      playerA: gameLogic.playerARack.map(pieceId),
      playerB: gameLogic.playerBRack.map(pieceId)
    },
    piecePool: gameLogic.piecePool.map(pieceId),
    currentTurn: gameLogic.currentTurn,
    scores: cloneJsonValue(gameLogic.scores),
    revealedScores: cloneJsonValue(gameLogic.revealedScores),
    pendingDecision: cloneJsonValue(gameLogic.pendingCheck),
    moveHistory: cloneJsonValue(gameLogic.moveHistory),
    turnsRemaining: {
      playerA: serializableCounter(gameLogic.turnsRemaining?.playerA),
      playerB: serializableCounter(gameLogic.turnsRemaining?.playerB)
    },
    checksRemaining: {
      playerA: serializableCounter(gameLogic.checksRemaining?.playerA),
      playerB: serializableCounter(gameLogic.checksRemaining?.playerB)
    },
    nextCheckRevealProgress: gameLogic.nextCheckRevealProgress,
    nexus: {
      piecePlacedBy: cloneJsonValue(gameLogic.piecePlacedBy),
      pieceMarks: cloneJsonValue(gameLogic.pieceMarks),
      resolved: Boolean(gameLogic.nexusResolved)
    },
    result: metadata.result ? cloneJsonValue(metadata.result) : null
  };
}

/**
 * Builds the only state shape permitted to leave the trusted boundary. True
 * scores, answer mappings, the piece pool, foreign rack IDs and move history
 * are intentionally excluded.
 */
export function createViewerProjection(canonicalState, viewer) {
  if (!canonicalState || canonicalState.schemaVersion !== MATCH_STATE_SCHEMA_VERSION) {
    throw new TypeError('Unsupported canonical state schema');
  }
  if (!PLAYERS.has(viewer)) {
    throw new TypeError('viewer must be playerA or playerB');
  }

  const opponent = viewer === 'playerA' ? 'playerB' : 'playerA';
  const publicResult = canonicalState.result ? {
    status: canonicalState.result.status ?? canonicalState.match.status,
    winner: canonicalState.result.winner ?? null,
    finalizedAt: canonicalState.result.finalizedAt ?? null
  } : null;

  return {
    schemaVersion: canonicalState.schemaVersion,
    protocolVersion: canonicalState.protocolVersion,
    rulesetVersion: canonicalState.rulesetVersion,
    revision: canonicalState.revision,
    match: cloneJsonValue(canonicalState.match),
    board: canonicalState.board.map((cell) => cell ? { pieceId: cell.pieceId } : null),
    rack: cloneJsonValue(canonicalState.racks[viewer]),
    opponentRackCount: canonicalState.racks[opponent].filter((id) => id !== null).length,
    piecePoolCount: canonicalState.piecePool.length,
    currentTurn: canonicalState.currentTurn,
    revealedScores: cloneJsonValue(canonicalState.revealedScores),
    turnsRemaining: cloneJsonValue(canonicalState.turnsRemaining),
    checksRemaining: cloneJsonValue(canonicalState.checksRemaining),
    nextCheckRevealProgress: canonicalState.nextCheckRevealProgress,
    nexus: cloneJsonValue(canonicalState.nexus),
    result: publicResult
  };
}
