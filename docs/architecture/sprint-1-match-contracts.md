# Sprint 1 match contract outline

**Status:** implementation started  
**Owner:** engineering lead (name required before Phase 0 sign-off)  
**Applies to:** ranked Assemble protocol v2

## Trust boundary

The browser submits a command containing a command ID, expected state revision, command type and semantic payload. It does not submit actor identity, replacement state, scores, answers or a client deadline. Trusted server code derives the actor from authentication, loads and locks the match, validates the command against canonical state and the server deadline, then atomically commits the next revision, result and sanitized per-viewer projections.

The canonical state contains protected solution mappings, true scores, both racks and the pool. It must not be returned directly by REST, Realtime, logs or telemetry. `createViewerProjection()` is the initial explicit allow-list boundary for player snapshots.

## Implemented foundation

- Protocol version, state-schema version and ruleset version constants.
- Revision-checked, idempotency-keyed client command envelopes.
- Payload validation for placement, check/pass response, Nexus marks and Nexus resolution.
- Complete canonical state export from `GameLogic`, including dimensions, rack capacity, scores/revealed scores, checks/turns, pending decisions, Nexus state, history and timing metadata.
- Per-player projections that exclude correct positions, piece catalogue, true scores, foreign rack IDs, pool IDs and move history.
- Contract tests that fail if protected answer or score fields enter player projections.
- Additive service-only tables for canonical matches, command idempotency and an outbox, plus authenticated read-only per-player projections.
- Service-role-only initialization and two-step begin/commit RPCs with row locking, deadline checks and compare-and-swap revision enforcement.
- Provider-neutral client session reconciliation with snapshot/subscribe/confirm startup, monotonic revisions, gap recovery and same-command-ID retry.
- Trusted deterministic command evaluation with strict payload allow-lists, canonical piece invariants and independently generated per-viewer projections.
- Authenticated Edge Function orchestration that derives the actor from Supabase Auth and performs resumable begin/evaluate/commit or safe rejection.

## Remaining Sprint 1 work

1. Confirm the production deployment SHA and inventory live Supabase schema, RLS, RPC and Realtime policies.
2. Specify ruleset-by-ruleset protected fields for pending checks, hints, marks, milestones, results, spectators, logs and telemetry.
3. Validate the additive migration and rollback procedure against an isolated Supabase staging project.
4. Deploy and verify the server-only worker in an isolated Supabase staging project, including interruption recovery and secret handling.
5. Implement the authenticated Supabase transport and publish only committed projections to authorized private topics.
6. Shadow-compare legacy and authoritative outcomes in staging before revoking direct competitive writes.

The existing multiplayer implementation remains the active legacy path during this work. Ranked exposure must remain disabled until the authority, secrecy, reconnect and concurrency exit gates pass.
