import { describe, expect, it, vi } from 'vitest';
import {
  RankedMatchBootstrapError,
  bootstrapRankedMatch,
  buildInitialRankedMatch,
  validateRankedPuzzleManifest
} from './rankedMatchBootstrap.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const manifest = () => ({
  rows: 2,
  cols: 2,
  gameplay_mode: 'NEXUS',
  rack_capacity: 1,
  piece_catalog: [
    { pieceId: 1000000041, correctPosition: 2 },
    { pieceId: 1000000083, correctPosition: 0 },
    { pieceId: 1000000127, correctPosition: 3 },
    { pieceId: 1000000169, correctPosition: 1 }
  ],
  asset_manifest: [
    { pieceId: 1000000041, assetUrl: 'https://assets.test/a.png', isEdge: true },
    { pieceId: 1000000083, assetUrl: 'https://assets.test/b.png', isEdge: true },
    { pieceId: 1000000127, assetUrl: 'https://assets.test/c.png', isEdge: true },
    { pieceId: 1000000169, assetUrl: 'https://assets.test/d.png', isEdge: true }
  ]
});

const game = {
  id: GAME_ID,
  status: 'active',
  player_a_id: PLAYER_A,
  player_b_id: PLAYER_B,
  started_at: '2026-10-13T11:00:00.000Z',
  time_limit: 600
};

const createAdmin = ({ existingProjection = null } = {}) => {
  const rows = {
    games: [game],
    match_authority_pins: [{ game_id: GAME_ID, authority_model: 'authoritative_v2' }],
    ranked_puzzle_manifests: [{ game_id: GAME_ID, ...manifest() }],
    match_projections: existingProjection ? [{
      game_id: GAME_ID,
      viewer_id: PLAYER_A,
      viewer_role: 'playerA',
      projection: existingProjection
    }] : []
  };
  const rpc = vi.fn(async (_name, parameters) => {
    rows.match_projections.push(
      {
        game_id: GAME_ID,
        viewer_id: PLAYER_A,
        viewer_role: 'playerA',
        projection: parameters.p_player_a_projection
      },
      {
        game_id: GAME_ID,
        viewer_id: PLAYER_B,
        viewer_role: 'playerB',
        projection: parameters.p_player_b_projection
      }
    );
    return { data: null, error: null };
  });
  return {
    rpc,
    from(table) {
      const filters = [];
      const builder = {
        select() { return builder; },
        eq(column, value) { filters.push([column, value]); return builder; },
        async maybeSingle() {
          const match = rows[table].find((row) => (
            filters.every(([column, value]) => row[column] === value)
          ));
          return { data: match ?? null, error: null };
        }
      };
      return builder;
    }
  };
};

describe('ranked match trusted bootstrap', () => {
  it('requires high-range opaque IDs and coordinate-free assets', () => {
    const lowId = manifest();
    lowId.piece_catalog[0].pieceId = 0;
    expect(() => validateRankedPuzzleManifest(lowId)).toThrow('opaque server namespace');

    const leakingAsset = manifest();
    leakingAsset.asset_manifest[0].correctPosition = 2;
    expect(() => validateRankedPuzzleManifest(leakingAsset)).toThrow('forbidden field');
  });

  it('builds valid canonical state while returning only safe viewer projections and assets', () => {
    const initial = buildInitialRankedMatch({
      gameId: GAME_ID,
      manifest: manifest(),
      startedAt: '2026-10-13T11:00:00.000Z',
      endsAt: '2026-10-13T11:10:00.000Z',
      randomIndex: () => 0
    });

    expect(initial.canonicalState.pieceCatalog).toHaveLength(4);
    expect(initial.canonicalState.racks.playerA).toHaveLength(1);
    expect(initial.canonicalState.racks.playerB).toHaveLength(1);
    expect(initial.canonicalState.piecePool).toHaveLength(2);
    expect(JSON.stringify(initial.projections)).not.toContain('correctPosition');
    expect(initial.pieceAssets[0]).toEqual({
      id: 1000000041,
      imageData: 'https://assets.test/a.png',
      isEdge: true
    });
  });

  it('verifies the assigned player and initializes from the service-owned manifest', async () => {
    const admin = createAdmin();
    const result = await bootstrapRankedMatch({
      admin,
      actorId: PLAYER_A,
      gameId: GAME_ID,
      randomIndex: () => 0
    });

    expect(result).toMatchObject({
      status: 'ready',
      authorityModel: 'authoritative_v2',
      viewerRole: 'playerA',
      projection: { revision: 0 }
    });
    expect(result).not.toHaveProperty('canonicalState');
    expect(admin.rpc).toHaveBeenCalledOnce();
    expect(admin.rpc).toHaveBeenCalledWith(
      'initialize_authoritative_match_v2',
      expect.objectContaining({ p_game_id: GAME_ID })
    );
  });

  it('returns an existing projection without reinitializing the match', async () => {
    const initial = buildInitialRankedMatch({
      gameId: GAME_ID,
      manifest: manifest(),
      startedAt: '2026-10-13T11:00:00.000Z',
      endsAt: '2026-10-13T11:10:00.000Z',
      randomIndex: () => 0
    });
    const admin = createAdmin({ existingProjection: initial.projections.playerA });

    const result = await bootstrapRankedMatch({
      admin,
      actorId: PLAYER_A,
      gameId: GAME_ID
    });

    expect(result.projection.revision).toBe(0);
    expect(admin.rpc).not.toHaveBeenCalled();
  });

  it('rejects an actor who is not assigned to either player slot', async () => {
    const admin = createAdmin();
    await expect(bootstrapRankedMatch({
      admin,
      actorId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      gameId: GAME_ID
    })).rejects.toEqual(expect.objectContaining({
      name: RankedMatchBootstrapError.name,
      code: 'unauthorized_actor',
      status: 403
    }));
    expect(admin.rpc).not.toHaveBeenCalled();
  });
});
