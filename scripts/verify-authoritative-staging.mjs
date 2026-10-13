import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { assertStagingTarget } from '../server/stagingSafety.js';
import { processNextRankedAssetJob } from '../server/rankedAssetJobWorker.js';
import { AuthoritativeLobbyService } from '../src/lib/authoritativeLobbyService.js';
import { createMatchCommand, MATCH_COMMAND_TYPES } from '../src/lib/matchProtocol.js';
import { SupabaseAuthoritativeMatchTransport } from '../src/lib/supabaseAuthoritativeMatchTransport.js';

const required = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw Object.assign(new Error(`Missing ${name}`), { code: 'missing_configuration' });
  return value;
};

const actualGitSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const supabaseUrl = required('STAGING_SUPABASE_URL');
const anonKey = required('STAGING_SUPABASE_ANON_KEY');
const serviceRoleKey = required('STAGING_SUPABASE_SERVICE_ROLE_KEY');
const target = assertStagingTarget({
  supabaseUrl,
  projectRef: required('STAGING_PROJECT_REF'),
  environmentName: required('STAGING_ENVIRONMENT_NAME'),
  allowMutations: required('ALLOW_STAGING_MUTATIONS'),
  expectedGitSha: required('STAGING_EXPECTED_GIT_SHA'),
  actualGitSha
});

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(supabaseUrl, serviceRoleKey, options);
const clientFor = () => createClient(supabaseUrl, anonKey, options);
const runId = randomUUID();
const started = Date.now();
const resources = { userIds: [], gameId: null, imageId: null, sourcePath: null, piecePaths: [] };

const ensure = (condition, code) => {
  if (!condition) throw Object.assign(new Error(code), { code });
};

