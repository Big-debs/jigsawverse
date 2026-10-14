# The Living Atlas — Design and engineering asset handoff (Passes 01–06)

**For:** Big-debs/jigsawverse; art directors, technical artists and Codex.
**Status:** Development references and procedure grayboxes, *not* approved production assets.

## Scope

Included: **Jigsawverse Assemble** and **Jigsawverse Planar** only. The separate **Planar-Cube educational trainer is out of scope**. Shared Living Atlas universe / Atlas Workshop environment; mode-specific playable boards.

## Directory guide

- `art/concepts/`: Original cinematic images by pass, plus two earlier tournament-poster references. AI-created concept images are visual inspiration; **never trace cell counts or dimensions from them**.
- `art/modeling/pass-05/`: Modeling specification and exact schematic.
- `art/modeling/pass-06/plates/`: Dimensioned orthographic/exploded engineering plates.
- `art/modeling/pass-06/glb/`: Eight importable neutral GLB reference meshes, as sourced.
- `art/modeling/pass-06/glyphs/`: SVG/PNG provisional Planar kind glyphs.
- `art/modeling/pass-06/manifest/`: Pass 06 graybox contract.
- `docs/source/`: Work architecture specification and Codex sprint plan.
- `docs/`: Handoff decisions and status.
- `assets-manifest.json`: SHA256, dimension, origin and approval status for every bundled file.

## Production-critical facts

- **Assemble:** square image tiles; 5x5 *fixture* is one example, game supports other existing grids; current 10-piece rack remains a *ruleset capacity*; no interlocking-piece gameplay.
- **Planar:** fixed 6x6 / 36 cells / six kinds in V1; whole row/column moves by one cell with wrapping, cascades and gravity; individual tile swaps are prohibited. 24 possible directions need **not** become 24 small buttons.
- **Coordinates:** glTF Y-up, board XZ; center `(col+.5-cols/2, row+.5-rows/2)`; tile 0.92x0.92x0.10 with bottom-center pivot.
- **Rendering:** Three.js enhancement with playable Phaser Assemble and DOM Planar fallback, only one active renderer. Do not import both engines at first load.
- **Data:** Drawing effects do not decide scoring or reveal correctness; ranked Assemble requires server-authoritative state and confidentiality.

## Safe handoff to Codex

1. Read `docs/source/Work_3D_Architecture_Specification.md` and `docs/source/Codex_3D_Phased_Implementation_Plan.md`.
2. Read Pass 05 and Pass 06 markdown briefs.
3. Inspect `assets-manifest.json` and verify file checksums; reject altered/missing files.
4. Import GLBs in Blender or inspect them with a glTF validator; compare against Pass 06 plates.
5. Do not mistake generated art images for measurements; do not assume GLBs have PBR textures, UV-mapped image surfaces, real LODs or performance benchmarks.
6. Perform only review/graybox integration on an approved development branch. Production assets, gameplay refactors and database changes remain gated on the architecture decision record and Phase 0 approvals.

## Provenance and rights

Images in `art/concepts/` were AI-generated during the Jigsawverse design discussion. The source docs were supplied by the user; the GLBs, plates and glyphs are design-development artifacts from Pass 06. No external third-party art licenses are established here; do not ship any reference image or symbolism as production art without a rights, cultural-use and content review.
