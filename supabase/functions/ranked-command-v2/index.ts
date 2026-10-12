import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  RankedCommandWorkerError,
  processRankedCommand,
  rankedCommandHttpStatus
} from '../_shared/rankedCommandWorker.js';

const jsonHeaders = {
  ...corsHeaders,
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
};

const jsonResponse = (body: unknown, status: number) => new Response(
  JSON.stringify(body),
  { status, headers: jsonHeaders }
);

const requiredSecret = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new RankedCommandWorkerError(`Missing server configuration: ${name}`);
  return value;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  try {
    const authorization = request.headers.get('Authorization');
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return jsonResponse({ error: 'authentication_required' }, 401);

    const supabaseUrl = requiredSecret('SUPABASE_URL');
    const anonKey = requiredSecret('SUPABASE_ANON_KEY');
    const serviceRoleKey = requiredSecret('SUPABASE_SERVICE_ROLE_KEY');

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) return jsonResponse({ error: 'invalid_authentication' }, 401);

    const body = await request.json();
    const command = body?.command ?? body;
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const result = await processRankedCommand({
      admin,
      actorId: user.id,
      command
    });

    return jsonResponse(result, rankedCommandHttpStatus(result));
  } catch (error) {
    const status = error instanceof RankedCommandWorkerError ? error.status : 500;
    const code = error instanceof RankedCommandWorkerError ? error.code : 'internal_error';
    const errorName = error instanceof Error ? error.name : 'UnknownError';
    // Log only the safe error classification; canonical state and rule details
    // must never enter function logs.
    console.error('ranked-command-v2 failed', { code, name: errorName });
    return jsonResponse({ error: code }, status);
  }
});
