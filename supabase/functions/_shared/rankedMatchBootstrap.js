import { GameLogic } from '../../../src/lib/gameLogic.js';
import { GAME_MODES } from '../../../src/lib/gameModes.js';
import {
  ASSEMBLE_RULESET_VERSION,
  MATCH_PROTOCOL_VERSION,
  MATCH_STATE_SCHEMA_VERSION,
  createViewerProjection
} from '../../../src/lib/matchProtocol.js';
import { assertCanonicalMatchState } from '../../../src/lib/trustedMatchEvaluator.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MIN_OPAQUE_PIECE_ID = 1_000_000_000;

export class RankedMatchBootstrapError extends Error {
  constructor(message, { code = 'bootstrap_failed', status = 500 } = {}) {
    super(message);
    this.name = 'RankedMatchBootstrapError';
    this.code = code;
    this.status = status;
  }
}

const fail = (message, code = 'invalid_manifest', status = 500) => {
  throw new RankedMatchBootstrapError(message, { code, status });
};

const requireUuid = (value, name) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`${name} must be a UUID`, 'invalid_request', 400);
  }
};

const queryOne = async (query, code) => {
  const { data, error } = await query.maybeSingle();
  if (error) fail('Trusted bootstrap query failed', 'database_query_failed');
  if (!data) fail('Trusted bootstrap record was not found', code, 404);
  return data;
};

const defaultRandomIndex = (maxExclusive) => {
  const maximum = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
  const value = new Uint32Array(1);
  do globalThis.crypto.getRandomValues(value);
  while (value[0] >= maximum);
  return value[0] % maxExclusive;
};

const shuffled = (values, randomIndex) => {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = randomIndex(index + 1);
    if (!Number.isInteger(swap) || swap < 0 || swap > index) {
      fail('Random source returned an invalid index');
    }
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
};

export function validateRankedPuzzleManifest(manifest) {
  const rows = manifest?.rows;
  const cols = manifest?.cols;
  const rackCapacity = manifest?.rack_capacity;
  const mode = manifest?.gameplay_mode;
  if (!Number.isInteger(rows) || rows < 1 || !Number.isInteger(cols) || cols < 1) {
    fail('Manifest dimensions are invalid');
  }
  if (!Number.isInteger(rackCapacity) || rackCapacity < 1) fail('Manifest rack capacity is invalid');
  if (!GAME_MODES[mode]?.multiplayer) fail('Manifest gameplay mode is invalid');

  const totalPieces = rows * cols;
  if (!Array.isArray(manifest.piece_catalog) || manifest.piece_catalog.length !== totalPieces) {
    fail('Manifest piece catalogue length is invalid');
  }
  if (!Array.isArray(manifest.asset_manifest) || manifest.asset_manifest.length !== totalPieces) {
    fail('Manifest asset list length is invalid');
  }

  const ids = new Set();
  const positions = new Set();
  for (const piece of manifest.piece_catalog) {
    if (!Number.isSafeInteger(piece?.pieceId) || piece.pieceId < MIN_OPAQUE_PIECE_ID) {
      fail('Manifest piece IDs must use the opaque server namespace');
    }
    if (!Number.isInteger(piece.correctPosition)
      || piece.correctPosition < 0
      || piece.correctPosition >= totalPieces) {
      fail('Manifest answer position is invalid');
    }
    if (ids.has(piece.pieceId) || positions.has(piece.correctPosition)) {
      fail('Manifest piece IDs and answer positions must be unique');
    }
    ids.add(piece.pieceId);
    positions.add(piece.correctPosition);
  }

  const assetIds = new Set();
  const safeAssets = manifest.asset_manifest.map((asset) => {
    if (!ids.has(asset?.pieceId) || assetIds.has(asset.pieceId)) {
      fail('Manifest asset IDs must match the piece catalogue exactly');
    }
    if (typeof asset.assetUrl !== 'string' || asset.assetUrl.trim() === '') {
      fail('Manifest asset URL is invalid');
    }
    const forbidden = ['correctPosition', 'row', 'col', 'edges']
      .find((key) => Object.hasOwn(asset, key));
    if (forbidden) fail(`Manifest asset contains forbidden field: ${forbidden}`);
    assetIds.add(asset.pieceId);
    return {
      id: asset.pieceId,
      imageData: asset.assetUrl,
      isEdge: Boolean(asset.isEdge)
    };
  });
  if (assetIds.size !== ids.size) fail('Manifest assets are incomplete');

  return {
    rows,
    cols,
    totalPieces,
    rackCapacity,
    mode,
    pieceCatalog: manifest.piece_catalog.map(({ pieceId, correctPosition }) => ({
      pieceId,
      correctPosition
    })),
    safeAssets
  };
}

