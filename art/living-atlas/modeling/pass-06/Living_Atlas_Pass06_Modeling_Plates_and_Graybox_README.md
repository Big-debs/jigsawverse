# Jigsawverse — The Living Atlas | Pass 06: Asset Engineering and Modeling Plates

**Status:** Design-development graybox, not production-ready assets. **No gameplay code, databases, or repository files were modified.**

## What is included

- `Plate_A_Assemble_Orthographic.png`: mechanically exact 5×5 top view, 10-slot two-row rack, GLB-derived isometric graybox.
- `Plate_B_Planar_Orthographic.png`: 6×6 top view (36 tiles), four physical rail-channel modules, 24 **possible commands**, source-derived isometric graybox.
- `Plate_C_Shared_Tile_and_Modules.png`: tile top/front/side, bevel profile, reusable module conventions and pivot.
- `Plate_D_Exploded_Asset_Assemblies.png`: schematic of reusable component layering and illustration-only exploded offsets.
- `planar_six_kinds_glyphs.svg` (and PNG): six **original provisional glyph concepts**. Actual production review should validate shape/color distinctiveness at phone scale.
- Importable neutral `*.glb` grayboxes: beveled tile, frame components, Assemble/Planar assemblies, rail channel.
- `graybox_manifest.json`: dimensions and source conventions.

## Dimensions and coordinate contract

| Parameter | Value |
|---|---|
| Authoring/runtime units | 1 unit = 1 gameplay cell on X/Z; glTF Y-up |
| Board origin | Geometric center (X=0, Z=0) |
| Cell center | `x = col + 0.5 - cols/2`, `z = row + 0.5 - rows/2` |
| Row and column direction | Increasing rows +Z; increasing cols +X |
| Tile | 0.92 × 0.92 × 0.10 units; bevel 0.035 |
| Tile pivot | Bottom center, at `(0,0,0)` prior to placement |
| Assemble test board | 5×5; architecture scales to other supported grid sizes |
| Assemble rack | Fixed game capacity of 10; 2×5 **presentation** in these plates |
| Planar test board | 6×6; six distinct kind IDs |
| Planar rails | Four border channels; actions may use accessible DOM controls instead of 24 physical arrows |

## Exploded assembly instructions (Blender)

1. Import `tile_beveled.glb` and inspect top/front/side and pivot. Separate the image top into a UV-sampled quad and reuse the neutral beveled body across both families.
2. Import `shared_board_5x5.glb`. The board has independent support, playfield, separators, edge modules and corner nodes. Verify consistent frame top and cell-floor heights.
3. Import `assemble_5x5_with_rack_graybox.glb`. The ten rack tiles are **visual fixtures**, not actual gameplay identities. The rack is a separate, independently resizable module.
4. Import `planar_6x6_with_rails_graybox.glb`. Six kind colors are placeholders; no game outcome or cascade is implied by this arrangement. Install original vector glyphs by kind ID and maintain stable tile IDs.
5. For exploded illustrations, animate/model separate offsets in Blender: `tile top +Y`, `tile body +Y`, `playfield 0`, `support −Y`, `edges ±X/±Z`, `corners diagonal`, `rack +Z`, and `rail modules ±X/±Z`. **Keep source origins fixed**; offsets are only illustration transforms.
6. Apply scale and rotation in Blender and export glTF Y-up. Verify reimport orientation, bounds, normals, UVs, GLB/glyph license records, and per-tier budgets.

## Mechanical limitations and corrections

- The dramatic Pass 01–05 pictures are **art-direction references only**, not dimensioned mesh sources.
- Although the Planar reference grid shows 24 direction arrows, **do not force 24 small tap targets on mobile**. Prefer selecting a line and using two 44 CSS px directional controls; test on physical 390×844 devices.
- The grayboxes have **no image UV mapping**, no final PBR textures, no shader instancing, no animation, no authored LODs, and no GPU benchmarks. Those are subsequent production tasks.
- Assemble's 10-piece rack is a ruleset capacity, not a responsive layout constant. Do not change it based on viewport width.
- Planar shift/wrap/refill must use the deterministic rules trace; this graybox is not a simulation.
- Collision, snapping, scoring, multiplayer permissions, hints and tournament data remain in the game/domain layers.

## Pass 06 review gate

- [ ] Art director approves shared tile silhouette and frame geometry.
- [ ] Game engineer signs off exact 5×5, 6×6 and rack/rail contract.
- [ ] Designer tests 390×844 board sizing, focused rail controls and access targets.
- [ ] Technical artist imports all GLBs into Blender and verifies Y-up, bottom-center pivots and visual orientation.
- [ ] Six glyphs pass shape/color distinction and cultural-reference review.
- [ ] Device profiling confirms initial geometry budgets before producing full textures/LOD assets.

**Next pass (07):** Textured material look-development with low/medium/high quality variants, calibrated gameplay lighting, image texture/UV proof, mobile readability comparisons, and a first proper asset-manifest validator. Full production modeling remains gated on review.
