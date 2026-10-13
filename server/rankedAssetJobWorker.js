import { randomUUID } from 'node:crypto';
import {
  RankedAssetProvisioningError,
  provisionRankedPuzzleAssets
} from './rankedAssetProvisioner.js';

export const RANKED_SOURCE_BUCKET = 'puzzle-images';

export class RankedAssetJobWorkerError extends Error {
  constructor(message, { code = 'asset_worker_failed' } = {}) {
    super(message);
    this.name = 'RankedAssetJobWorkerError';
    this.code = code;
  }
}

const rpcRow = (data) => Array.isArray(data) ? data[0] : data;

const safeErrorCode = (error) => {
  const candidate = error instanceof RankedAssetProvisioningError ? error.code : null;
  return typeof candidate === 'string' && /^[a-z0-9_]{1,80}$/.test(candidate)
    ? candidate
    : 'asset_worker_failed';
};

const downloadSource = async (admin, sourcePath) => {
  const { data, error } = await admin.storage.from(RANKED_SOURCE_BUCKET).download(sourcePath);
  if (error || !data || typeof data.arrayBuffer !== 'function') {
    throw new RankedAssetJobWorkerError('Unable to download ranked source image', {
      code: 'source_download_failed'
    });
  }
  return Buffer.from(await data.arrayBuffer());
};

export async function processNextRankedAssetJob({
  admin,
  leaseToken = randomUUID(),
  provision = provisionRankedPuzzleAssets
} = {}) {
  if (!admin?.storage?.from || typeof admin.rpc !== 'function') {
    throw new TypeError('Supabase service-role client is required');
  }
  const { data, error } = await admin.rpc('claim_ranked_match_job_v2', {
    p_lease_token: leaseToken
  });
  if (error) throw new RankedAssetJobWorkerError('Unable to claim ranked asset job');
  const job = rpcRow(data);
  if (!job) return { status: 'idle' };

  try {
    const imageBuffer = await downloadSource(admin, job.source_path);
    const result = await provision({
      admin,
      gameId: job.game_id,
      imageBuffer,
      rows: job.rows,
      cols: job.cols,
      gameplayMode: job.gameplay_mode,
      rackCapacity: job.rack_capacity
    });
    const { error: completeError } = await admin.rpc('complete_ranked_match_job_v2', {
      p_game_id: job.game_id,
      p_lease_token: leaseToken
    });
    if (completeError) {
      throw new RankedAssetJobWorkerError('Unable to complete ranked asset job', {
        code: 'job_completion_failed'
      });
    }
    return {
      status: 'prepared',
      gameId: job.game_id,
      attempt: job.attempt,
      pieceCount: result.pieceCount
    };
  } catch (workerError) {
    const code = workerError instanceof RankedAssetJobWorkerError
      ? workerError.code
      : safeErrorCode(workerError);
    const { error: failError } = await admin.rpc('fail_ranked_match_job_v2', {
      p_game_id: job.game_id,
      p_lease_token: leaseToken,
      p_error_code: code
    });
    if (failError) {
      throw new RankedAssetJobWorkerError('Unable to record ranked asset job failure', {
        code: 'job_failure_record_failed'
      });
    }
    return {
      status: 'failed',
      gameId: job.game_id,
      attempt: job.attempt,
      errorCode: code
    };
  }
}
