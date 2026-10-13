import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261013030000_ranked_asset_job_worker_v2.sql', import.meta.url), 'utf8');

describe('ranked asset worker migration', () => {
  it('claims one eligible job with a database lock and bounded attempts', () => {
    expect(sql).toContain('FOR UPDATE SKIP LOCKED');
    expect(sql).toContain('job.attempts < 5');
    expect(sql).toContain("job.status = 'processing' AND job.lease_expires_at < NOW()");
    expect(sql).toContain("lease_expires_at = NOW() + INTERVAL '30 minutes'");
  });

  it('requires the owning lease and a manifest for completion', () => {
    expect(sql).toContain('AND lease_token = p_lease_token');
    expect(sql).toContain('FROM public.ranked_puzzle_manifests manifest');
    expect(sql).toContain("RAISE EXCEPTION 'Asset job lease is stale or manifest is missing'");
  });

  it('records only bounded error codes and schedules exponential retry', () => {
    expect(sql).toContain("INTERVAL '30 seconds' * POWER(2");
    expect(sql).toContain('LEFT(COALESCE(NULLIF(p_error_code');
    expect(sql).not.toMatch(/p_error_message/i);
  });

  it('keeps every lease RPC service-only', () => {
    for (const name of ['claim', 'complete', 'fail']) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}_ranked_match_job_v2[\\s\\S]+?FROM PUBLIC, anon, authenticated`));
    }
  });
});
