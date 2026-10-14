# Jigsawverse — The Living Atlas
## Pass 05: 3D Modeling and Asset Production Brief

**Status:** Design-development handoff; not yet a signed-off production art bible.  
**Games:** Jigsawverse Assemble + Jigsawverse Planar.  
**Excluded:** The standalone Planar-Cube educational trainer.  
**Change control:** No gameplay code, game rules, multiplayer protocol, or production configuration changes are authorized by this document.

## 1. Creative intention

**One world; two physical instruments.** Atlas Workshop is a civic workshop in an imagined African future, combining practical shade and greenery with crafted stone, clay, woven fabric, satin brass, indigo, and restrained teal lighting. The shared board frame should look designed by one maker culture. The playable mechanisms are not identical: Assemble reconstructs an image from square tiles; Planar shifts entire rows and columns of a fixed symbolic lattice.

**Visual hierarchy:** 1) puzzle content and action affordances; 2) board and rack/rails; 3) HUD and accessibility cues; 4) architecture and atmospheric setting. On low-tier mobile, environment decoration can reduce to a static poster, while gameplay remains intact.

## 2. World space, scale and pivots

| Setting | Production convention |
| --- | --- |
| Coordinate space | glTF Y-up; gameplay surface is the XZ plane |
| Cell size | 1.0 runtime world unit on X and Z |
| Row axis | Increasing row maps to +Z |
| Column axis | Increasing column maps to +X |
| Cell center | `x = (col + 0.5) - cols/2`, `z = (row + 0.5) - rows/2` |
| Tile mesh origin | Bottom-center, so vertical lifting changes Y only |
| Board origin | Geometric center at X=0, Z=0; support plate below tiles |
| Authored units | Blender metric metres; exporter verifies glTF orientation |
| Authored scale | Apply object scale/rotation prior to export; no hidden scale corrections |

These are *initial art/engineering conventions* and must be tested in the graybox, not assumed to describe existing code.

## 3. Assemble — square image-restoration instrument

- **Reference board:** 5×5 = 25 cells, with the same modular geometry scaling to all supported sizes in existing rules. The 5×5 is a visual test fixture, not a new mode restriction.
- **Current rack capacity:** 10 pieces. A rack scene can present a 2×5 arrangement or a scrollable/paginated alternative for phone size. Layout must not alter rack ownership or match capacity.
- **Tile:** square beveled body, width/depth `0.92 × 0.92` cell units, thickness `0.08–0.12`. Corners have small bevels to show depth but must not create interlocking jigsaw silhouettes.
- **Image surface:** one original image texture per puzzle, with independent stable per-piece UV rectangles and a neutral shared side material; no motif overlay over the photographic face.
- **Board:** 4 repeatable frame modules (edge, corner, base, separator) around recessed cells. Frame does not dictate puzzle dimensions.
- **Interaction visuals:** selection rim and ~0.08-unit lift; neutral accepted placement 120–180 ms; hints/marks are separate overlays. Avoid different sounds or effects for hidden correctness until authorized reveal.
- **Camera:** orthographic, board face legible; landscape may use very slight oblique treatment only after picking/readability checks. No free camera orbit in active gameplay.
- **Non-negotiable:** preserve existing scoring, reveal milestones, check/pass/Nexus flow, independent racks, and image orientation.

## 4. Planar — whole-line shifting lattice

- **Reference board:** 6×6 = 36 cells, as in the audited Planar v1, with six stable symbolic kinds.
- **Kind IDs:** `sun`, `river`, `seed`, `ember`, `indigo`, `clay`. Each type has a distinct symbol/silhouette in addition to color. Kind identity is logical data, never determined by rendered material.
- **Tile:** reuse the same core beveled body dimensions and pivot; different planar top/glyph treatment. Batch by six material/kind groups where practical.
- **Board:** same shared frame architecture; add two repeatable module families: rail channel and directional marker. Rails surround the active grid and remain outside cell hit regions.
- **Input semantics:** select a row or column, then command a single-cell shift in one of two directions. Do not permit one-tile swapping or dragging a single tile out of its row/column. Physical 24-arrow presentation is *not required*: on narrow phones use focused row/column selection plus two 44 CSS-pixel directional buttons.
- **Move choreography:** whole-line rigid shift, one logical tile wrapping across the seam, matched indices highlight, matched tiles clear, remaining tiles fall vertically, refill from above, then cascades. Animation must follow deterministic engine trace rather than physics collisions.
- **Baseline visual timing (subject to testing):** shift 240–280 ms; match emphasis 100–140 ms; clear 140–200 ms; collapse/refill 240–300 ms; settle 50–80 ms.
- **Non-negotiable:** current Planar v1 move budget and scoring; edge wrapping, seam matches, cascades and deterministic tile IDs.

## 5. Shared reusable asset kit

