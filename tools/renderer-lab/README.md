# Pass 08 — Living Atlas Renderer Laboratory

**Status:** Interactive, stand-alone *experimental renderer*. Not shipped as Jigsawverse gameplay, not certified on physical devices, and not production art sign-off.

This technical laboratory renders **Assemble** and **Jigsawverse Planar** in a shared Afrofuturistic material language. The **separate Planar-Cube educational trainer is entirely excluded**. It imports the original Pass 06 GLB grayboxes and Pass 07 candidate materials, fixture image, glyph atlas and lighting presets **by path from the repository asset library**. The main application is unaffected.

## Launch locally (from the repository)

```bash
cd tools/renderer-lab
npm ci
npm run dev
```

Open the local Vite URL printed in the terminal. To create a static dist for isolated review:

```bash
npm run build
npm run preview
```

To run deterministic tests and asset-contract checks:

```bash
npm test
```

> The laboratory has its **own** `package.json` and reviewed lockfile. It does not modify the root `package.json` or register any new production route. Use Node 20.19 or newer and `npm ci` for a reproducible install.

## What the lab actually does

- **One active renderer:** a single `THREE.WebGLRenderer` or a canvas 2D fallback; it never overlays Phaser and Three.js.
- **Assemble:** imports real 5×5 board/rack and shared beveled tile GLBs. Builds tile tops with per-piece **UV coordinates sampling one asymmetric reference image texture**, unlit and not tone-mapped. A local ten-piece fixture supports select-a-tile / click-an-empty-cell demos; these are *not* real placements or hints.
- **Planar:** imports real 6×6 GLB, omits its old illustrative placeholder tiles, renders 36 persistent tile IDs in six known kind colors/shapes. Demo controls shift one row/column by one cell and wrap the edge; they do **not** implement matching, clearing, scoring, refilling or the existing Planar rules engine.
- **Quality:** Low (colors), Medium (base-color + ORM), High (normal-map candidate and optional shadow setting). Uses Pass 07 2×2 material atlas cropped into individual CanvasTextures.
- **Lighting:** daylight for actual game focus, golden hour and night as *menu/scene reference previews*, never evidence that ranked play can use these freely.
- **2D fallback:** drawable reference with the same logical demo fixtures, independent of WebGL availability or loading failures. On WebGL context loss, the view is safely replaced by 2D, not stacked.
- **Diagnostics:** read-only WebGL draw calls, triangles, texture count and rolling frame p95 during the local session; copy a JSON report. These are **not** FPS guarantees.
- **Fixed orthographic camera:** boards on XZ with row increasing +Z and column +X; no orbit controls during active board previews.

## Controls

1. Choose **Assemble** or **Planar**. No session, game, or ruleset is altered.
2. Choose automatic Three.js or force 2D fallback.
3. Switch Low / Medium / High quality and daylight/golden-hour/night lighting.
4. Assemble: select a rack tile then an empty cell; toggle **UV corner proof** to view all 25 original image fragments correctly oriented. The fixture shows neutral interactions only.
5. Planar: choose row/column and line index (1–6); shift −1 or +1. Wrap is a visual demonstration, **not** cascade/replay parity.
6. Copy a technical report and verify which rendering adapter is actually active. The lab-only **Test context loss** control exercises the real `WEBGL_lose_context` path when the browser exposes it.

## Asset dependencies

All asset URLs come directly from `art/living-atlas/` — no duplicated source GLB or texture files. Starting point:

- `art/living-atlas/modeling/pass-06/glb/assemble_5x5_with_rack_graybox.glb`
- `art/living-atlas/modeling/pass-06/glb/planar_6x6_with_rails_graybox.glb`
- `art/living-atlas/modeling/pass-06/glb/tile_beveled.glb`
- `art/living-atlas/lookdev/pass-07/textures/atlas_{basecolor,normal,orm}.png`
- `art/living-atlas/lookdev/pass-07/glyphs/planar_glyph_atlas.png`
- `art/living-atlas/lookdev/pass-07/fixtures/assemble_uv_reference.png`
- `art/living-atlas/lookdev/pass-07/{lighting/lighting-presets.json,textures/material-presets.json}`

## Review / validation matrix

| Check | Current result | Gate before any production integration |
| --- | --- | --- |
| Existing original GLB metadata and dimensions | Passed static parser and real browser GLB load | Inspect actual meshes in Blender |
| Deterministic Assemble demo: 25 cells, ten-piece rack | Passed unit tests | Gameplay rules parity against `GameLogic` |
| Deterministic Planar demo: 36 cells, stable IDs, shift/wrap | Passed unit tests | Deterministic trace/cascade parity against actual Planar engine |
| CPU Assemble source image reconstruction (Pass 07) | Already passed static fixture proof | Confirm GPU correct UV top/bottom corners, no color shift, mip bleed |
| Loader, Three.js package install, Vite dist | Passed with locked Vite 8.3.4; clean audit, tests and build | Repeat with `npm ci` in CI |
| Real browser WebGL2, context loss and fallback | Passed in desktop Chromium; one canvas before and after fallback/recovery | Chrome Android and Safari iOS QA |
| 390×844 layout and glyph readability | Passed emulated viewport with no horizontal overflow | Physical-device touch and accessibility observation |
| 15-minute thermals / FPS / memory budgets | Not tested | Physical-device load and resource-lifecycle gates |

## Architectural limitations to address next

- This uses individual mesh instances for visual clarity, **not** final `InstancedMesh`/UV-shader batching. Implement and measure batching for 15×15 Assemble after preserving shared-image orientation.
- One canvas/normal/ORM texture per material candidate is a practical look-development technique. Assess texture atlasing and KTX2 only after profiling. CanvasTextures currently use the saved atlas's top-left convention and need GPU comparison.
- It intentionally renders a board-centric material studio, **not** a finished Atlas Workshop city, tournament lobby or avatar system. 3D environment expansion awaits art direction and performance approval.
- Local demo actions have **no** authority, anti-cheat, persistence, score reveal or CAESAR measurement. Do not repurpose them as match commands.
- A fully playable production 2D fallback remains the existing Phaser/DOM game; the lab's own canvas 2D fallback is a **visual reference**, not a replacement game engine.

## Safety

No edits to `src/`, `supabase/`, production routing, gameplay scoring, game rules, database migrations, match clients, theme activation or production environment. Keep this isolated until Phase 0 architecture/security gates and renderer performance acceptance are complete.
