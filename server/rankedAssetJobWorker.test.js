import { describe, expect, it, vi } from 'vitest';
import { RankedAssetProvisioningError } from './rankedAssetProvisioner.js';
import { processNextRankedAssetJob } from './rankedAssetJobWorker.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const LEASE = '22222222-2222-4222-8222-222222222222';

const job = {
  game_id: GAME_ID,
  source_path: 'user/source.png',
  rows: 10,
  cols: 10,
  gameplay_mode: 'NEXUS',
  rack_capacity: 10,
  attempt: 1
};

const createAdmin = ({ claimed = job, downloadError = null, rpcErrors = {} } = {}) => {
  const rpc = vi.fn(async (name) => ({
    data: name === 'claim_ranked_match_job_v2' ? (claimed ? [claimed] : []) : null,
    error: rpcErrors[name] ?? null
  }));
  const download = vi.fn(async () => ({
    data: new Blob([Buffer.from('image')]),
    error: downloadError
  }));
  return {
    client: { rpc, storage: { from: vi.fn(() => ({ download })) } },
    rpc,
    download
  };
};

describe('ranked asset queue worker', () => {
  it('returns idle without touching storage when no job is eligible', async () => {
    const admin = createAdmin({ claimed: null });
    await expect(processNextRankedAssetJob({
      admin: admin.client,
      leaseToken: LEASE
    })).resolves.toEqual({ status: 'idle' });
    expect(admin.download).not.toHaveBeenCalled();
  });

  it('downloads the approved source and completes with the same lease', async () => {
    const admin = createAdmin();
    const provision = vi.fn(async ({ imageBuffer }) => ({
      status: 'prepared',
      pieceCount: imageBuffer.length
    }));
    const result = await processNextRankedAssetJob({
      admin: admin.client,
      leaseToken: LEASE,
      provision
    });
    expect(admin.client.storage.from).toHaveBeenCalledWith('puzzle-images');
    expect(admin.download).toHaveBeenCalledWith('user/source.png');
    expect(provision).toHaveBeenCalledWith(expect.objectContaining({
      gameId: GAME_ID,
      rows: 10,
      gameplayMode: 'NEXUS'
    }));
    expect(admin.rpc).toHaveBeenCalledWith('complete_ranked_match_job_v2', {
      p_game_id: GAME_ID,
      p_lease_token: LEASE
    });
    expect(result).toEqual({ status: 'prepared', gameId: GAME_ID, attempt: 1, pieceCount: 5 });
  });

  it('records a safe provisioner code without provider details', async () => {
    const admin = createAdmin();
    const provision = vi.fn(async () => {
      throw new RankedAssetProvisioningError('provider secret detail', {
        code: 'invalid_source_image'
      });
    });
    const result = await processNextRankedAssetJob({
      admin: admin.client,
      leaseToken: LEASE,
      provision
    });
    expect(admin.rpc).toHaveBeenCalledWith('fail_ranked_match_job_v2', {
      p_game_id: GAME_ID,
      p_lease_token: LEASE,
      p_error_code: 'invalid_source_image'
    });
    expect(result).toMatchObject({ status: 'failed', errorCode: 'invalid_source_image' });
    expect(JSON.stringify(result)).not.toContain('provider secret detail');
  });

  it('uses a generic code for unexpected failures', async () => {
    const admin = createAdmin({ downloadError: { message: 'storage provider detail' } });
    const result = await processNextRankedAssetJob({
      admin: admin.client,
      leaseToken: LEASE
    });
    expect(result.errorCode).toBe('source_download_failed');
  });

  it('does not hide a stale lease when failure recording is rejected', async () => {
    const admin = createAdmin({
      downloadError: { message: 'failure' },
      rpcErrors: { fail_ranked_match_job_v2: { message: 'stale lease' } }
    });
    await expect(processNextRankedAssetJob({
      admin: admin.client,
      leaseToken: LEASE
    })).rejects.toMatchObject({ code: 'job_failure_record_failed' });
  });
});