| Asset | Suggested ID | Initial variants / delivery |
| --- | --- | --- |
| Square tile body | `tile.beveled` | LOD0/LOD1/LOD2 GLB, shared across families |
| Board edge | `board.frame.edge` | Modular, brass/stone materials |
| Board corner | `board.frame.corner` | 90° rotational reuse |
| Board support plate | `board.frame.base` | Scales under arbitrary board dimensions |
| Cell separator | `board.frame.separator` | Instanced repeatable form |
| Assemble rack tray | `assemble.rack.tray` | One modular tray; capacity controlled by game |
| Planar rail channel | `planar.rail.channel` | One channel module, rotated for rows/columns |
| Planar direction marker | `planar.rail.arrow` | One symbol/direction module |
| Planar kind glyph atlas | `planar.kinds.v1` | Six clear 2D/3D-aligned glyph identities |
| Civic workshop kit | `atlas.civic.*` | Paving, wall, arch, canopy, planter, channel, plinth, light |
| Small decoration | `atlas.props.*` | Four props; removable on low tier |
| Lobby hero instrument | `atlas.instrument` | One optional hero asset, not required for game |
| Fallback background | `atlas.poster` | WebP fallback for Phaser/DOM and constrained devices |
| Audio cues | `atlas.audio.*` | Select, neutral place, shift, clear, cascade, hint, win, loss |

## 6. Style tokens and material finish

The architecture audit proposes this first color system, **not yet a licensed or contrast-certified finished palette**:

| Token | Hex | Intent |
| --- | --- | --- |
| `surface.deep` | `#111827` | Dark UI backing |
| `surface.indigo` | `#29264D` | Board surround |
| `text.primary` | `#FFF5DF` | Text / ivory |
| `text.secondary` | `#C7D2DF` | Supporting text |
| `material.brass` | `#D7AA55` | Satin trim, no mirror reflection |
| `material.clay` | `#BD7658` | Structural accents |
| `accent.energy` | `#4BDAC5` | Rails and focus indicators |
| `state.warning` | `#F4B860` | Warning + icon/text |
| `state.error` | `#EE806D` | Error + icon/text |

No aggressive bloom or refraction over gameplay cells. Bake environmental lighting where possible; game tiles should remain readable in day/night treatment and low graphics tier. Photographic puzzle surfaces should use calibrated unlit color so they are not altered by scene tone mapping.

## 7. LOD and performance budgets (proposals, not measurements)

| Tier | Scene draw calls | Submitted triangles | Estimated GPU resources | Target |
| --- | ---: | ---: | ---: | --- |
| Low | ≤60 | ≤60,000 | ≤64 MiB | 30 FPS sustained |
| Medium | ≤100 | ≤120,000 | ≤96 MiB | 60 FPS target |
| High | ≤150 | ≤220,000 | ≤128 MiB | 60 FPS target |

- Tile body geometry budget: ≤160 triangles per instance on low tier, ≤320 high tier.
- Typical world-module triangle budgets by LOD: ≤2,000 / 1,000 / 400 (high / mid / low) per visible module.
- Reuse meshes/materials; use instancing for repeated board, tile and decoration forms.
- Prefer one texture for Assemble's image fragments; glTF/GLB for mesh assets, KTX2 only after device testing, immutable hashed URLs.
- The low-tier environment must be replaceable by a flat poster and must not block the first playable board.
- Target a stable input response on tested phones; validate touch targets at actual 390×844 viewport, not only in desktop previews.

## 8. Lighting, cameras and quality

- **Play camera:** orthographic above the grid, board nearly front-facing; configurable crop/zoom to fit board + rack for Assemble, or board + rail controls for Planar.
- **Lobby / result camera:** perspective is allowed for cinematic framing, separate from the gameplay camera.
- **Light rig:** warm stationary key, cool fill, restrained teal emissive rail/focus light. No flickering light or correctness-dependent lighting before reveal.
- **Low tier:** baked/static world, no dynamic shadows, no postprocess, reduced particles.
- **Medium:** selected decor, static shadows, limited subtle effects.
- **High:** optional single directional shadow map and one restrained postprocess effect only after profiling.
- **Accessibility:** reduced motion, keyboard controls, text/shape distinction beyond color, meaningful focus cues, and 44 CSS pixel essential tap targets.

## 9. Export and acceptance workflow

1. Produce a neutral graybox from approved meshes for both game families.
2. Verify *actual* 5×5 / 6×6 counts, rack layout, rail accessibility and camera hit testing on a 390×844 phone.
3. Model shared beveled tile and four frame modules; validate top texture orientation and sampling.
4. Model 10-slot rack and two rail modules as independent mechanics-neutral assets.
5. Assign shared material presets and six Planar glyphs; export LODs and fallback art.
6. Run glTF validation, orientation/pivot checks, texture-license metadata, budget checks and screenshot comparisons.
7. Test 20 resets, 10 theme changes, WebGL context-loss recovery and 2D/3D parity in a test scene.
8. Promote to a versioned staging asset registry only after art, engineering, cultural-reference and QA review.

### Pass 05 sign-off requires

- [ ] Approved assembled and exploded views for each kit component
- [ ] Approved orthographic top/front/side drawings with dimensions
- [ ] Mechanically correct 5×5 Assemble and 6×6 Planar graybox
- [ ] Same board family readable on mobile portrait/landscape
- [ ] Verified six Planar glyphs by shape as well as color
- [ ] Tested low-quality visual fallback
- [ ] Licensing/reference ledger and asset naming/manifest conventions
- [ ] Benchmark results from physical target devices

**Next art deliverable:** Pass 06 modeling plates: shared tile orthographic views, modular frame joints, rack extrusion, rail mechanism, texture UV layout, and low/mid/high asset previews. These should be created from actual 3D source geometry rather than image generation alone.
