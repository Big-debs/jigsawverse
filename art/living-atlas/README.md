# Living Atlas Art Asset Library — Passes 01–06

**Project:** Jigsawverse (Assemble + Jigsawverse Planar only).
**Status:** Visual references, mechanically verified design plates and source grayboxes; **none are approved production assets**.

## What's in this branch

- `art/living-atlas/concepts/`: 16 optimized WebP **review copies** of the original AI-created visual concepts, grouped by design pass (00–06). The full PNG masters are preserved separately in the handoff archive.
- `art/living-atlas/modeling/pass-05/`: geometry schematic + original modeling brief.
- `art/living-atlas/modeling/pass-06/glb/`: **the eight original GLB grayboxes**, byte-for-byte copies from the Pass 06 engineering package.
- `art/living-atlas/modeling/pass-06/plates/`: engineering plates as WebP review copies.
- `art/living-atlas/modeling/pass-06/glyphs/`: provisional original SVG/PNG glyphs.
- `art/living-atlas/modeling/pass-06/manifest/`: source graybox manifest.
- `docs/art-direction/living-atlas/source/`: Work's architecture audit and Codex's implementation plan as received.
- `docs/art-direction/living-atlas/`: original handoff README and pass status.
- `art/living-atlas/asset-registry.json`: paths, SHA256 checksums, previews and original-master references.

## Required reading before integration

Read `docs/art-direction/living-atlas/README.md`, the Work architecture specification and Codex phased plan. 
Keep **one** universe, two distinct game modes, and the standalone Planar-Cube educational trainer fully outside this scope.

### Caveats

- Cinematic images are *not* accurate CAD layouts and must not be used as truth for tile counts, SVG symbols, rail placement or input dimensions.
- The verified Pass 06 engineering plates and GLBs are modeling fixtures only; actual 3D image UVs, LODs, physical-device benchmarks, shaders and gameplay adapters are *not implemented*.
- Preserve the existing rules, including Assemble rack capacity of 10 and Planar v1 shifting full rows/columns.
- New materials or theme graphics must not leak correctness before authorized score reveal.
- Keep raw source visuals away from the production `public/assets` pipeline until art, cultural/rights and performance approval.

## Original masters

The full original PNG, GLB, SVG, modeling brief and specification collection is archived as **`Jigsawverse_Living_Atlas_Passes_01-06_Handoff.zip`** in the user's personal ChatGPT Library at `/Jigsawverse/Living-Atlas/`. The optimized previews committed here are **not** the original high-resolution PNG masters.

Codex should use the repo's self-contained GLBs, preview references and work specs, and request attachment of the archive when high-resolution originals are needed. This file is private Library material and is **not** a public URL fetchable by the repository.

**Scope controls:** documentation and assets only. No game code, live DB or deployment changes.
