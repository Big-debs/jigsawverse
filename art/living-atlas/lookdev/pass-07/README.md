# The Living Atlas — Pass 07: Materials, Lighting and Texture Development

**Status:** Concept-to-technical-artist look-development. **Not approved for production** and **not connected to gameplay**. Uses the existing Pass 06 geometry contract and the same six Planar kind IDs. The separate Planar-Cube trainer is excluded.

## Purpose

Turn the Atlas Workshop's proposed stone, clay, brass and indigo material language into testable *source files*, not merely inspirational posters. Supply compact candidate texture atlases, render quality profiles, provisional lighting specifications, an Assemble UV-orientation reference, and glyph legibility checks for Planar.

### What is actually provided

| Folder | Contents | What can be used now |
| --- | --- | --- |
| `textures/` | Candidate base-color / tangent-space-normal / ORM atlases, emissive inlay mask, presets | Technically inspectable bitmap maps with explicit atlas rectangles |
| `lighting/` | Three visual lighting presets | Numeric starting values for a renderer prototype, not calibrated light measurements |
| `glyphs/` | Transparent SVG + PNG 3×2 glyph atlas | Original, provisional kind-ID symbols for 2D and 3D trials |
| `fixtures/` | Assemble image, 5×5 reconstructed tile reference, CPU proof, normalized rects, glyph-size chart | Automated orientation/tiling reference; no browser renderer is claimed |
| `plates/` | Real bitmap material swatch, three-tier comparison, cinematic concept illustration | Look-development and product review only |
| `tools/` | Reproducible Python generator and static validator | Offline/regression tooling (Pillow, NumPy, CairoSVG for generator) |

## Shared material decisions

1. **Warm limestone** is the dominant structural board/courtyard surface: matte, coarse and not visually competing with the playfield.
2. **Satin brass** appears as minor frame trim and trophy accents; avoid mirror-like glare. Preview values `metalness ≈0.87`, `roughness ≈0.42`, to be reviewed under Three.js physically based lighting.
3. **Terracotta clay** introduces crafted warmth to the environment, not as an opaque overlay on puzzle images.
4. **Indigo stone** grounds UI-adjacent surfaces, providing a calm dark edge around imagery and colored glyphs.
5. **Energy teal** is a restricted emissive accent for focus and neutral rail activity. It must **never encode hidden placement correctness or score before authorized reveal**.
6. **Ivory** serves textual/shape contrast. Metallic and glossy effects are not applied to functional glyph strokes or photographic image faces.

### What the PBR maps contain

- `atlas_basecolor.png`: 512×512 sRGB; four 256×256 conceptual material tiles arranged 2×2.
- `atlas_normal.png`: 512×512 tangent-space-looking normal candidates encoded RGB; **requires orientation/normal-scale QA on the actual meshes**.
- `atlas_orm.png`: 512×512 linear RGB where **R = AO candidate**, **G = roughness**, **B = metalness**. In glTF, AO is normally a *separate texture slot* even when sharing image bytes. Verify channel routing and UV set before deployment.
- `inlay_emissive_mask.png`: 256×256 RGB conceptual decorative inlay mask, not a gameplay outcome indicator.

The maps are procedurally generated and **not physically calibrated PBR scans**. Their purpose is to validate material language and packaging. The atlas rects use a top-left image convention with an eight-pixel inset per quadrant; Three.js UV-origin handling needs a runtime proof.

## Quality-tier strategy

| Tier | Board | Material resources | Effects | Intended outcome |
| --- | --- | --- | --- | --- |
| Low 3D | Same geometry and mechanics | Flat colors; shape glyph atlas | No realtime shadow, no bloom; ≤16 cosmetic particles | Readability on constrained supported phones |
| Medium 3D | Same geometry and mechanics | Base-color plus roughness/metalness, glyph atlas | Baked/static illumination, no live shadows by default; ≤48 particles | Depth without decorative load |
| High 3D | Same geometry and mechanics | Base-color, roughness/metalness and normal; glyph atlas | Optional one directional shadow/one restrained post-effect **only after profiling**; ≤96 particles | Additional material depth on capable devices |

