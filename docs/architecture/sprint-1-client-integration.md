# Sprint 1 authoritative client integration

**Status:** initialized-match adapter, pinned routing, trusted asset preparation and leased queue worker, queue-backed lobby coordinator, bootstrap endpoint and client handshake implemented; screen integration and staging deployment pending

## Authority routing

`VITE_AUTHORITATIVE_MULTIPLAYER_V2` is a creation gate only. It may choose
`authoritative_v2` for a newly created match after release approval. Every
existing match must instead use its persisted `authority_model` value:

- `legacy` always resumes through the existing client-written flow, even when
  the creation flag is on.
- `authoritative_v2` always resumes through the authoritative session, even
  when the creation flag is later turned off.

This prevents a reconnect, rollback, or configuration refresh from switching
an in-progress match between trust models. Unknown or missing persisted values
fail closed at the routing boundary.

## Initialized-match client

`AuthoritativeMultiplayerClient` adapts an already initialized protocol-v2
match to the current gameplay interaction surface. It:

- connects through snapshot/subscribe/confirm recovery;
- maps only the caller's projection into the renderer read model;
- represents the opponent rack by count, never foreign piece IDs;
- supplies only milestone-revealed scores;
- submits placement, check/pass, Nexus mark, and Nexus resolution commands;
- updates the UI only from accepted server projections; and
- surfaces safe rejection codes without attempting a local state mutation.

Render assets are reduced to `id`, `imageData`, and `isEdge`. Target position,
row, column, edge topology, and any other input metadata are discarded before
the asset map reaches gameplay state. Production assets must use server-issued
opaque piece IDs; the current image slicer's position-derived IDs are not
suitable for ranked secrecy.

## Why lobby activation remains off

The current host flow creates and slices the puzzle before a second player is
assigned. The v2 initializer requires two pinned players and protected initial
canonical state. Sending the existing client-generated piece mapping to the
initializer would make the browser the source of ranked answers and would
expose target positions through position-derived piece IDs.

The trusted lobby boundary now creates the game, immutable authority pin, and
asset-preparation job in one transaction. Join requests first resolve the
persisted authority: unpinned existing games stay on the legacy path, while v2
games are claimed atomically by the trusted coordinator. Status responses
contain readiness and opponent-presence metadata only; jobs, manifests, and
answers remain service-only.

The ranked asset worker claims one eligible job with a unique lease token and
`SKIP LOCKED`, downloads only the server-selected `images.storage_path`, and
passes the bytes to the trusted provisioner. Completion and failure updates
must present the same lease token. Expired leases are recoverable, retries use
bounded exponential backoff, and five failed attempts stop automatic claims.
Operators can drain up to 100 jobs per invocation with:

```sh
npm run worker:ranked-assets -- 25
```

The worker output contains aggregate prepared/failed counts only.

Before the creation flag can be connected to the lobby, the implementation and
deployment must additionally:

1. connect the feature-flagged host and guest screens to the lobby service and bootstrap handshake;
2. deploy the private bucket, coordinator, worker, bootstrap migration, and Edge functions in staging; and
3. pass the remaining release gates.

The existing multiplayer screens continue to instantiate the legacy classes.
Merely setting the environment variable does not activate v2 lobby creation in
this increment.
