# Living Atlas — Pass 11: Mobile Readability and Visual Integration

**Status:** Isolated laboratory changes committed; current-branch WebGL and device acceptance **OPEN**.

**Scope:** Jigsawverse Assemble and Jigsawverse Planar, inside the same Atlas Workshop. Standalone Planar-Cube excluded.

## Changes

1. **Mobile controls follow the game:** The existing Assemble selection/reset and Planar line-shift controls are moved beneath the stage when width <=720 CSS px, rather than buried after graphics settings. On desktop, those same DOM controls remain in the sidebar; event handlers and game state are unchanged.
2. **Responsive play-stage CSS:** Reduced excessively tall phone stage, kept a minimum board area and supplied touch targets of at least 48px for gameplay controls. Small hint overlay and compact stage status have been adjusted.
3. **Testable camera-fit contract:** `src/mobileLayout.js` computes orthographic world width/height and CSS pixel sizes from mode and stage dimensions. Both views retain their original safe framing. `src/threeScene.js` consumes this calculation.
4. **Glyph readability telemetry:** the diagnostics panel reports Planar glyph CSS-pixel size; thresholds are design *review triggers* rather than accessibility certification. The current estimate indicates narrow widths may fall below the proposed 32px glyph-size review threshold.
5. **Focused tests:** `tests/mobile-layout.test.mjs` verifies portrait camera coverage, narrow viewport warning, compact landscape behavior and invalid input handling.

## Tests

- **Pass 11 pure-contract tests:** 4/4 passed in Node 22 staging environment.
- GitHub source changes have been confined to `tools/renderer-lab`; nothing in the root app, rules, Supabase, multiplayer or CAESAR telemetry was modified.
- This turn could not obtain a current-branch clean npm install/build, Three.js browser screenshot or physical-phone performance run. Existing Pass 10 desktop WebGL and iPhone 13 reports do not automatically validate these new CSS/camera changes.

## Required validation before merge

1. Checkout Pass 11 branch; run `cd tools/renderer-lab && npm ci && npm test && npm run build`.
2. Visit 390x844 (portrait), 320x568 (small portrait), 844x390 (landscape), 1280x800 desktop. Verify no clipped rack, Planar rail or on-screen interaction control.
3. Switch family and viewport while a move is partially selected. Ensure moving `#actionPanel` between sidebar and beneath-stage slots does not duplicate handlers or lose selection.
4. Confirm Canvas2D fallback and WebGL2 report consistent mode state, with exactly one active canvas. Confirm camera aspect changes during resize do not crop the board.
5. Inspect Planar symbols in rendered pixels; if below readable size, consider a focused-control zoom or larger glyph art rather than changing the 6x6 ruleset. Distinguish kind IDs without color.
6. Compare Board Only against Low/Medium/High Workshop for both games, all three lighting presets, and reduced-motion setting.
7. Record actual frame p95, draw calls, memory, texture counts, input delay, battery and thermal observations on budget/midrange Android plus iOS Safari.
8. Request art director and gameplay accessibility approval. Preserve server-private tournament scores and guardian consent requirements as independent release gates.

**No production deployment. No gameplay changes. No competitive ranking implementation.**
