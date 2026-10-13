import { describe, expect, it, vi } from 'vitest';
import {
  SupabaseAuthoritativeMatchTransport,
  authoritativeProjectionTopic
} from './supabaseAuthoritativeMatchTransport.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const createClient = ({ projection = { revision: 3 }, functionResult = null } = {}) => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn(async () => ({ data: { projection }, error: null }))
  };
  const channel = {
    on: vi.fn(function on(_type, _filter, listener) {
      this.listener = listener;
      return this;
    }),
    subscribe: vi.fn(function subscribe(listener) {
      this.statusListener = listener;
      listener('SUBSCRIBED');
      return this;
    })
  };
  const client = {
    from: vi.fn(() => query),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(async () => 'ok'),
    functions: {
      invoke: vi.fn(async () => functionResult ?? ({
        data: { status: 'accepted', revision: 3, projection },
        error: null
      }))
    }
  };
  return { client, query, channel };
};

describe('Supabase authoritative match transport', () => {
  it('fetches only the requested viewer projection', async () => {
    const { client, query } = createClient();
    const transport = new SupabaseAuthoritativeMatchTransport({ supabase: client });

    await expect(transport.fetchProjection({ gameId: GAME_ID, userId: USER_ID }))
      .resolves.toEqual({ revision: 3 });
    expect(client.from).toHaveBeenCalledWith('match_projections');
    expect(query.eq).toHaveBeenNthCalledWith(1, 'game_id', GAME_ID);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'viewer_id', USER_ID);
  });

  it('subscribes to an authenticated private per-viewer topic', async () => {
    const { client, channel } = createClient();
    const transport = new SupabaseAuthoritativeMatchTransport({ supabase: client });
    const onProjection = vi.fn();

    const subscription = await transport.subscribeProjection({
      gameId: GAME_ID,
      userId: USER_ID,
      onProjection
    });
    expect(client.channel).toHaveBeenCalledWith(
      authoritativeProjectionTopic(GAME_ID, USER_ID),
      { config: { private: true } }
    );
    channel.listener({ payload: { revision: 4 } });
    await Promise.resolve();
    expect(onProjection).toHaveBeenCalledWith({ revision: 4 });

    await subscription.unsubscribe();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('submits commands only through the ranked command function', async () => {
    const { client } = createClient();
    const transport = new SupabaseAuthoritativeMatchTransport({ supabase: client });
    const command = { commandId: '22222222-2222-4222-8222-222222222222' };

    const result = await transport.submitCommand(command);

    expect(client.functions.invoke).toHaveBeenCalledWith('ranked-command-v2', {
      body: { command }
    });
    expect(result.status).toBe('accepted');
  });

  it('bootstraps by game ID without sending canonical state or piece answers', async () => {
    const bootstrap = {
      status: 'ready',
      authorityModel: 'authoritative_v2',
      viewerRole: 'playerA',
      projection: { revision: 0 },
      pieceAssets: [{ id: 1000000041, imageData: 'https://assets.test/a.png' }]
    };
    const { client } = createClient({ functionResult: { data: bootstrap, error: null } });
    const transport = new SupabaseAuthoritativeMatchTransport({ supabase: client });

    await expect(transport.bootstrapMatch({ gameId: GAME_ID })).resolves.toEqual(bootstrap);
    expect(client.functions.invoke).toHaveBeenCalledWith('ranked-match-bootstrap-v2', {
      body: { gameId: GAME_ID }
    });
    expect(JSON.stringify(client.functions.invoke.mock.calls[0])).not.toContain('correctPosition');
  });

  it('marks client errors as non-retryable without exposing response details', async () => {
    const { client } = createClient({
      functionResult: {
        data: null,
        error: { context: { status: 401 }, message: 'raw gateway detail' }
      }
    });
    const transport = new SupabaseAuthoritativeMatchTransport({ supabase: client });

    await expect(transport.submitCommand({})).rejects.toMatchObject({
      code: 'command_request_failed',
      retryable: false,
      message: 'Ranked command request failed'
    });
  });
});
