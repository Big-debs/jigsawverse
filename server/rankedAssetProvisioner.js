import { createHash, randomInt } from 'node:crypto';
import sharp from 'sharp';
import { GAME_MODES } from '../src/lib/gameModes.js';

export const RANKED_PIECE_BUCKET = 'ranked-piece-assets';
export const MIN_OPAQUE_PIECE_ID = 1_000_000_000;
const MAX_OPAQUE_PIECE_ID = 9_000_000_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SOURCE_BYTES = 10 * 1024 * 1024;
const MAX_SOURCE_PIXELS = 40_000_000;
const MAX_PIECE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SOURCE_FORMATS = new Set(['jpeg', 'png', 'webp']);

export class RankedAssetProvisioningError extends Error {
  constructor(message, { code = 'asset_provisioning_failed' } = {}) {
    super(message);
    this.name = 'RankedAssetProvisioningError';
    this.code = code;
  }
}

const requirePositiveInteger = (value, name) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RankedAssetProvisioningError(`${name} must be a positive integer`, {
      code: 'invalid_provisioning_request'
    });
  }
};

export async function sliceRankedPuzzleImage({ imageBuffer, rows, cols }) {
  if (!Buffer.isBuffer(imageBuffer)
    || imageBuffer.length === 0
    || imageBuffer.length > MAX_SOURCE_BYTES) {
    throw new RankedAssetProvisioningError('imageBuffer must contain image data', {
      code: 'invalid_source_image'
    });
  }
  requirePositiveInteger(rows, 'rows');
  requirePositiveInteger(cols, 'cols');

  const source = sharp(imageBuffer, {
    failOn: 'warning',
    limitInputPixels: MAX_SOURCE_PIXELS
  });
  const metadata = await source.metadata();
  if (!metadata.width || !metadata.height || !ALLOWED_SOURCE_FORMATS.has(metadata.format)) {
    throw new RankedAssetProvisioningError('Source image dimensions are unavailable', {
      code: 'invalid_source_image'
    });
  }

  const pieces = [];
  for (let row = 0; row < rows; row += 1) {
    const top = Math.round(row * metadata.height / rows);
    const bottom = Math.round((row + 1) * metadata.height / rows);
    for (let col = 0; col < cols; col += 1) {
      const left = Math.round(col * metadata.width / cols);
      const right = Math.round((col + 1) * metadata.width / cols);
      const correctPosition = row * cols + col;
      const buffer = await sharp(imageBuffer, {
        failOn: 'warning',
        limitInputPixels: MAX_SOURCE_PIXELS
      })
        .extract({ left, top, width: right - left, height: bottom - top })
        .png()
        .toBuffer();
      pieces.push({
        correctPosition,
        isEdge: row === 0 || col === 0 || row === rows - 1 || col === cols - 1,
        buffer
      });
    }
  }
  return pieces;
}

export function createOpaquePieceIds(count, idFactory = () => (
  randomInt(MIN_OPAQUE_PIECE_ID, MAX_OPAQUE_PIECE_ID)
)) {
  requirePositiveInteger(count, 'count');
  const ids = new Set();
  const maximumAttempts = count * 20;
  for (let attempts = 0; ids.size < count && attempts < maximumAttempts; attempts += 1) {
    const id = idFactory(attempts);
    if (!Number.isSafeInteger(id) || id < MIN_OPAQUE_PIECE_ID) {
      throw new RankedAssetProvisioningError('Opaque ID factory returned an invalid ID', {
        code: 'invalid_opaque_piece_id'
      });
    }
    ids.add(id);
  }
  if (ids.size !== count) {
    throw new RankedAssetProvisioningError('Unable to generate unique opaque piece IDs', {
      code: 'opaque_piece_id_collision'
    });
  }
  return [...ids];
}

const sourceDigest = ({ imageBuffer, rows, cols, gameplayMode, rackCapacity }) => createHash('sha256')
  .update(imageBuffer)
  .update(`\0${rows}\0${cols}\0${gameplayMode}\0${rackCapacity}`)
  .digest('hex');

const deterministicOpaqueId = (digest, attempt) => {
  const value = BigInt(`0x${createHash('sha256')
    .update(digest)
    .update(`\0${attempt}`)
    .digest('hex')
    .slice(0, 12)}`);
  const range = BigInt(MAX_OPAQUE_PIECE_ID - MIN_OPAQUE_PIECE_ID);
  return MIN_OPAQUE_PIECE_ID + Number(value % range);
};

