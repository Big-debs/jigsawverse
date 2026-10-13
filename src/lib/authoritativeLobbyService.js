import { MULTIPLAYER_AUTHORITY } from '../config/featureFlags.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class AuthoritativeLobbyError extends Error {
  constructor(message, { code = 'lobby_request_failed', retryable = true } = {}) {
    super(message);
    this.name = 'AuthoritativeLobbyError';
    this.code = code;
    this.retryable = retryable;
  }
}

export class AuthoritativeLobbyService {
  constructor({ supabase } = {}) {
    if (typeof supabase?.functions?.invoke !== 'function') {
      throw new TypeError('Authenticated Supabase client is required');
    }
    this.supabase = supabase;
  }

  async request(body) {
    const { data, error } = await this.supabase.functions.invoke('ranked-match-lobby-v2', { body });
    if (error) {
      const status = error.context?.status;
      throw new AuthoritativeLobbyError('Ranked lobby request failed', {
        retryable: !Number.isInteger(status) || status >= 500
      });
    }
    if (!data || typeof data !== 'object') {
      throw new AuthoritativeLobbyError('Ranked lobby response is invalid', {
        code: 'invalid_lobby_response',
        retryable: false
      });
    }
    return data;
  }

  async create({ imageId, gridSize, gameplayMode, playerName, timeLimit, rackCapacity = 10 }) {
    if (typeof imageId !== 'string' || !UUID_PATTERN.test(imageId)) {
      throw new TypeError('imageId must be a UUID');
    }
    return this.request({
      action: 'create',
      imageId,
      rows: gridSize,
      cols: gridSize,
      gameplayMode,
      playerName,
      timeLimit,
      rackCapacity
    });
  }

  async join({ gameCode, playerName }) {
    const result = await this.request({ action: 'join', gameCode, playerName });
    if (![MULTIPLAYER_AUTHORITY.LEGACY, MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2]
      .includes(result.authorityModel)) {
      throw new AuthoritativeLobbyError('Lobby authority is invalid', {
        code: 'invalid_lobby_response',
        retryable: false
      });
    }
    return result;
  }

  status(gameId) {
    if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) {
      throw new TypeError('gameId must be a UUID');
    }
    return this.request({ action: 'status', gameId });
  }
}
