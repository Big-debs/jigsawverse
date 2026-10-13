import { describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import {
  MIN_OPAQUE_PIECE_ID,
  createOpaquePieceIds,
  provisionRankedPuzzleAssets,
  sliceRankedPuzzleImage
} from './rankedAssetProvisioner.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';

const sourceImage = () => sharp({
  create: {
    width: 5,
    height: 3,
    channels: 3,
    background: { r: 120, g: 40, b: 200 }
  }
}).png().toBuffer();

const createAdmin = ({ rpcError = null } = {}) => {
  const upload = vi.fn(async () => ({ data: {}, error: null }));
  const remove = vi.fn(async () => ({ data: {}, error: null }));
  const rpc = vi.fn(async () => ({ data: null, error: rpcError }));
  return {
    client: {
      storage: { from: vi.fn(() => ({ upload, remove })) },
      from: vi.fn(() => {
        const query = {
          select: vi.fn(() => query),
          eq: vi.fn(() => query),
          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
        };
        return query;
      }),
      rpc
    },
    upload,
    remove,
    rpc
  };
};

describe('trusted ranked asset provisioner', () => {
  it('slices every source pixel into server-side PNG pieces', async () => {
    const pieces = await sliceRankedPuzzleImage({
      imageBuffer: await sourceImage(),
      rows: 2,
      cols: 2
    });

    expect(pieces).toHaveLength(4);
    expect(pieces.map(({ correctPosition }) => correctPosition)).toEqual([0, 1, 2, 3]);
    for (const piece of pieces) {
      expect(piece.buffer.subarray(1, 4).toString()).toBe('PNG');
      expect(piece.isEdge).toBe(true);
    }
  });

  it('rejects invalid or repeatedly colliding opaque IDs', () => {
    expect(() => createOpaquePieceIds(1, () => 4)).toThrow('invalid ID');
    expect(() => createOpaquePieceIds(2, () => MIN_OPAQUE_PIECE_ID)).toThrow('unique');
  });

  it('uploads private pieces before transactionally provisioning the manifest and pin', async () => {
    const admin = createAdmin();
    const imageBuffer = await sourceImage();
    const result = await provisionRankedPuzzleAssets({
      admin: admin.client,
      gameId: GAME_ID,
      imageBuffer,
      rows: 2,
      cols: 2,
      gameplayMode: 'NEXUS',
      rackCapacity: 1,
      idFactory: (index) => MIN_OPAQUE_PIECE_ID + 41 + index * 42
    });

    expect(result).toMatchObject({ status: 'prepared', gameId: GAME_ID, pieceCount: 4 });
    expect(result.sourceDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(admin.upload).toHaveBeenCalledTimes(4);
    expect(admin.upload.mock.calls[0][0]).toBe(`games/${GAME_ID}/1000000041.png`);
    expect(admin.upload.mock.calls[0][2]).toMatchObject({
      contentType: 'image/png',
      upsert: true
    });
    expect(admin.rpc).toHaveBeenCalledWith(
      'provision_ranked_puzzle_manifest_v2',
      expect.objectContaining({
        p_game_id: GAME_ID,
        p_piece_catalog: expect.arrayContaining([
          { pieceId: 1000000041, correctPosition: 0 }
        ]),
        p_asset_manifest: expect.arrayContaining([
          {
            pieceId: 1000000041,
            storagePath: `games/${GAME_ID}/1000000041.png`,
            isEdge: true
          }
        ])
      })
    );
    expect(result).not.toHaveProperty('pieceCatalog');
    expect(result).not.toHaveProperty('assetManifest');
  });

  it('removes uploaded pieces when the manifest transaction fails', async () => {
    const admin = createAdmin({ rpcError: { message: 'provider detail' } });

    await expect(provisionRankedPuzzleAssets({
      admin: admin.client,
      gameId: GAME_ID,
      imageBuffer: await sourceImage(),
      rows: 1,
      cols: 2,
      gameplayMode: 'NEXUS',
      idFactory: (index) => MIN_OPAQUE_PIECE_ID + index
    })).rejects.toMatchObject({
      message: 'Manifest transaction failed',
      code: 'asset_provisioning_failed'
    });

    expect(admin.remove).toHaveBeenCalledOnce();
    expect(admin.remove.mock.calls[0][0]).toHaveLength(2);
  });
});
