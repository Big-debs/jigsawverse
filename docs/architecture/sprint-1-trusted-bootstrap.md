# Sprint 1 trusted ranked-match bootstrap

**Status:** service-only data contract, trusted asset worker, bootstrap boundary, signed delivery, and client transport implemented; staging deployment and lobby coordination pending

## Trust boundary

The browser calls `ranked-match-bootstrap-v2` with only `gameId`. The function
verifies the bearer token, derives the actor from Supabase Auth, and uses the
service role to load:

- the two player assignments from `games`;
- the lifetime authority choice from `match_authority_pins`; and
- a pre-generated puzzle definition from `ranked_puzzle_manifests`.

The browser cannot write or read the authority pin, answer catalogue, or source
manifest. Those tables have RLS enabled, no authenticated policies, explicit
authenticated revocation, and service-role grants only.

## Prepared manifest contract

A trusted asset-preparation job must create exactly one catalogue and asset
entry per board cell. Piece IDs are unique integers in the server-only opaque
namespace (`>= 1,000,000,000`) and are unrelated to target positions. The
protected catalogue maps each ID to one unique target position. The safe asset
list maps each ID to a private storage path and optional edge display flag; it
may not contain target position, row, column, public/signed URL, or
edge-topology fields.

The source image must be cut into independent piece assets before provisioning.
The existing browser image slicer is not valid for ranked bootstrap because its
piece ID equals the answer position and its objects carry row/column metadata.

## Initialization sequence

1. Load the game and verify the authenticated actor occupies player A or B.
2. Require both player slots, an `authoritative_v2` pin, an active game, and a
   valid prepared manifest.
3. If the caller already has a revision-zero projection, return it unchanged.
4. Shuffle the server-owned piece catalogue using cryptographic randomness,
   fill both racks, and retain the remaining opaque IDs in the protected pool.
5. Construct and validate canonical revision zero inside the trusted worker.
6. Derive both secrecy-filtered projections and call
   `initialize_authoritative_match_v2` with the service role.
7. Re-read and return only the caller's stored projection, viewer role, pinned
   authority model, and coordinate-free assets.

Concurrent bootstrap requests are retry-safe: after an initialization race,
the worker re-reads the stored caller projection. It never returns the losing
candidate state or treats client state as a fallback.

## Remaining activation work

- Deploy the trusted image-cutting and manifest-provisioning job.
- Test one-hour signed URL expiry and reconnect refresh behavior.
- Provision pins only from the approved new-match coordinator; existing legacy
  games must never be repinned.
- Deploy the migration and Edge function in isolated staging and run the RLS,
  duplicate-bootstrap, malformed-manifest, and asset-metadata attack matrix.
- Connect lobby creation only after these items and all release gates pass.
