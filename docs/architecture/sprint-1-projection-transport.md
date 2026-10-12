# Sprint 1 authenticated projection transport

**Status:** client transport and durable database publisher implemented; staging deployment and scheduling pending

Ranked clients use `SupabaseAuthoritativeMatchTransport` with `AuthoritativeMatchSession`. A snapshot query selects only the caller's row from `match_projections`; database RLS remains the authorization boundary. Commands are sent only to `ranked-command-v2`. Realtime updates use the private topic:

`ranked-match:<game-id>:viewer:<user-id>`

The client cannot authorize itself merely by constructing that topic. The `realtime.messages` select policy requires an authenticated user, a broadcast message whose topic matches the requested topic, and an existing `match_projections` row for that same user and topic. No client broadcast policy is granted.

Committed projections enter `match_outbox` in the same transaction as canonical state. `publish_authoritative_match_outbox_v2` locks a bounded batch with `FOR UPDATE SKIP LOCKED`, broadcasts each complete projection through `realtime.send(..., true)`, and marks it published in the same transaction. A failed broadcast remains unpublished and receives bounded exponential backoff. Duplicate delivery is safe because the session ignores revisions it has already accepted and fetches a fresh snapshot when it detects a gap.

## Operational requirements

- Disable public Realtime channels for the Supabase project.
- Invoke `publish_authoritative_match_outbox_v2` only as `service_role`, using a staging-approved scheduler or worker cadence.
- Monitor unpublished row age, retry count and publisher failures without logging projection payloads.
- Alert on sustained backlog and retain unpublished rows during rollback.
- Do not enable `authoritativeMultiplayerV2` until two-player, outsider, reconnect, missed-event, duplicate-event and publisher-restart tests pass in isolated staging.

