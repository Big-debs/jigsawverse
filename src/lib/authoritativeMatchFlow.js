import { AuthoritativeLobbyService } from './authoritativeLobbyService.js';
import { AuthoritativeMultiplayerClient } from './authoritativeMultiplayerClient.js';
import { SupabaseAuthoritativeMatchTransport } from './supabaseAuthoritativeMatchTransport.js';
import { MULTIPLAYER_AUTHORITY } from '../config/featureFlags.js';

export class AuthoritativeMatchFlowError extends Error {
  constructor(message, { code = 'authoritative_match_flow_failed' } = {}) {
    super(message);
    this.name = 'AuthoritativeMatchFlowError';
    this.code = code;
  }
}

const wait = (milliseconds, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(new AuthoritativeMatchFlowError('Match preparation was cancelled', { code: 'cancelled' }));
    return;
  }
  const onAbort = () => {
    clearTimeout(timeout);
    reject(new AuthoritativeMatchFlowError('Match preparation was cancelled', { code: 'cancelled' }));
  };
  const timeout = setTimeout(() => {
    signal?.removeEventListener('abort', onAbort);
    resolve();
  }, milliseconds);
  signal?.addEventListener('abort', onAbort, { once: true });
});

export async function waitForAuthoritativeMatch({
  lobbyService,
  gameId,
  signal,
  pollIntervalMs = 1500,
  maximumAttempts = 400,
  delay = wait,
  onStatus
}) {
  if (!(lobbyService instanceof AuthoritativeLobbyService)
    && typeof lobbyService?.status !== 'function') {
    throw new TypeError('lobbyService.status is required');
  }
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    if (signal?.aborted) {
      throw new AuthoritativeMatchFlowError('Match preparation was cancelled', { code: 'cancelled' });
    }
    const status = await lobbyService.status(gameId);
    onStatus?.(status);
    if (status.assetStatus === 'failed') {
      throw new AuthoritativeMatchFlowError('Puzzle preparation failed', {
        code: 'asset_preparation_failed'
      });
    }
    if (status.ready) return status;
    if (attempt < maximumAttempts) await delay(pollIntervalMs, signal);
  }
  throw new AuthoritativeMatchFlowError('Puzzle preparation timed out', {
    code: 'preparation_timeout'
  });
}

export async function bootstrapAuthoritativeMatch({ supabase, userId, gameId }) {
  const transport = new SupabaseAuthoritativeMatchTransport({ supabase });
  const bootstrap = await transport.bootstrapMatch({ gameId });
  const client = new AuthoritativeMultiplayerClient({
    gameId,
    userId,
    viewerRole: bootstrap.viewerRole,
    transport,
    pieceAssets: bootstrap.pieceAssets
  });
  client.applyProjection(bootstrap.projection);
  await client.connect();
  const match = bootstrap.projection.match;
  return {
    client,
    gameData: {
      gameId,
      authorityModel: MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2,
      gameState: client.gameState,
      gridDimensions: {
        rows: match.rows,
        cols: match.cols,
        totalPieces: match.totalPieces
      },
      isSinglePlayer: false
    }
  };
}
