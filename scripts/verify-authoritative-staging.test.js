import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./verify-authoritative-staging.mjs', import.meta.url), 'utf8');

describe('authoritative staging verifier boundary', () => {
  it('requires explicit target identity, mutation opt-in, and candidate SHA', () => {
    for (const expression of [
      '`${prefix}_PROJECT_REF`',
      '`${prefix}_ENVIRONMENT_NAME`',
      '`ALLOW_${prefix}_MUTATIONS`',
      '`${prefix}_EXPECTED_GIT_SHA`'
    ]) expect(source).toContain(`required(${expression})`);
    expect(source).toContain('assertStagingTarget');
    expect(source).toContain("['status', '--porcelain']");
    expect(source).toContain('dirty_candidate_checkout');
  });

  it('supports an explicitly selected loopback-only local target', () => {
    expect(source).toContain("verificationTarget === 'local'");
    expect(source).toContain('assertLocalTarget');
    expect(source).toContain("const prefix = local ? 'LOCAL' : 'STAGING'");
  });

  it('checks two-player, observer, trusted RPC, concurrency and outbox boundaries', () => {
    expect(source).toContain("projectionCounts.join(',') === '1,1,0'");
    expect(source).toContain("rpc('claim_ranked_match_job_v2'");
    expect(source).toContain("functions.invoke('ranked-match-bootstrap-v2'");
    expect(source).toContain("status === 'accepted'");
    expect(source).toContain('outbox.length === 2');
  });

  it('cleans every fixture and emits only aggregate evidence', () => {
    expect(source).toContain('finally {\n  await cleanup();');
    expect(source).toContain('admin.auth.admin.deleteUser');
    expect(source).toContain('JSON.stringify(report)');
    expect(source).not.toMatch(/report\s*=\s*\{[^}]*projection:/s);
    expect(source).not.toMatch(/report\s*=\s*\{[^}]*asset_manifest:/s);
  });
});
