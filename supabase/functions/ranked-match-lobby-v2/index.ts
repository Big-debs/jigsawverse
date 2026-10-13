import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { corsHeaders } from '../_shared/cors.ts';
import {
  handleRankedLobbyAction,
  RankedMatchLobbyError
} from '../_shared/rankedMatchLobby.js';

const headers = { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const respond = (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers });

const secret = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) throw new RankedMatchLobbyError(`Missing server configuration: ${name}`);
  return value;
};

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);
  try {
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return respond({ error: 'authentication_required' }, 401);
    const supabaseUrl = secret('SUPABASE_URL');
    const authClient = createClient(supabaseUrl, secret('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: { user }, error } = await authClient.auth.getUser(token);
    if (error || !user) return respond({ error: 'invalid_authentication' }, 401);
    const admin = createClient(supabaseUrl, secret('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const result = await handleRankedLobbyAction({
      admin,
      actorId: user.id,
      body: await request.json()
    });
    return respond(result, 200);
  } catch (error) {
    const status = error instanceof RankedMatchLobbyError ? error.status : 500;
    const code = error instanceof RankedMatchLobbyError ? error.code : 'internal_error';
    console.error('ranked-match-lobby-v2 failed', {
      code,
      name: error instanceof Error ? error.name : 'UnknownError'
    });
    return respond({ error: code }, status);
  }
});
