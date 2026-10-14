# Living Atlas — Pass 10: Atlas Workshop Environment Integration

**Status:** Implemented in isolated Three.js laboratory. **Not production-approved.**
**Scope:** Jigsawverse Assemble and Jigsawverse Planar exclusively; standalone Planar-Cube trainer is excluded.

## Delivered

This is the first shared, modular civic-workshop environment around both boards. The world is intentionally noninteractive: it does not change tile IDs, rack ownership, Planar shift mechanics, scoring, hints, timers, cognitive metrics, or multiplayer state.

- `src/worldPlan.js` defines a deterministic environment specification, safety margins, quality tiers and a validation function.
- `src/worldScene.js` builds the scene from four reusable primitive geometries, referencing existing Pass 07 material instances. Each world instance owns only its geometries and has an idempotent disposer.
- `src/threeScene.js` attaches the world beside the active board, rebuilds it on mode/quality changes, hides it on user request, and releases its geometry during teardown.
- `src/main.js` adds an **Atlas Workshop / Board only** comparison control and a workshop-object count to the renderer diagnostics.
- `tests/world-plan.test.mjs` checks noninteraction, deterministic layouts, both game-family safety regions and rejection of invalid intrusion.

## Visual direction

**Low**: 5 decorative forms — stone foundation, remote plinth, two brass inlays and front rim.

**Medium**: 17 forms — low-tier kit plus paired columns, brass capitals, civic lintel, two planters and low-poly foliage, shaded wall and canal treatment.

**High**: 28 forms — medium kit plus indigo banners, distant skyline silhouettes, a small dome, vegetation and a second water accent.

The environment is **one world**, not separate visual identities for each game. It uses existing clay, limestone, brass and indigo materials. No external landmark models, sacred cultural emblems, crowds, characters or expensive open-world assets are required.

## Technical boundaries

- Y-up, puzzle board on XZ. Assemble's 5x5 reference/ten-piece rack and Planar's 6x6 lattice/rail input corridors remain protected.
- No environment mesh is included in picking/raycast target collections.
- One active viewport renderer at a time; the existing Canvas2D laboratory fallback is unchanged.
- Reuse quality-tier material instances, no duplicate texture downloads, no new physics or game rule dependencies.
- Dimension, safety-zone and scene-composition acceptance are checked by pure JavaScript tests. These are **not** proof of actual GPU frame rate, accessibility, or real-device occlusion.
- On switching tiers or game families, dispose prior world geometry before constructing the replacement.
- Workshop visibility can be disabled to compare board-only readability/performance without changing game state.

## Acceptance gates still pending

1. On a clean connected checkout: `cd tools/renderer-lab && npm ci && npm test && npm run build`.
2. In a real WebGL2 browser, visually compare both games across Low, Medium and High plus all three Pass 07 lighting presets.
3. Verify the actual screenshot at 390x844 and desktop: no occluded Assemble rack, Planar rails, controls or hints; no image UV or glyph regression.
4. Confirm there are no GPU resource leaks after 20 game resets, 10 quality changes, and 10 world on/off changes.
5. Measure frame p95, memory, texture counts, mobile thermals, interaction latency and startup time on physical budget Android and iOS Safari hardware.
6. Obtain art direction, cultural rights and release approval. Keep the official tournament security/authority and child-data privacy gates separate.

No production Jigsawverse gameplay code, ranked multiplayer, database migration or user-facing deployment is changed by this Pass 10 laboratory.
