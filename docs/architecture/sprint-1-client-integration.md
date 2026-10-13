# Sprint 1 authoritative client integration

**Status:** initialized-match adapter, pinned routing, bootstrap endpoint and client handshake implemented; trusted asset preparation and lobby activation pending

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

The trusted bootstrap boundary now implements persisted service-only pins,
server-side state construction, and safe response filtering. Before the
creation flag can be connected to the lobby, the deployment must additionally:

1. provision the match's authority pin only through the trusted new-match coordinator;
2. wait for or atomically assign both player slots;
3. generate opaque piece IDs and the protected answer catalogue in the trusted asset pipeline;
4. create render assets addressable by opaque ID without embedding target
   coordinates;
5. deploy and validate the bootstrap migration and Edge function in staging; and
6. pass the remaining release gates.

The existing multiplayer screens continue to instantiate the legacy classes.
Merely setting the environment variable does not activate v2 lobby creation in
this increment.
