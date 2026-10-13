import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { provisionRankedPuzzleAssets } from '../server/rankedAssetProvisioner.js';

const argumentsByName = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const name = process.argv[index];
  const value = process.argv[index + 1];
  if (!name?.startsWith('--') || value === undefined) {
    throw new Error('Arguments must use --name value pairs');
  }
  argumentsByName.set(name.slice(2), value);
}

const requiredArgument = (name) => {
  const value = argumentsByName.get(name);
  if (!value) throw new Error(`Missing required argument: --${name}`);
  return value;
};

const requiredEnvironment = (name) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const positiveIntegerArgument = (name, fallback = null) => {
  const raw = argumentsByName.get(name);
  if (raw === undefined && fallback !== null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
};

const supabaseUrl = requiredEnvironment('SUPABASE_URL');
const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const gameId = requiredArgument('game-id');
const imageFile = requiredArgument('image-file');
const rows = positiveIntegerArgument('rows');
const cols = positiveIntegerArgument('cols');
const gameplayMode = requiredArgument('mode').toUpperCase();
const rackCapacity = positiveIntegerArgument('rack-capacity', 10);
const imageBuffer = await readFile(imageFile);
const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const result = await provisionRankedPuzzleAssets({
  admin,
  gameId,
  imageBuffer,
  rows,
  cols,
  gameplayMode,
  rackCapacity
});

// Safe aggregate only: never print the answer catalogue, paths, or credentials.
process.stdout.write(`${JSON.stringify(result)}\n`);