export async function provisionRankedPuzzleAssets({
  admin,
  gameId,
  imageBuffer,
  rows,
  cols,
  gameplayMode,
  rackCapacity = 10,
  bucket = RANKED_PIECE_BUCKET,
  idFactory,
  sliceImage = sliceRankedPuzzleImage
}) {
  if (!admin?.storage?.from || typeof admin.rpc !== 'function' || typeof admin.from !== 'function') {
    throw new TypeError('Supabase service-role client is required');
  }
  if (typeof gameId !== 'string' || !UUID_PATTERN.test(gameId)) {
    throw new RankedAssetProvisioningError('gameId is required', { code: 'invalid_provisioning_request' });
  }
  requirePositiveInteger(rows, 'rows');
  requirePositiveInteger(cols, 'cols');
  requirePositiveInteger(rackCapacity, 'rackCapacity');
  if (!GAME_MODES[gameplayMode]?.multiplayer) {
    throw new RankedAssetProvisioningError('gameplayMode must be a multiplayer mode', {
      code: 'invalid_provisioning_request'
    });
  }

  const digest = sourceDigest({ imageBuffer, rows, cols, gameplayMode, rackCapacity });
  const { data: existing, error: lookupError } = await admin
    .from('ranked_puzzle_manifests')
    .select('source_digest')
    .eq('game_id', gameId)
    .maybeSingle();
  if (lookupError) throw new RankedAssetProvisioningError('Manifest lookup failed');
  if (existing) {
    if (existing.source_digest !== digest) {
      throw new RankedAssetProvisioningError('Game already has a different ranked manifest');
    }
    return { status: 'prepared', gameId, pieceCount: rows * cols, sourceDigest: digest };
  }

  const pieces = await sliceImage({ imageBuffer, rows, cols });
  if (!Array.isArray(pieces) || pieces.length !== rows * cols) {
    throw new RankedAssetProvisioningError('Image slicer returned an invalid piece count');
  }
  const opaqueIdFactory = idFactory ?? ((attempt) => deterministicOpaqueId(digest, attempt));
  const pieceIds = createOpaquePieceIds(pieces.length, opaqueIdFactory);
  const storage = admin.storage.from(bucket);
  const uploadedPaths = [];

  try {
    const pieceCatalog = [];
    const assetManifest = [];
    for (let index = 0; index < pieces.length; index += 1) {
      const piece = pieces[index];
      if (!Buffer.isBuffer(piece.buffer)
        || piece.buffer.length === 0
        || piece.buffer.length > MAX_PIECE_BYTES
        || piece.correctPosition !== index) {
        throw new RankedAssetProvisioningError('Image slicer returned invalid piece metadata');
      }
      const pieceId = pieceIds[index];
      const storagePath = `games/${gameId}/${pieceId}.png`;
      const { error } = await storage.upload(storagePath, piece.buffer, {
        contentType: 'image/png',
        cacheControl: '31536000',
        upsert: true
      });
      if (error) throw new RankedAssetProvisioningError('Private piece upload failed');
      uploadedPaths.push(storagePath);
      pieceCatalog.push({ pieceId, correctPosition: piece.correctPosition });
      assetManifest.push({ pieceId, storagePath, isEdge: Boolean(piece.isEdge) });
    }

    const { error } = await admin.rpc('provision_ranked_puzzle_manifest_v2', {
      p_game_id: gameId,
      p_rows: rows,
      p_cols: cols,
      p_gameplay_mode: gameplayMode,
      p_rack_capacity: rackCapacity,
      p_piece_catalog: pieceCatalog,
      p_asset_manifest: assetManifest,
      p_source_digest: digest
    });
    if (error) throw new RankedAssetProvisioningError('Manifest transaction failed');

    return {
      status: 'prepared',
      gameId,
      pieceCount: pieces.length,
      sourceDigest: digest
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      try {
        await storage.remove(uploadedPaths);
      } catch {
        // Preserve the provisioning failure. Storage reconciliation is an
        // operational alert and must not expose provider details to callers.
      }
    }
    throw error;
  }
}