These are *proposed capabilities*, not FPS measurements. The parent architecture targets 30 FPS on baseline low-tier devices, 60 FPS on mid/high where feasible, and playable 2D fallback. Physical profiling remains a hard gate. A variant must never change puzzle rules, score, hint policy or movement input.

## Lighting behavior

- `daylight-gameplay`: fixed orthographic camera, neutral readable ambient fill, steady warm key, no flicker, no camera shake, **no mandatory postprocessing**.
- `golden-hour-menu`: richer atmosphere for menus and noninteractive scene composition.
- `night-tournament-menu`: cinematic lighting for tournament lobby/results **only**; active play must retain an approved high-contrast profile.
- Assemble image faces: image sampled at neutral white `baseColorFactor`, **unlit**, `toneMapped=false`, sRGB-aware. Decorative lighting can illuminate the frame and floor but not change image pixels.
- Planar six IDs: `sun`, `river`, `seed`, `ember`, `indigo`, `clay` with distinct glyphs. Selection/ownership cues require more than hue; glyphs remain readable with bloom disabled.

## Fidelity and accessibility proofs

- CPU 5×5 Assemble split/reassembly produced **pixel-exact** source/reconstruction parity. This proves source slicing coordinates on an asymmetric image fixture only; it **does not** demonstrate GPU UV orientation, image-upload behavior, mipmap gutters, 3D distortion, HDR tone-mapping or hidden-solution protection.
- Six Planar glyph designs tested in an illustrative `32/44/64`-pixel proof chart. The stated glyph/background contrast calculations are digital color-pair checks, **not** an accessibility audit of rendered antialiasing. User testing at 390×844 and shape-distinguishability review remain mandatory.
- Avoid the art-generated lookdev plate as a geometric source: its cell counts and symbol shapes are **illustrative**, not V1 mechanical reference. Pass 06 geometry plates define those facts.

## Acceptance before promoting Pass 07 into runtime assets

- [ ] Technical artist checks `glTF` coordinate, UV, tangent basis, shared tile-top image surface, material input color spaces and handedness in Blender and Three.js.
- [ ] Confirm the 5×5 CPU image fixture matches exactly in a browser GPU test, including four asymmetric corners, different source aspect ratios and more than one grid size.
- [ ] Validate Planar **6×6 / 36 cells / six kinds**, 18 move baseline and rail+wrap behavior against actual deterministic engine traces, not illustrative art.
- [ ] Test glyphs on 390×844 real phones and in grayscale/color-vision simulations with game UI focus controls.
- [ ] Compare low, medium and high on the agreed budget Android, midrange Android, older iOS Safari and desktop hardware for startup, sustained 15-minute frame percentile, asset bytes, thermal and memory.
- [ ] Conduct art, cultural provenance, rights/licensing and child-audience review before any production use.
- [ ] Stage any visual integration **behind separate renderer/theme feature flags**; no production code or database changes through this pass.

## How Codex should continue

1. Start from `art/living-atlas/README.md` and Pass 06 `graybox_manifest.json`; do not build on misdrawn conceptual grids.
2. Run `python art/living-atlas/lookdev/pass-07/tools/validate_pass07.py` in the project root (with Pillow available). It checks RGB/RGBA image dimensions, contracts, glyph color contrast, CPU UV metadata and generated asset checksums.
3. Test the 3D renderer in a **separate prototype branch**. Log exact production/library revisions, device/browser details and screenshots before accepting PBR materials.
4. Implement per-family presentations without modifying domain rules, authoritative server projections, secrecy or cognitive-event identities.
5. Record design sign-offs and physical-device results before promoting any Pass 07 file into a runtime theme manifest.

## Provenance

Pass 07 images and texture maps are original newly generated concept-development assets. The cinematic image is AI-rendered artwork. Code-generated texture candidates, glyphs and test fixtures have no external third-party art inputs. Original cultural symbols/landmarks require independent review if added later. The source photographs used inside prior cinematic mockups are *not* licensed puzzle datasets. No actual physical GPU benchmark, Blender bake or gameplay integration is claimed.
