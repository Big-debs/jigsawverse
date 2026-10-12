# Sprint 1 ranked command worker

**Status:** Edge Function adapter implemented; live deployment and staging verification pending

`ranked-command-v2` is the only browser-facing entry point for authoritative ranked commands. It validates the caller's bearer token with Supabase Auth, obtains the user ID from the verified user object and creates a separate service-role client that is never returned to the browser.

The worker sends the verified actor ID and validated command to `begin_authoritative_match_command_v2`. The database returns the player role pinned to the authoritative match; the request body cannot select a role. The worker evaluates one command and atomically commits canonical state, both viewer projections and outbox events. A same-ID retry can resume a pending command after a worker interruption or return the previously committed result without evaluating twice.

Rule failures close the command ledger through `reject_authoritative_match_command_v2`. Responses expose only stable error codes; never correctness, answer mappings, foreign racks, canonical state or raw database errors. Logs similarly contain only safe classifications.

## Required secrets

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` - server environment only

The function must retain Supabase's JWT verification and must not be deployed with anonymous verification disabled. Browser invocation uses the current user access token through `supabase.functions.invoke('ranked-command-v2', { body: { command } })`.

## Deployment gate

Before deployment, run the function in an isolated Supabase staging project and verify valid, expired and cross-project JWTs; two-player role mapping; worker interruption after begin; duplicate command replay; same-cell collision; deadline expiry; RLS; and absence of protected data in responses and logs. The production flag remains off until those checks and outbox delivery tests pass.
