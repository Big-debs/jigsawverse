const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const requireUuid = (value, name) => {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${name} must be a UUID`);
  }
};

export class AuthoritativeTransportError extends Error {
  constructor(message, { code = 'transport_error', retryable = true } = {}) {
    super(message);
    this.name = 'AuthoritativeTransportError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function authoritativeProjectionTopic(gameId, userId) {
  requireUuid(gameId, 'gameId');
  requireUuid(userId, 'userId');
  return `ranked-match:${gameId.toLowerCase()}:viewer:${userId.toLowerCase()}`;
}

const requireClientMethod = (object, name) => {
  if (typeof object?.[name] !== 'function') {
    throw new TypeError(`supabase.${name} must be a function`);
  }
};

/**
 * Authenticated Supabase adapter for AuthoritativeMatchSession. Database RLS
 * remains the source of authorization for snapshots and private topic joins.
 */
export class SupabaseAuthoritativeMatchTransport {
  constructor({ supabase, subscribeTimeoutMs = 10000 } = {}) {
    requireClientMethod(supabase, 'from');
    requireClientMethod(supabase, 'channel');
    requireClientMethod(supabase, 'removeChannel');
    requireClientMethod(supabase?.functions, 'invoke');
    if (!Number.isInteger(subscribeTimeoutMs) || subscribeTimeoutMs < 1) {
      throw new TypeError('subscribeTimeoutMs must be a positive integer');
    }

    this.supabase = supabase;
    this.subscribeTimeoutMs = subscribeTimeoutMs;
  }

  async fetchProjection({ gameId, userId }) {
    requireUuid(gameId, 'gameId');
    requireUuid(userId, 'userId');

    const { data, error } = await this.supabase
      .from('match_projections')
      .select('projection')
      .eq('game_id', gameId)
      .eq('viewer_id', userId)
      .single();

    if (error) {
      const notFound = error.code === 'PGRST116';
      throw new AuthoritativeTransportError('Unable to fetch authorized projection', {
        code: notFound ? 'projection_not_found' : 'projection_fetch_failed',
        retryable: !notFound
      });
    }
    if (!data?.projection || typeof data.projection !== 'object') {
      throw new AuthoritativeTransportError('Projection response is invalid', {
        code: 'invalid_projection_response',
        retryable: false
      });
    }
    return data.projection;
  }

  async subscribeProjection({ gameId, userId, onProjection }) {
    if (typeof onProjection !== 'function') {
      throw new TypeError('onProjection must be a function');
    }
    const topic = authoritativeProjectionTopic(gameId, userId);
    const channel = this.supabase.channel(topic, { config: { private: true } });

    return new Promise((resolve, reject) => {
      let settled = false;
      const cleanupFailedSubscription = async () => {
        try {
          await this.supabase.removeChannel(channel);
        } catch {
          // Preserve the original subscription error.
        }
      };
      const fail = async (code, message) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        await cleanupFailedSubscription();
        reject(new AuthoritativeTransportError(message, { code }));
      };
      const timeout = setTimeout(() => {
        void fail('projection_subscription_timeout', 'Projection subscription timed out');
      }, this.subscribeTimeoutMs);

      channel
        .on('broadcast', { event: 'match_projection' }, ({ payload }) => {
          void Promise.resolve()
            .then(() => onProjection(payload))
            .catch(() => {
              // The session owns projection validation and error reporting.
            });
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED' && !settled) {
            settled = true;
            clearTimeout(timeout);
            resolve({
              unsubscribe: () => this.supabase.removeChannel(channel)
            });
          } else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            void fail('projection_subscription_failed', `Projection subscription failed: ${status}`);
          }
        });
    });
  }

  async submitCommand(command) {
    const { data, error } = await this.supabase.functions.invoke('ranked-command-v2', {
      body: { command }
    });
    if (error) {
      const status = error.context?.status;
      throw new AuthoritativeTransportError('Ranked command request failed', {
        code: 'command_request_failed',
        retryable: !Number.isInteger(status) || status >= 500
      });
    }
    if (!data || typeof data !== 'object') {
      throw new AuthoritativeTransportError('Ranked command response is invalid', {
        code: 'invalid_command_response',
        retryable: false
      });
    }
    return data;
  }

  async bootstrapMatch({ gameId }) {
    requireUuid(gameId, 'gameId');
    const { data, error } = await this.supabase.functions.invoke('ranked-match-bootstrap-v2', {
      body: { gameId }
    });
    if (error) {
      const status = error.context?.status;
      throw new AuthoritativeTransportError('Ranked match bootstrap failed', {
        code: 'bootstrap_request_failed',
        retryable: !Number.isInteger(status) || status >= 500
      });
    }
    if (data?.status !== 'ready'
      || data.authorityModel !== 'authoritative_v2'
      || !['playerA', 'playerB'].includes(data.viewerRole)
      || !data.projection
      || !Array.isArray(data.pieceAssets)) {
      throw new AuthoritativeTransportError('Ranked bootstrap response is invalid', {
        code: 'invalid_bootstrap_response',
        retryable: false
      });
    }
    return data;
  }
}
