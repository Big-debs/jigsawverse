# Sprint 1 authoritative session recovery

**Status:** client session, Supabase transport and initialized-match UI adapter implemented; trusted bootstrap and staging activation pending

## Transport contract

The session accepts three injected operations:

- `fetchProjection({ gameId, userId })` returns the caller's complete authorized projection.
- `subscribeProjection({ gameId, userId, onProjection })` subscribes to complete committed projections and returns an unsubscribe function.
- `submitCommand(command)` sends a versioned command to the trusted worker. Authentication belongs to the transport; the command deliberately contains no actor ID.

## Connection sequence

1. Fetch the current authorized snapshot.
2. Subscribe to the caller's private projection stream.
3. Fetch again to close the fetch/subscribe race.
4. Accept only monotonically increasing revisions.
5. On a revision gap, fetch a complete snapshot before proceeding.
6. Ignore duplicate or out-of-order events.

WebSocket delivery is never treated as the source of truth. Every event is a complete projection, so recovery does not depend on replaying animation frames or reconstructing state deltas.

## Command sequence

Commands are serialized per client session. Each command pins the current revision and receives one UUID. An acknowledgement timeout may retry the exact same command object; it never generates a second command ID. Stale or conflicting revisions trigger snapshot recovery. Server rejections are not retried as new moves.

## Integration gate

The Supabase adapter, private topic authorization, outbox publisher and
initialized-match UI adapter are implemented. Do not connect this session to
production until trusted bootstrap, opaque piece assets, staging deployment,
publisher scheduling and recovery tests are complete. The existing lobby still
uses the legacy multiplayer classes and `authoritativeMultiplayerV2` remains
off.