const createPlayer = async (role) => {
  const email = `jigsawverse-${runId}-${role}@example.com`;
  const password = `${randomBytes(24).toString('base64url')}aA1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: `${role}_${runId.slice(0, 8)}`, staging_fixture: true }
  });
  ensure(!error && data?.user?.id, 'fixture_user_create_failed');
  resources.userIds.push(data.user.id);
  const client = clientFor();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  ensure(!signInError, 'fixture_sign_in_failed');
  return { id: data.user.id, client };
};

const invokeCommand = async (client, command) => {
  const { data, error } = await client.functions.invoke('ranked-command-v2', {
    body: { command }
  });
  if (data?.status) return data;
  if (error?.context && typeof error.context.json === 'function') {
    try {
      const context = typeof error.context.clone === 'function'
        ? error.context.clone()
        : error.context;
      const rejected = await context.json();
      if (rejected?.status === 'rejected') return rejected;
    } catch {
      // Fall through to a safe verifier failure code.
    }
  }
  throw Object.assign(new Error('ranked-command-v2 failed'), { code: 'ranked_command_v2_failed' });
};

const assertPrivateTables = async (client) => {
  const protectedTables = [
    'authoritative_matches',
    'match_commands',
    'match_outbox',
    'ranked_puzzle_manifests',
    'ranked_match_jobs'
  ];
  for (const table of protectedTables) {
    const { data, error } = await client.from(table).select('*').limit(1);
    ensure(Boolean(error) || data?.length === 0, 'protected_table_visible');
  }
};

const cleanup = async () => {
  if (resources.gameId && resources.piecePaths.length === 0) {
    const { data } = await admin.from('ranked_puzzle_manifests')
      .select('asset_manifest').eq('game_id', resources.gameId).maybeSingle();
    resources.piecePaths = data?.asset_manifest?.map(({ storagePath }) => storagePath) ?? [];
  }
  if (resources.piecePaths.length > 0) {
    await admin.storage.from('ranked-piece-assets').remove(resources.piecePaths);
  }
  if (resources.gameId) await admin.from('games').delete().eq('id', resources.gameId);
  if (resources.imageId) await admin.from('images').delete().eq('id', resources.imageId);
  if (resources.sourcePath) await admin.storage.from('puzzle-images').remove([resources.sourcePath]);
  for (const userId of resources.userIds.reverse()) await admin.auth.admin.deleteUser(userId);
};

let report;
try {
  const { count: pendingJobCount, error: queueError } = await admin
    .from('ranked_match_jobs')
    .select('game_id', { count: 'exact', head: true })
    .in('status', ['queued', 'processing', 'failed']);
  ensure(!queueError && pendingJobCount === 0, 'staging_queue_not_empty');

  // Sequential creation ensures every successful fixture ID is registered
  // before a later failure can enter cleanup.
  const playerA = await createPlayer('player_a');
  const playerB = await createPlayer('player_b');
  const observer = await createPlayer('observer');
  const source = await sharp({
    create: { width: 40, height: 40, channels: 3, background: { r: 70, g: 110, b: 190 } }
  }).png().toBuffer();
  resources.sourcePath = `${playerA.id}/staging-${runId}.png`;
  let response = await admin.storage.from('puzzle-images').upload(resources.sourcePath, source, {
    contentType: 'image/png', upsert: false
  });
  ensure(!response.error, 'fixture_source_upload_failed');
  response = await admin.from('images').insert({
    uploaded_by: playerA.id,
    file_name: 'staging-verifier.png',
    storage_path: resources.sourcePath,
    storage_url: `${supabaseUrl}/storage/v1/object/public/puzzle-images/${resources.sourcePath}`,
    category: 'staging-verifier',
    grid_size: 25,
    is_public: false,
    width: 40,
    height: 40
  }).select('id').single();
  ensure(!response.error && response.data?.id, 'fixture_image_insert_failed');
  resources.imageId = response.data.id;

  const lobbyA = new AuthoritativeLobbyService({ supabase: playerA.client });
  const created = await lobbyA.create({
    imageId: resources.imageId,
    gridSize: 5,
    gameplayMode: 'NEXUS',
    playerName: 'Player A',
    timeLimit: 600
  });
  resources.gameId = created.gameId;
  const workerResult = await processNextRankedAssetJob({ admin });
  ensure(workerResult.status === 'prepared' && workerResult.gameId === resources.gameId, 'asset_worker_failed');
  const { data: preparedManifest, error: manifestError } = await admin
    .from('ranked_puzzle_manifests')
    .select('asset_manifest').eq('game_id', resources.gameId).single();
  ensure(!manifestError, 'prepared_manifest_lookup_failed');
  resources.piecePaths = preparedManifest.asset_manifest.map(({ storagePath }) => storagePath);
  const joined = await new AuthoritativeLobbyService({ supabase: playerB.client }).join({
    gameCode: created.gameCode,
    playerName: 'Player B'
  });
  ensure(joined.authorityModel === 'authoritative_v2', 'persisted_authority_failed');

  const bootstrapA = await new SupabaseAuthoritativeMatchTransport({ supabase: playerA.client })
    .bootstrapMatch({ gameId: resources.gameId });
  const bootstrapB = await new SupabaseAuthoritativeMatchTransport({ supabase: playerB.client })
    .bootstrapMatch({ gameId: resources.gameId });
  ensure(bootstrapA.viewerRole === 'playerA' && bootstrapB.viewerRole === 'playerB', 'viewer_role_failed');
  ensure(bootstrapA.pieceAssets.every((asset) => !('correctPosition' in asset)), 'asset_secrecy_failed');

  const projectionCounts = [];
  for (const player of [playerA, playerB, observer]) {
    const { data, error } = await player.client.from('match_projections')
      .select('game_id, viewer_id, revision')
      .eq('game_id', resources.gameId);
    ensure(!error, 'projection_rls_query_failed');
    projectionCounts.push(data.length);
    await assertPrivateTables(player.client);
    const trustedRpc = await player.client.rpc('claim_ranked_match_job_v2', {
      p_lease_token: randomUUID()
    });
    ensure(Boolean(trustedRpc.error), 'trusted_rpc_exposed');
  }
  ensure(projectionCounts.join(',') === '1,1,0', 'projection_rls_failed');

  const observerBootstrap = await observer.client.functions.invoke('ranked-match-bootstrap-v2', {
    body: { gameId: resources.gameId }
  });
  ensure(Boolean(observerBootstrap.error), 'observer_bootstrap_exposed');

  const commands = [
    createMatchCommand({
      gameId: resources.gameId,
      commandId: randomUUID(),
      expectedRevision: 0,
      type: MATCH_COMMAND_TYPES.PLACE_PIECE,
      payload: { pieceId: bootstrapA.projection.rack[0], gridIndex: 0 }
    }),
    createMatchCommand({
      gameId: resources.gameId,
      commandId: randomUUID(),
      expectedRevision: 0,
      type: MATCH_COMMAND_TYPES.PLACE_PIECE,
      payload: { pieceId: bootstrapB.projection.rack[0], gridIndex: 0 }
    })
  ];
  const commandResults = await Promise.all([
    invokeCommand(playerA.client, commands[0]),
    invokeCommand(playerB.client, commands[1])
  ]);
  ensure(commandResults.filter(({ status }) => status === 'accepted').length === 1, 'concurrency_accept_count_failed');
  ensure(commandResults.filter(({ status }) => status === 'rejected').length === 1, 'concurrency_reject_count_failed');

  const { data: outbox, error: outboxError } = await admin.from('match_outbox')
    .select('id, revision, viewer_id')
    .eq('game_id', resources.gameId)
    .eq('revision', 1);
  ensure(!outboxError && outbox.length === 2, 'outbox_count_failed');
  report = {
    status: 'passed',
    candidateGitSha: target.candidateGitSha,
    runId,
    durationMs: Date.now() - started,
    projectionCounts: { playerA: 1, playerB: 1, observer: 0 },
    concurrency: { accepted: 1, rejected: 1, committedRevision: 1 },
    outboxRows: outbox.length,
    pieceCount: bootstrapA.pieceAssets.length
  };
} catch (error) {
  report = {
    status: 'failed',
    candidateGitSha: target.candidateGitSha,
    runId,
    durationMs: Date.now() - started,
    errorCode: typeof error?.code === 'string' ? error.code : 'staging_verification_failed'
  };
  process.exitCode = 1;
} finally {
  await cleanup();
}

process.stdout.write(`${JSON.stringify(report)}\n`);
