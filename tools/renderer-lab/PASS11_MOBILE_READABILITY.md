# Living Atlas — Pass 11: Mobile Readability and Visual Integration

**Status:** Current-branch desktop WebGL2 validation is in progress. A 320px horizontal-overflow defect and physical-device acceptance remain **OPEN**.

**Scope:** Jigsawverse Assemble and Jigsawverse Planar, inside the same Atlas Workshop. Standalone Planar-Cube excluded.

## Changes

1. **Mobile controls follow the game:** The existing Assemble selection/reset and Planar line-shift controls are moved beneath the stage when width <=720 CSS px, rather than buried after graphics settings. On desktop, those same DOM controls remain in the sidebar; event handlers and game state are unchanged.
2. **Responsive play-stage CSS:** Reduced excessively tall phone stage, kept a minimum board area and supplied touch targets of at least 48px for gameplay controls. Small hint overlay and compact stage status have been adjusted.
3. **Testable camera-fit contract:** `src/mobileLayout.js` computes orthographic world width/height and CSS pixel sizes from mode and stage dimensions. Both views retain their original safe framing. `src/threeScene.js` consumes this calculation.
4. **Glyph readability telemetry:** the diagnostics panel reports Planar glyph CSS-pixel size; thresholds are design *review triggers* rather than accessibility certification. The current estimate indicates narrow widths may fall below the proposed 32px glyph-size review threshold.
5. **Focused tests:** `tests/mobile-layout.test.mjs` verifies portrait camera coverage, narrow viewport warning, compact landscape behavior and invalid input handling.

## Tests

- **Pass 11 pure-contract tests:** 4/4 passed in Node 22 staging environment.
- A clean install from the committed lockfile reported zero vulnerabilities. All **19 tests**, JavaScript syntax checks and the Vite 8.3.4 production build passed.
- Real Chromium WebGL2 checks exercised 390x844, 320x568, 844x390 and 1280x800 viewport overrides. The mobile action panel moved beneath the stage, Planar interaction state survived resize and WebGL2/Canvas2D switching retained one canvas.
- Visible mobile game controls measured 48 CSS px high. Planar glyph diagnostics reported 30.3px at 390x844, 25.5px at 320x568, 20.6px at 844x390 and 47.3px at 1280x800.
- The 320x568 check exposed horizontal document overflow: the existing 320px body minimum exceeds the 305px client area after the desktop browser scrollbar is reserved. This must be corrected and retested.
- GitHub source changes have been confined to `tools/renderer-lab`; nothing in the root app, rules, Supabase, multiplayer or CAESAR telemetry was modified.
- Existing Pass 10 desktop WebGL and iPhone 13 reports do not automatically validate these new CSS/camera changes. Pass 11 physical-phone performance and readability remain untested.

## Submitted browser-session samples

| Timestamp | Platform / browser | Family / presentation | Viewport | Renderer sample |
| --- | --- | --- | --- | --- |
| 2026-10-15T00:10:06.067Z | Windows 10 x64 / Chrome 153.0.0.0 | Assemble; High; Golden Hour; Workshop | 862x546 | WebGL2 / Three.js; 16.9ms frame p95; 174 draw calls; 1,850 triangles; 14 textures; 28 Workshop props |
| 2026-10-15T00:13:28.383Z | Reported Pixel 10 / Android 16 / Chrome 153.0.0.0 | Planar; High; Golden Hour; Workshop | 378x366 | WebGL2 / Three.js; 17.1ms frame p95; 188 draw calls; 2,224 triangles; 15 textures; 28 Workshop props; 31.4px glyphs |

The submitted reports are browser-session samples, not physical-device certification. Assemble has no Planar glyph value by design. The Android user agent does not distinguish physical hardware from browser emulation, and the submitted report did not include duration, battery, heat, stutter or touch observations. Its 31.4px Planar glyph estimate is below the proposed 32px review threshold and therefore keeps the readability review open.

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
