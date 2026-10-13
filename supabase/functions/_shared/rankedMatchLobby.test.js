import { describe, expect, it, vi } from 'vitest';
import {
  RankedMatchLobbyError,
  createRankedLobby,
  getLobbyStatus,
  joinLobby
} from './rankedMatchLobby.js';

const HOST = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const GUEST = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const GAME_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';

const adminWith = ({ authority = 'authoritative_v2', jobStatus = 'prepared' } = {}) => {
  const rows = {
    games: [{
      id: GAME_ID,
      game_code: 'ABC123',
      status: 'active',
      host_id: HOST,
      player_a_id: HOST,
      player_b_id: GUEST,
      player_b_name: 'Guest'
    }],
    match_authority_pins: authority ? [{ game_id: GAME_ID, authority_model: authority }] : [],
    ranked_match_jobs: [{ game_id: GAME_ID, status: jobStatus }]
  };
  const rpc = vi.fn(async (name) => ({
    data: [{
      game_id: GAME_ID,
      game_code: 'ABC123',
      lobby_status: name.startsWith('join') ? 'active' : 'waiting',
      asset_status: name.startsWith('join') ? jobStatus : 'queued'
    }],
    error: null
  }));
  return {
    rpc,
    from(table) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        async maybeSingle() {
          const data = rows[table].find((row) => filters.every(([key, value]) => row[key] === value));
          return { data: data ?? null, error: null };
        }
      };
      return builder;
    }
  };
};

describe('trusted ranked lobby coordinator', () => {
  it('creates through the service-only RPC with the verified actor', async () => {
    const admin = adminWith();
    const result = await createRankedLobby({
      admin,
      actorId: HOST,
      input: {
        imageId: IMAGE_ID,
        rows: 10,
        cols: 10,
        gameplayMode: 'NEXUS',
        rackCapacity: 10,
        timeLimit: 720,
        playerName: 'Host'
      }
    });
    expect(result).toMatchObject({ authorityModel: 'authoritative_v2', assetStatus: 'queued' });
    expect(admin.rpc).toHaveBeenCalledWith('create_ranked_match_lobby_v2', expect.objectContaining({
      p_actor_id: HOST,
      p_image_id: IMAGE_ID
    }));
  });

  it('resolves an unpinned existing game to legacy without joining it', async () => {
    const admin = adminWith({ authority: null });
    const result = await joinLobby({
      admin,
      actorId: GUEST,
      input: { gameCode: 'abc123', playerName: 'Guest' }
    });
    expect(result.authorityModel).toBe('legacy');
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('joins a pinned v2 lobby atomically', async () => {
    const admin = adminWith({ jobStatus: 'processing' });
    const result = await joinLobby({
      admin,
      actorId: GUEST,
      input: { gameCode: 'abc123', playerName: 'Guest' }
    });
    expect(result).toMatchObject({ authorityModel: 'authoritative_v2', assetStatus: 'processing' });
    expect(admin.rpc).toHaveBeenCalledWith('join_ranked_match_lobby_v2', expect.objectContaining({
      p_actor_id: GUEST,
      p_game_code: 'ABC123'
    }));
  });

  it('returns readiness without exposing the job or manifest', async () => {
    const result = await getLobbyStatus({ admin: adminWith(), actorId: HOST, gameId: GAME_ID });
    expect(result).toEqual({
      status: 'ok',
      authorityModel: 'authoritative_v2',
      gameId: GAME_ID,
      gameCode: 'ABC123',
      lobbyStatus: 'active',
      assetStatus: 'prepared',
      opponentJoined: true,
      opponentName: 'Guest',
      ready: true
    });
    expect(result).not.toHaveProperty('pieceCatalog');
  });

  it('rejects malformed settings before calling the database', async () => {
    const admin = adminWith();
    await expect(createRankedLobby({
      admin,
      actorId: HOST,
      input: { imageId: IMAGE_ID, rows: 2, cols: 2, gameplayMode: 'CLASSIC', timeLimit: 10 }
    })).rejects.toBeInstanceOf(RankedMatchLobbyError);
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
