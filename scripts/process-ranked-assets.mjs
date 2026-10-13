import { createClient } from '@supabase/supabase-js';
import { processNextRankedAssetJob } from '../server/rankedAssetJobWorker.js';

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const maximum = Number(process.argv[2] ?? 1);
if (!Number.isInteger(maximum) || maximum < 1 || maximum > 100) {
  throw new Error('Maximum jobs must be an integer from 1 to 100');
}

const admin = createClient(
  requiredEnvironment('SUPABASE_URL'),
  requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY'),
  { auth: { persistSession: false, autoRefreshToken: false } }
);

const summary = { prepared: 0, failed: 0, idle: false };
for (let count = 0; count < maximum; count += 1) {
  const result = await processNextRankedAssetJob({ admin });
  if (result.status === 'idle') {
    summary.idle = true;
    break;
  }
  summary[result.status] += 1;
}

// Aggregate counts only. Never print source paths, manifests, answers or errors.
process.stdout.write(`${JSON.stringify(summary)}\n`);
if (summary.failed > 0) process.exitCode = 1;
