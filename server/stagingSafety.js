const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const LOCAL_PROJECT_REF = 'local';
const LOCAL_SUPABASE_ORIGIN = 'http://127.0.0.1:54321';

export class StagingSafetyError extends Error {
  constructor(message, code = 'staging_safety_check_failed') {
    super(message);
    this.name = 'StagingSafetyError';
    this.code = code;
  }
}

function assertCandidateSha(expectedGitSha, actualGitSha) {
  if (!SHA_PATTERN.test(expectedGitSha ?? '') || !SHA_PATTERN.test(actualGitSha ?? '')) {
    throw new StagingSafetyError('Candidate SHA must be a full Git SHA', 'invalid_candidate_sha');
  }
  if (expectedGitSha.toLowerCase() !== actualGitSha.toLowerCase()) {
    throw new StagingSafetyError('Checkout does not match the approved candidate', 'candidate_sha_mismatch');
  }
  return actualGitSha.toLowerCase();
}

export function assertStagingTarget({
  supabaseUrl,
  projectRef,
  environmentName,
  allowMutations,
  expectedGitSha,
  actualGitSha
}) {
  if (environmentName !== 'staging') {
    throw new StagingSafetyError('Environment must be explicitly named staging', 'environment_not_staging');
  }
  if (allowMutations !== 'true') {
    throw new StagingSafetyError('Staging mutations were not explicitly enabled', 'mutations_not_enabled');
  }
  if (!PROJECT_REF_PATTERN.test(projectRef ?? '')) {
    throw new StagingSafetyError('Staging project reference is invalid', 'invalid_project_ref');
  }
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new StagingSafetyError('Staging Supabase URL is invalid', 'invalid_staging_url');
  }
  if (url.protocol !== 'https:' || url.hostname !== `${projectRef}.supabase.co`) {
    throw new StagingSafetyError('URL does not match the explicit staging project', 'staging_target_mismatch');
  }
  return Object.freeze({ projectRef, candidateGitSha: assertCandidateSha(expectedGitSha, actualGitSha) });
}

export function assertLocalTarget({
  supabaseUrl,
  projectRef,
  environmentName,
  allowMutations,
  expectedGitSha,
  actualGitSha
}) {
  if (environmentName !== 'local') {
    throw new StagingSafetyError('Environment must be explicitly named local', 'environment_not_local');
  }
  if (allowMutations !== 'true') {
    throw new StagingSafetyError('Local mutations were not explicitly enabled', 'mutations_not_enabled');
  }
  if (projectRef !== LOCAL_PROJECT_REF) {
    throw new StagingSafetyError('Local project reference is invalid', 'invalid_local_project_ref');
  }
  let url;
  try {
    url = new URL(supabaseUrl);
  } catch {
    throw new StagingSafetyError('Local Supabase URL is invalid', 'invalid_local_url');
  }
  if (url.origin !== LOCAL_SUPABASE_ORIGIN || url.pathname !== '/' || url.search || url.hash) {
    throw new StagingSafetyError('URL does not match the local Supabase instance', 'local_target_mismatch');
  }
  return Object.freeze({ projectRef, candidateGitSha: assertCandidateSha(expectedGitSha, actualGitSha) });
}
