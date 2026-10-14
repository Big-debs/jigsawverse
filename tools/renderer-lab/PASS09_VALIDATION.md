# Living Atlas — Pass 09 Renderer Validation Report

**Status:** Desktop WebGL2 validated; physical-device and production-integration gates remain **OPEN**.
**Scope:** Isolated `tools/renderer-lab/` only. The Jigsawverse production renderer, game rules, multiplayer state, CAESAR telemetry and separate Planar-Cube trainer remain unchanged.
**Baseline:** Pass 08 draft PR #53; this Pass 09 branch is deliberately stacked on that branch after subsequent commits were observed.

## Completed static and deterministic checks

- The provided Pass 08 source package was inspected. All three referenced glTF binary files parse as glTF 2.0, with real measured bounds: tile 0.92 × 0.10 × 0.92; Assemble board/rack approximately 5.5 × 0.405 × 7.90; Planar lattice approximately 7.04 × 0.395 × 7.04.
- Static validation detected duplicate Assemble tiles when the UV proof was enabled; UV-proof mode now omits rack pieces while displaying the full 25-fragment image.
- Repeated graphics quality changes previously accumulated an untracked transparent picking material. The renderer now tracks and disposes it on scene rebuild.
- High quality previously toggled WebGL shadow rendering without enabling the directional light to cast shadows. Light casting and the bounded shadow camera are now configured together.
- UV rectangle coordinates were extracted into a small pure contract module with tests for top-left/bottom-right Assemble image fragments and all six Planar atlas regions.
- WebGL2 capability probing now releases the temporary probe context. The context-loss path increments the mount token before activating fallback; stale mounting work is also checked against the currently active scene.
- Real-browser validation found that UV-proof state changes retained the prior rack coordinates when the demo move counter did not change. Non-move visual transitions now snap pieces to their new goals, so the complete image renders as one correctly oriented 5×5 board and the rack is empty.
- Real-browser validation also found that the material-free graybox GLBs had no normals for the lab's lit materials. Missing normals are now generated once after loading, restoring the intended tile colors, material response and contrast for all six Planar glyphs.
- A clean `npm ci` installed 16 packages from the committed lockfile and reported zero vulnerabilities. **Eleven Node tests passed**, including UV and stale-coordinate transition contracts, and the Vite 8.3.4 production build completed successfully.
- The supplied GLBs were inspected using trimesh; board/rack/rail names and boundaries were verified at a static level.

## Completed live browser validation

- Assemble and Planar both loaded their real GLBs in desktop Chromium WebGL2 with one live canvas and no console errors.
- Assemble's photographic fixture was visually checked at desktop and 390×844: all 25 cells form one upright image with NW/NE/SW/SE corner markers and the orientation text in the bottom row.
- All six Planar glyph regions were visually checked at desktop and 390×844. Runtime normals make the colored tile bodies visible, including adequate contrast for the dark sun and clay glyphs.
- Twenty Planar resets, ten quality changes, ten lighting changes and five additional High→Low cycles completed without errors. The low-tier texture count plateaued rather than growing across the second cycle.
- Ten 2D→WebGL renderer restarts completed with exactly one canvas; final diagnostics returned to one uploaded texture in Planar Low.
- A real `WEBGL_lose_context` event switched to the safe 2D renderer, disabled the loss control, retained one canvas, and successfully restarted WebGL2.
- The 390×844 browser viewport had no horizontal document overflow. Physical touch behavior remains a device gate.

## Validation not achieved in this environment

- **No physical-device measurements**: no Android or iOS GPU, input-latency, thermal, battery or memory certification has been run.
- **No production game-engine parity**: the laboratory's local demo state cannot substitute for actual Assemble or Planar rules, scoring or authority.

## Required Codex/engineering verification

1. Inspect `renderer.info` after warmup; record frame p95, draw calls, triangles and textures on physical budget Android, midrange Android and iOS Safari devices.
2. Check physical keyboard/touch controls, glyph distinguishability, reduced motion, thermals, battery and memory over the agreed duration.
3. Repeat the clean install, tests and production build in CI.
4. Do not merge this laboratory into production gameplay until art, accessibility, performance, secrecy and Phase 0 gates are met.

## Source integrity and repository safety

This pass modifies **only the isolated renderer-lab source/tests and this report**, and is proposed as a draft pull request into the Pass 08 lab branch. No runtime Jigsawverse production import, DB migration, ranked move handler, authoritative state contract, or theme release flag has been added.

Further optimization (instancing, texture memory, animation replay parity and renderer cleanup on incomplete GLB loads) remains follow-up work after the physical-device measurements.
