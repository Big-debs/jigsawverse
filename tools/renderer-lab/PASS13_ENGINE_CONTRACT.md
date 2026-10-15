# Living Atlas — Pass 13: Gameplay Engine-to-Renderer Contracts

**Status:** Implemented as **isolated, read-only adapter contracts with focused tests**. No runtime activation, gameplay engine modification or production PR merge.

**Games in scope:** Jigsawverse Assemble (including the existing Phaser-backed solo presentation) and the Jigsawverse Planar Match mode. **Not** the standalone Planar-Cube trainer.

## Source audit (October 15, 2026)

The current `main` repository contains `src/lib/gameLogic.js`, `src/components/SinglePlayerGame.jsx`, `src/components/PhaserGame.jsx`, and `src/phaser/scenes/BoardScene.js`. The game logic's `getGameState()` exposes both racks, unrevealed scores, pending check data, move history and placed-piece metadata; its pieces include `correctPosition`. **Never pass it to a renderer, browser event broadcaster or multiplayer client.** The score reveal boundary must remain controlled by the genuine game flow and, for future ranked modes, authenticated server authority.

The actual playable Planar Match implementation currently resides on **PR #50** (`codex/planar-match3-prototype`): `src/lib/planarMatchEngine.js` exports `shiftLine`, `findMatches`, `collapseAndRefill`, `createInitialBoard`, and `cascadeScore`. Its UI presently orchestrates animation and cascade sequencing. **PR #50 is not merged into main**, so Pass 13 does not import it, invent a duplicate match engine, or claim production-rule parity. The test fixture uses its published `[{id,kind}]` board shape and six kind identifiers.

## Implemented pure modules

- `src/engineProjection.js` — strict protocol `jigsawverse.visual.v1`, versioned immutable viewer snapshots with only `sessionId`, `revision`, `origin`, `phase`, `family`, board dimensions, opaque `renderToken` values, public Planar `kind` and (Assemble only) the **viewer's own** rack. Unrecognized/hidden fields cause an error, rather than silently propagating.
- `projectSoloAssembleState(raw, options)` — a deliberately **solo-only** adapter for the existing `GameLogic.getGameState()` shape. It projects only visible board/rack tokens, never scores, `correctPosition`, private tile image data, the opponent rack or unrevealed milestone results. It rejects non-`SINGLE_PLAYER` mode.
- `projectPlanarEngineBoard(rawBoard, options)` — copies a 6x6 `[{id,kind}]` result from a trusted local engine commit into an immutable visual snapshot; ignores extra engine fields; never computes matches or scores.
- `acceptServerViewerProjection(raw)` — validates an ALREADY viewer-sanitized server payload. **It does not authenticate origin or make a payload trustworthy on its own.** Authenticating the sender, checking permissions, resolving hidden score checkpoints, and constructing viewer-specific server snapshots are separate required backend tasks.
- `src/presentationStream.js` — strict, ordered, non-authoritative cue channel, validating frame revision, event sequence, family, bounded indices, move direction, token identifiers and event payload shape. It blocks duplicate/out-of-order events, reports gaps, and requires explicit reset on session changes. Cues describe authorized **presentation**, never command success, scoring or correctness.
- `replayPresentationTrace()` — deterministic playback of pre-sanitized frame/event records without modifying the engine.
- `src/projectionLabAdapter.js` — optional read-only **lab-only** mapping. Planar 6x6 projected tokens/kinds can feed the existing Planar renderer view-model. The current 5x5 Assemble lab still expects fragment positions for image UVs; the adapter permits those **only** for explicitly opted-in *local solo* runs with a trusted local visual-asset lookup. A server/multiplayer snapshot cannot use that mapping.

## Example source-to-renderer flow

```text
Assemble solo GameLogic.getGameState()
    -> projectSoloAssembleState (known solo state, local opaque-token mapping)
    -> validateProjection / ViewerPresentationStream
    -> soloAssembleToLabState (5x5 trusted local image reference only)
    -> Existing isolated renderer presentation

Planar PR #50 actual engine (once available)
    -> engine-accepted 6x6 [{ id, kind }] board and actual cascade stages
    -> projectPlanarEngineBoard + separately authorized visual events
    -> ViewerPresentationStream
    -> planarToLabState / isolated renderer presentation

Future ranked multiplayer
    -> authenticated server command resolution
    -> server-private scoring and confidential solution
    -> authenticated per-viewer sanitized projection (NOT getGameState())
    -> acceptServerViewerProjection + ordered authorized visual cues
    -> renderer presentation only
```

## Engine-owned semantic events

`assemble.select`, `assemble.place`, `planar.shift`, `planar.clear`, `planar.drop` and `planar.refill` are permitted **only after** the engine's committed outcome supplies public details. Unlike Pass 12's nonmutating cascade *storyboard*, genuine `planar.clear/drop/refill` events must originate from the actual rules engine's resolution phases. Do not infer matches from displayed glyphs, invent refill tiles on the renderer, or award points on visual transitions.

**Data compatibility is not security proof.** Require server-authenticated per-viewer delivery and backend enforcement before ranked modes. No client-only secrecy check can protect a score included elsewhere in a payload.

## Versioning, replay, and fallback

- Protocol version mismatch fails closed. Session and family cannot change without explicit stream reset.
- Snapshots require monotonically increasing revision numbers. Old snapshots return `stale-frame`; gaps return `frame-gap-resynced`. Events require the latest matching revision and consecutive sequence numbers; gaps are held and must be resolved upstream.
- Output is immutable and intentionally read-only. No presentation callback may mutate `GameLogic`, Supabase, Planar's puzzle state, CAESAR metrics, hints, turn ownership or timers.
- Maintain the existing Phaser/Canvas2D fallback and feature flags. Rollout must be independently reversible without changing scoring.
- The laboratory's 5x5 Assemble board/rack and 6x6 Planar layout do **not** imply production Assemble supports only 5x5: production currently supports other grid dimensions and may use rectangular boards. Unsupported lab layouts should fail loudly rather than render an incorrectly cropped puzzle.

## Tests and acceptance

Focused Pass 13 contract tests cover privacy redaction, multiplayer rejection, board variants, object immutability, six Planar kinds, invalid raw fields, ordered events, duplicate/revision/gap handling, deterministic replay, and solo-only image-asset gating. The JavaScript runtime checks were executed directly against the actual committed source.

**Still required before the next phase:**

1. Clean `npm ci && npm test && npm run build` on the complete Pass 13 branch.
2. In a network-enabled browser, exercise a complete solo Assemble turn using a **trusted local** image registry. No pre-reveal score may appear in renderer events, DOM data attributes, debug logs or network payloads.
3. Once PR #50 is reconciled and reviewed, run the real Planar shift, wrapping match, cascade clear, drop and refill events through this visual adapter. Confirm exact board/token parity and replay after interruption.
4. Define server-authenticated, per-viewer secret-safe multiplayer projections, version and retry compatibility, and leak-focused integration tests before multiplayer renderer integration.
5. Actual mobile Android/iOS performance/accessibility, screen reading, reduced-motion, sound and glyph distinguishability QA.
6. Phase 0 owner approval, cultural provenance, safeguarding/child data review, benchmarking and rollback sign-off.

**No production source files, database policies, ranked scoring, multiplayer protocols or live deployment are changed.**
