# Sprint 1 trusted ranked asset pipeline

**Status:** local worker, private storage contract, transactional provisioning RPC, signed bootstrap delivery, and operator command implemented; deployment and automated lobby coordination pending

## Pipeline

The Node worker in `server/rankedAssetProvisioner.js` is the only supported
path from a source image to a ranked puzzle manifest. It:

1. decodes and slices the source image with pinned Sharp `0.35.5`;
2. produces one PNG for each configured row/column cell;
3. derives stable, high-range opaque piece IDs from the source digest without
   exposing their relationship to target positions;
4. uploads pieces under `games/{gameId}/{pieceId}.png` in the private
   `ranked-piece-assets` bucket;
5. calls `provision_ranked_puzzle_manifest_v2`, which atomically creates the
   append-only `authoritative_v2` pin and protected manifest; and
6. returns only game ID, piece count, status, and source digest.

The decoder accepts JPEG, PNG, or WebP only, limits the encoded source to 10
MiB and decoded source to 40 million pixels, and rejects any generated piece
larger than the bucket's 5 MiB object limit. SVG and other active or complex
container formats are not accepted.

The operation detects an existing manifest before uploading. A retry with the
same source/settings returns the existing prepared result; a different digest
fails closed. Upload paths and IDs are deterministic for retry recovery. If the
database transaction fails after uploads, the worker removes the uploaded
objects before returning the safe failure classification.

## Asset delivery

The storage bucket is private and has no authenticated object policy. The
bootstrap worker reads storage paths from the service-only manifest and creates
one-hour signed URLs after verifying the caller is assigned to the match. The
database never stores signed URLs or embeds target coordinates in asset rows.
Calling bootstrap again after reconnect produces fresh URLs without changing
the match revision or authority pin.

## Operator command

With service credentials set in the process environment:

```sh
npm run provision:ranked-assets -- \
  --game-id <uuid> \
  --image-file <trusted-local-path> \
  --rows 10 \
  --cols 10 \
  --mode NEXUS \
  --rack-capacity 10
```

The command must run in a trusted worker environment. It must never run in the
browser, accept a service-role key from a user, or log the protected catalogue,
storage paths, provider errors, or credentials.

## Remaining activation work

- Deploy the worker in the approved private runtime and supply secrets through
  its secret manager.
- Replace the manual operator command with a queue-backed new-match coordinator
  after the staging contract is proven.
- Add orphan-object reconciliation and alerting for process termination that
  occurs between upload and database provisioning.
- Exercise malformed images, decompression limits, storage quota, URL expiry,
  simultaneous provisioning, and cleanup behavior in staging.
- Keep the lobby creation flag off until the coordinator and all release gates
  are approved.