export function buildInitialRankedMatch({
  gameId,
  manifest,
  startedAt,
  endsAt,
  randomIndex = defaultRandomIndex
}) {
  requireUuid(gameId, 'gameId');
  const prepared = validateRankedPuzzleManifest(manifest);
  const pieces = prepared.pieceCatalog.map(({ pieceId, correctPosition }) => ({
    id: pieceId,
    correctPosition
  }));
  const distributed = shuffled(pieces, randomIndex);
  const logic = new GameLogic({
    rows: prepared.rows,
    cols: prepared.cols,
    totalPieces: prepared.totalPieces
  }, pieces, prepared.mode);
  logic.rackCapacity = prepared.rackCapacity;
  logic.playerARack = distributed.splice(0, prepared.rackCapacity);
  logic.playerBRack = distributed.splice(0, prepared.rackCapacity);
  logic.piecePool = distributed;
  logic.gameState = 'active';

  const canonicalState = logic.exportCanonicalState({
    gameId,
    revision: 0,
    rulesetVersion: ASSEMBLE_RULESET_VERSION,
    startedAt,
    endsAt
  });
  assertCanonicalMatchState(canonicalState, gameId);
  return {
    canonicalState,
    projections: {
      playerA: createViewerProjection(canonicalState, 'playerA'),
      playerB: createViewerProjection(canonicalState, 'playerB')
    },
    pieceAssets: prepared.safeAssets
  };
}

const fetchProjection = async (admin, gameId, actorId) => {
  const { data, error } = await admin
    .from('match_projections')
    .select('viewer_role, projection')
    .eq('game_id', gameId)
    .eq('viewer_id', actorId)
    .maybeSingle();
  if (error) fail('Projection lookup failed', 'database_query_failed');
  return data;
};

export async function bootstrapRankedMatch({
  admin,
  actorId,
  gameId,
  now = new Date(),
  randomIndex = defaultRandomIndex
}) {
  if (!admin || typeof admin.from !== 'function' || typeof admin.rpc !== 'function') {
    throw new TypeError('Admin database client is required');
  }
  requireUuid(actorId, 'actorId');
  requireUuid(gameId, 'gameId');

  const game = await queryOne(
    admin.from('games')
      .select('id, status, player_a_id, player_b_id, started_at, time_limit')
      .eq('id', gameId),
    'match_not_found'
  );
  const viewerRole = actorId === game.player_a_id
    ? 'playerA'
    : actorId === game.player_b_id ? 'playerB' : null;
  if (!viewerRole) fail('Actor is not assigned to the match', 'unauthorized_actor', 403);
  if (!game.player_a_id || !game.player_b_id) fail('Ranked match requires two players', 'players_not_ready', 409);

  const pin = await queryOne(
    admin.from('match_authority_pins')
      .select('authority_model')
      .eq('game_id', gameId),
    'authority_not_pinned'
  );
  if (pin.authority_model !== 'authoritative_v2') {
    fail('Match is pinned to another authority', 'authority_mismatch', 409);
  }

  const manifest = await queryOne(
    admin.from('ranked_puzzle_manifests')
      .select('rows, cols, gameplay_mode, rack_capacity, piece_catalog, asset_manifest')
      .eq('game_id', gameId),
    'manifest_not_ready'
  );
  const prepared = validateRankedPuzzleManifest(manifest);
  let stored = await fetchProjection(admin, gameId, actorId);
  if (!stored) {
    if (game.status !== 'active') fail('Match is not ready to start', 'match_not_active', 409);
    const evaluatedAt = now instanceof Date ? now : new Date(now);
    if (Number.isNaN(evaluatedAt.getTime())) fail('Bootstrap time is invalid');
    const startedAt = game.started_at
      ? new Date(game.started_at)
      : evaluatedAt;
    const timeLimit = Number.isInteger(game.time_limit) && game.time_limit > 0
      ? game.time_limit
      : 600;
    const endsAt = new Date(startedAt.getTime() + timeLimit * 1000);
    const initial = buildInitialRankedMatch({
      gameId,
      manifest,
      startedAt: startedAt.toISOString(),
      endsAt: endsAt.toISOString(),
      randomIndex
    });

    const { error } = await admin.rpc('initialize_authoritative_match_v2', {
      p_game_id: gameId,
      p_canonical_state: initial.canonicalState,
      p_player_a_projection: initial.projections.playerA,
      p_player_b_projection: initial.projections.playerB,
      p_started_at: startedAt.toISOString(),
      p_ends_at: endsAt.toISOString(),
      p_schema_version: MATCH_STATE_SCHEMA_VERSION,
      p_protocol_version: MATCH_PROTOCOL_VERSION,
      p_ruleset_version: ASSEMBLE_RULESET_VERSION
    });
    stored = await fetchProjection(admin, gameId, actorId);
    if (error && !stored) fail('Authoritative initialization failed', 'initialization_failed');
    if (!stored) fail('Authoritative projection was not created', 'initialization_failed');
  }

  return {
    status: 'ready',
    authorityModel: 'authoritative_v2',
    viewerRole: stored.viewer_role,
    projection: stored.projection,
    pieceAssets: prepared.safeAssets
  };
}
