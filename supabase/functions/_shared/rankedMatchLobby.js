const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GAME_CODE_PATTERN = /^[A-Z0-9]{6}$/;
const MODES = new Set(['CLASSIC', 'SUPER', 'SAGE', 'NEXUS', 'SAVANT']);

export class RankedMatchLobbyError extends Error {
  constructor(message, { code = 'lobby_failed', status = 500 } = {}) {
    super(message);
    this.name = 'RankedMatchLobbyError';
    this.code = code;
    this.status = status;
  }
}

const fail = (message, code, status) => {
  throw new RankedMatchLobbyError(message, { code, status });
};

const requireUuid = (value, name) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    fail(`${name} must be a UUID`, 'invalid_request', 400);
  }
};

const normalizedCode = (value) => {
  const code = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!GAME_CODE_PATTERN.test(code)) fail('gameCode is invalid', 'invalid_request', 400);
  return code;
};

const rpcRow = (data) => Array.isArray(data) ? data[0] : data;

const queryOne = async (query, code) => {
  const { data, error } = await query.maybeSingle();
  if (error) fail('Trusted lobby query failed', 'database_query_failed', 500);
  if (!data) fail('Lobby was not found', code, 404);
  return data;
};

export async function resolveMatchAuthority({ admin, gameCode }) {
  const code = normalizedCode(gameCode);
  const game = await queryOne(
    admin.from('games')
      .select('id, status, host_id, player_a_id, player_b_id')
      .eq('game_code', code),
    'lobby_not_found'
  );
  const { data: pin, error } = await admin.from('match_authority_pins')
    .select('authority_model')
    .eq('game_id', game.id)
    .maybeSingle();
  if (error) fail('Authority lookup failed', 'database_query_failed', 500);
  return {
    gameId: game.id,
    lobbyStatus: game.status,
    authorityModel: pin?.authority_model ?? 'legacy',
    game
  };
}

export async function createRankedLobby({ admin, actorId, input }) {
  requireUuid(actorId, 'actorId');
  requireUuid(input?.imageId, 'imageId');
  const rows = input?.rows;
  const cols = input?.cols;
  const rackCapacity = input?.rackCapacity ?? 10;
  const timeLimit = input?.timeLimit;
  const gameplayMode = input?.gameplayMode;
  if (!Number.isInteger(rows) || rows < 5 || rows > 15
    || !Number.isInteger(cols) || cols < 5 || cols > 15
    || !Number.isInteger(rackCapacity) || rackCapacity < 1
    || !Number.isInteger(timeLimit) || timeLimit < 60 || timeLimit > 7200
    || !MODES.has(gameplayMode)) {
    fail('Ranked match settings are invalid', 'invalid_request', 400);
  }
  const { data, error } = await admin.rpc('create_ranked_match_lobby_v2', {
    p_actor_id: actorId,
    p_image_id: input.imageId,
    p_player_name: input.playerName ?? null,
    p_rows: rows,
    p_cols: cols,
    p_gameplay_mode: gameplayMode,
    p_rack_capacity: rackCapacity,
    p_time_limit: timeLimit
  });
  const row = rpcRow(data);
  if (error || !row?.game_id || !row?.game_code) {
    fail('Unable to create ranked lobby', 'lobby_create_failed', 500);
  }
  return {
    status: 'created',
    authorityModel: 'authoritative_v2',
    gameId: row.game_id,
    gameCode: row.game_code,
    lobbyStatus: row.lobby_status,
    assetStatus: row.asset_status
  };
}

export async function joinLobby({ admin, actorId, input }) {
  requireUuid(actorId, 'actorId');
  const resolved = await resolveMatchAuthority({ admin, gameCode: input?.gameCode });
  if (resolved.authorityModel === 'legacy') {
    return {
      status: 'resolved',
      authorityModel: 'legacy',
      gameId: resolved.gameId,
      lobbyStatus: resolved.lobbyStatus
    };
  }
  if (resolved.authorityModel !== 'authoritative_v2') {
    fail('Match authority is unsupported', 'authority_mismatch', 409);
  }
  const { data, error } = await admin.rpc('join_ranked_match_lobby_v2', {
    p_actor_id: actorId,
    p_game_code: normalizedCode(input?.gameCode),
    p_player_name: input?.playerName ?? null
  });
  const row = rpcRow(data);
  if (error || !row?.game_id) fail('Unable to join ranked lobby', 'lobby_join_failed', 409);
  return {
    status: 'joined',
    authorityModel: 'authoritative_v2',
    gameId: row.game_id,
    gameCode: row.game_code,
    lobbyStatus: row.lobby_status,
    assetStatus: row.asset_status
  };
}

export async function getLobbyStatus({ admin, actorId, gameId }) {
  requireUuid(actorId, 'actorId');
  requireUuid(gameId, 'gameId');
  const game = await queryOne(
    admin.from('games')
      .select('id, game_code, status, player_a_id, player_b_id, player_b_name')
      .eq('id', gameId),
    'lobby_not_found'
  );
  if (![game.player_a_id, game.player_b_id].includes(actorId)) {
    fail('Actor is not assigned to the lobby', 'unauthorized_actor', 403);
  }
  const job = await queryOne(
    admin.from('ranked_match_jobs').select('status').eq('game_id', gameId),
    'asset_job_not_found'
  );
  return {
    status: 'ok',
    authorityModel: 'authoritative_v2',
    gameId,
    gameCode: game.game_code,
    lobbyStatus: game.status,
    assetStatus: job.status,
    opponentJoined: Boolean(game.player_b_id),
    opponentName: actorId === game.player_a_id ? game.player_b_name : null,
    ready: game.status === 'active' && job.status === 'prepared'
  };
}

export function handleRankedLobbyAction({ admin, actorId, body }) {
  switch (body?.action) {
    case 'create': return createRankedLobby({ admin, actorId, input: body });
    case 'join': return joinLobby({ admin, actorId, input: body });
    case 'status': return getLobbyStatus({ admin, actorId, gameId: body?.gameId });
    default: fail('Lobby action is invalid', 'invalid_request', 400);
  }
}
