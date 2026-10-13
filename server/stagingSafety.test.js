import { describe, expect, it } from 'vitest';
import { assertStagingTarget } from './stagingSafety.js';

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
