# Living Atlas — Pass 10: Atlas Workshop Environment Integration

**Status:** Desktop WebGL2 validated in the isolated Three.js laboratory. Physical-device and production approvals remain **OPEN**.
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

## Completed engineering validation

- A clean `npm ci` installed 16 packages from the committed lockfile and reported zero vulnerabilities. All **15 Node tests** and JavaScript syntax checks passed; the Vite 8.3.4 production build completed successfully.
- A real desktop Chromium WebGL2 session exercised all **18** game-family, quality-tier and lighting-preset combinations. Each retained one renderer canvas and the expected 5/17/28 Workshop objects after diagnostics settled, with no console errors.
- Desktop visual checks covered Assemble and Planar at Low/Daylight, Medium/Golden Hour and High/Tournament Night. The environment remained decorative and left the board, ten-piece Assemble rack, Planar rails, hint and controls unobstructed.
- At 390×844, both families were checked at Low and High. The High tier's 28 objects did not occlude the Assemble rack or Planar rails, and the document had no horizontal overflow.
- Twenty Planar resets, ten quality changes and ten Workshop/Board-only changes completed without errors. A second High→Low and Workshop→Board-only cycle retained one canvas and plateaued at the same Low-tier draw calls, triangles, textures and five visible props.
- A real `WEBGL_lose_context` event replaced WebGL with the safe Canvas2D fallback, cleared the diagnostics and retained one canvas. Restarting Auto restored WebGL2 and the five-object Low Workshop without console errors.
- Browser-session frame samples remained within the proposed Low desktop threshold during these checks. They are not physical-device, battery or thermal certification.

## Acceptance gates still pending

1. Measure frame p95, memory, texture counts, mobile thermals, interaction latency and startup time on physical budget Android, midrange Android and iOS Safari hardware.
2. Record the exact device model, OS, browser, tier duration, battery delta and observed heat/stutter alongside the copied technical reports.
3. Repeat the clean install, test suite and production build in CI.
4. Obtain art direction, cultural rights and release approval. Keep the official tournament security/authority and child-data privacy gates separate.

No production Jigsawverse gameplay code, ranked multiplayer, database migration or user-facing deployment is changed by this Pass 10 laboratory.
