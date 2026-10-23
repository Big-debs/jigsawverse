# Production Integration Sprint 1 — Solo Assemble Atlas 3D opt-in

**Status:** Draft feature-flagged implementation for controlled QA. Not approved for production activation.

## Scope and limitations

- The existing **Assemble solo GameLogic** remains the sole authority for placement, scoring, time, milestone reveal, and hints. There are no gameplay or multiplayer algorithm changes.
- Existing **Phaser 2D is the default** and continues to serve all multiplayer games, all grids except exactly 5×5, any invalid/unsupported piece set, and any graphics failure.
- A valid 5×5, 25-piece solo puzzle offers **Classic 2D / Try Atlas 3D** only if the build-time flag `VITE_ENABLE_LIVING_ATLAS_SOLO_3D=true`. The example and the default remain `false`.
- The 3D path currently uses the Living Atlas laboratory's existing low-tier 5×5 GLBs and now loads **the selected game's image**, not the reference test image. The comparison does not claim feature parity for all settings, grid sizes, image crop modes or physical phones.
- Opt-in is a **developer/QA flag** plus an in-game user choice. No automatic production activation. The root `three` dependency is pinned to 0.180.0 and the package lock is updated; Three.js enters a dynamically imported React view rather than Phaser's default path.

## Architecture

```text
Solo GameLogic (unchanged)
  ├─ existing Phaser 2D renderer (default; full feature set)
  └─ explicit QA flag + player opt-in + valid 5x5 registry
       └─ createSoloAtlasSession
            ├─ 25 unique tiles with trusted local image fragment mapping
            ├─ projectSoloAssembleState (remove scores, move history, private fields)
            └─ soloAssembleToLabState (read-only visual indices)
                 └─ lazy AtlasSoloRenderer / AtlasThreeRenderer
                      ├─ loaded GLB + actual current puzzle image
                      ├─ select(fragment): parent resolves genuine rack piece
                      ├─ place(cell): parent calls unchanged GameLogic.placePiece()
                      └─ WebGL missing, asset loading error, context loss -> Phaser fallback
```

Only the parent knows the engine piece objects, validation outcomes, hidden score, rack IDs and correct positions. The 3D React component receives the sanitized display view and an image URL; its input callbacks carry a fragment reference or cell index only. It cannot award points, approve a move or call Supabase.

## Critical QA acceptance and open issues

1. Clean install, root Vitest test suite, lint and Vite build on the PR branch. This environment lacks GitHub/npm connectivity for executing the full installed dependency tree; five focused bridge behavior checks passed using the committed source.
2. Validate **actual 5×5 solo play** on browser/mobile: selecting a genuine rack tile, placement, rack refill, a wrong placement, 20% score checkpoint, expiry/completion, and seamless return to Classic 2D without state loss.
3. Check the selected game image loads with CORS permissions and that image slicing matches the source image, especially non-square image aspect ratios. Report fallback on blocked/expired URLs or WebGL context loss. Never use a demo sample as live image.
4. Test hints: an active hint is intentionally routed back to Phaser because the 3D renderer does not yet present every existing hint shape.
5. Test settings parity, accessible controls, keyboard navigation, reduced motion and 320px responsive layout. Any requirement not supported by 3D should retain the Phaser path.
6. Inspect network/devtools/DOM: no hidden scores, opponent rack, solution metadata or `correctPosition` should pass through the 3D renderer component. This does **not** make the existing broader application client-side state private; ranked multiplayer needs authenticated server authority.
7. Confirm successful WebGL2 to Phaser fallback uses a single canvas after cleanup, with no lingering animation frames, stuck selection or duplicate move commands.
8. Benchmark actual low/mid/high Android and iOS Safari devices before approval. Obtain asset-rights, cultural design and child-safeguarding approvals before public enablement.
9. Keep `VITE_ENABLE_LIVING_ATLAS_SOLO_3D` **false** in Vercel production, preview by default, and `.env.example`. Validate opt-in only in a disposable QA build.

## Planar PR #50 reconciliation

PR #50 remains separate, unmerged, and introduces a playable Planar engine and routing with a diverged history relative to this branch. It must be reviewed/updated independently before actual Planar mode integration. Do **not** merge PR #50 as part of this experimental Solo Assemble 3D PR. The Living Atlas Pass 13 Planar adapter remains read-only until that decision.

## Rollback

Disable the build-time flag or choose Classic 2D; neither action changes game state or the persisted gameplay schema. There are no migrations, server changes, score schema changes or production theme activation in this PR.
