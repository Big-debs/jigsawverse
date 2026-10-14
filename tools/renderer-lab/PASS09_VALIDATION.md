# Living Atlas — Pass 09 Renderer Validation Report

**Status:** Partially validated; GPU and physical-device gates remain **OPEN**.
**Scope:** Isolated `tools/renderer-lab/` only. The Jigsawverse production renderer, game rules, multiplayer state, CAESAR telemetry and separate Planar-Cube trainer remain unchanged.
**Baseline:** Pass 08 draft PR #53; this Pass 09 branch is deliberately stacked on that branch after subsequent commits were observed.

## Completed static and deterministic checks

- The provided Pass 08 source package was inspected. All three referenced glTF binary files parse as glTF 2.0, with real measured bounds: tile 0.92 × 0.10 × 0.92; Assemble board/rack approximately 5.5 × 0.405 × 7.90; Planar lattice approximately 7.04 × 0.395 × 7.04.
- Static validation detected duplicate Assemble tiles when the UV proof was enabled; UV-proof mode now omits rack pieces while displaying the full 25-fragment image.
- Repeated graphics quality changes previously accumulated an untracked transparent picking material. The renderer now tracks and disposes it on scene rebuild.
- High quality previously toggled WebGL shadow rendering without enabling the directional light to cast shadows. Light casting and the bounded shadow camera are now configured together.
- UV rectangle coordinates were extracted into a small pure contract module with tests for top-left/bottom-right Assemble image fragments and all six Planar atlas regions.
- WebGL2 capability probing now releases the temporary probe context. The context-loss path increments the mount token before activating fallback; stale mounting work is also checked against the currently active scene.
- Against the provided Pass 08 snapshot, **nine Node tests passed** (the original seven plus two new UV tests), and JavaScript syntax checks passed.
- The supplied GLBs were inspected using trimesh; board/rack/rail names and boundaries were verified at a static level.

## Validation not achieved in this environment

- **No clean `npm install` or Vite build**: the package registry was unavailable by DNS. This is an environment limitation, not a completed build gate. The live PR branch may have newer package versions and lockfile than the provided Pass 08 ZIP; verify it with a clean CI install rather than trusting snapshot results.
- **No working browser screenshot of the Three.js renderer**: Chromium navigation was blocked by administrator policy even for local pages. WebGL2/GPU texture orientation, normal/ORM channels, shader behavior, WebGL loss recovery and interaction raycasting remain unverified.
- **No physical-device measurements**: no Android or iOS GPU, input-latency, thermal, battery or memory certification has been run.
- **No production game-engine parity**: the laboratory's local demo state cannot substitute for actual Assemble or Planar rules, scoring or authority.

## Required Codex/engineering verification

1. On a clean checkout of this branch, run `cd tools/renderer-lab && npm ci && npm test && npm run build`. Investigate any lockfile incompatibilities.
2. On a network-enabled Vite development server, confirm that Assemble, Planar, and every quality/lighting selection remain in a single live WebGL scene.
3. Screenshot at desktop and 390×844; confirm the *actual* Assemble image appears right way up at all 25 UV cells and Planar's six glyph regions match their IDs.
4. Force 2D, simulate WebGL context loss, repeatedly switch modes and quality (at least 20 resets and 10 theme/quality changes); look for stale canvases, picking blockers, resource growth and unhandled promise races.
5. Inspect `renderer.info` after warmup; record frame p95, draw calls, triangles and textures on physical budget Android, midrange Android and iOS Safari devices.
6. Check keyboard/touch controls, responsive sizing, glyph distinguishability and reduced motion.
7. Do not merge this laboratory into production gameplay until art, accessibility, performance, secrecy and Phase 0 gates are met.

## Source integrity and repository safety

This pass modifies **only the isolated renderer-lab source/tests and this report**, and is proposed as a draft pull request into the Pass 08 lab branch. No runtime Jigsawverse production import, DB migration, ranked move handler, authoritative state contract, or theme release flag has been added.

Further optimization (instancing, texture memory, animation replay parity and renderer cleanup on incomplete GLB loads) requires the missing real-browser validation step.
