# Sprint 1 authority rollout and rollback

**Status:** additive foundation, worker, projection transport and shadow harness implemented; not deployed or activated

## Activation sequence

1. Verify the production deployment SHA and export the live Supabase schema, RLS, grants, RPC definitions and publication membership.
2. Apply the additive migration in an isolated staging project. Confirm that existing `games`, `game_state` and legacy Broadcast behavior are unchanged.
3. Run migration tests with two authenticated player accounts and one unrelated account. The unrelated account must receive no projection; players must see only their own `match_projections` row; authenticated clients must not read canonical state, commands or outbox rows or execute the v2 RPCs.
4. Deploy the trusted command worker with a service-role secret held only in the server environment. It derives `actor_id` from verified authentication before invoking `begin_authoritative_match_command_v2` and never returns canonical state.
5. Wire the independent legacy adapter and restricted telemetry sink into the staging-only `observeEvaluation` hook. Compare outcome, score, reveal, rack and terminal-state parity without allowing shadow results to affect authority.
6. Create new protocol-v2 matches only behind `authoritativeMultiplayerV2`. Never convert a match already in progress.
7. After reconnect, collision, duplicate-command, deadline and load gates pass, stop creating ranked legacy matches. Revoke legacy direct writes in a separate reviewed migration.

## Rollback before legacy-write revocation

- Disable `authoritativeMultiplayerV2`; this stops creation of new v2 matches.
- Allow already-started v2 matches to finish on the pinned worker version or cancel them through an explicit server-side operational decision. Never redirect them to client-authored state.
- Legacy matches continue using the unchanged legacy tables and policies.
- Stop the outbox publisher after its current transaction; unpublished rows remain durable for replay.
- Roll back the worker deployment independently. The additive tables can remain in place while evidence is collected.

## Schema removal, only after all v2 matches are closed

Take and verify a backup first. Then remove the three v2 functions, projection/outbox/command tables and `authoritative_matches` in dependency order. Schema removal is not the first-line operational rollback because it destroys command and result evidence.

## Gates still requiring real infrastructure

- Live schema and RLS inventory.
- SQL migration execution and rollback rehearsal against a Supabase staging project.
- Trusted worker deployment and secret handling review.
- Secrecy-matrix approval and transport/log-sink attack tests.
- Snapshot/subscribe/revision recovery and outbox publication in staging.
- Independent legacy adapter wiring, safe report-sink review and shadow soak.
- Concurrent same-cell, duplicate, reconnect, expiry and finalization load tests.
