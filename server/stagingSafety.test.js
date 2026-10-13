import { describe, expect, it } from 'vitest';
import { assertLocalTarget, assertStagingTarget } from './stagingSafety.js';

const REF = 'abcdefghijklmnopqrst';
const SHA = 'a'.repeat(40);
const valid = () => ({
  supabaseUrl: `https://${REF}.supabase.co`,
  projectRef: REF,
  environmentName: 'staging',
  allowMutations: 'true',
  expectedGitSha: SHA,
  actualGitSha: SHA
});

describe('staging mutation safety gate', () => {
  it('accepts only the exact explicitly enabled staging target and candidate', () => {
    expect(assertStagingTarget(valid())).toEqual({ projectRef: REF, candidateGitSha: SHA });
  });

  it.each([
    ['environmentName', 'production', 'environment_not_staging'],
    ['allowMutations', 'false', 'mutations_not_enabled'],
    ['supabaseUrl', 'https://differentprojectref.supabase.co', 'staging_target_mismatch'],
    ['expectedGitSha', 'b'.repeat(40), 'candidate_sha_mismatch']
  ])('rejects unsafe %s', (field, value, code) => {
    expect(() => assertStagingTarget({ ...valid(), [field]: value })).toThrow(expect.objectContaining({ code }));
  });
});

describe('local mutation safety gate', () => {
  const local = () => ({
    supabaseUrl: 'http://127.0.0.1:54321',
    projectRef: 'local',
    environmentName: 'local',
    allowMutations: 'true',
    expectedGitSha: SHA,
    actualGitSha: SHA
  });

  it('accepts only the exact loopback target and candidate', () => {
    expect(assertLocalTarget(local())).toEqual({ projectRef: 'local', candidateGitSha: SHA });
  });

  it.each([
    ['environmentName', 'staging', 'environment_not_local'],
    ['allowMutations', 'false', 'mutations_not_enabled'],
    ['projectRef', 'abcdefghijklmnopqrst', 'invalid_local_project_ref'],
    ['supabaseUrl', 'http://localhost:54321', 'local_target_mismatch'],
    ['supabaseUrl', 'https://127.0.0.1:54321', 'local_target_mismatch'],
    ['supabaseUrl', 'http://127.0.0.1:54322', 'local_target_mismatch'],
    ['expectedGitSha', 'b'.repeat(40), 'candidate_sha_mismatch']
  ])('rejects unsafe %s', (field, value, code) => {
    expect(() => assertLocalTarget({ ...local(), [field]: value })).toThrow(expect.objectContaining({ code }));
  });
});
