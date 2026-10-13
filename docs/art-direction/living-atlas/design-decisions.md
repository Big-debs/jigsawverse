# Design decisions and pass review history

## Approved direction (subject to Phase 0 verification gates)

- One Living Atlas shared universe; Atlas Workshop first; River Courtyard second reuse proof.
- Two **game families**: Assemble and Jigsawverse Planar. Planar-Cube trainer excluded.
- Preserve existing 2D gameplay and rules during visual implementation.
- Ranked Assemble requires server-private projection and server-authoritative commands; solo Planar initially.

## Pass progression

| Pass | Intent | Handoff status |
| --- | --- | --- |
| 00 | Original tournament aesthetic reference | Reference only |
| 01 | Living Atlas premise and world directions | Exploratory, not approved final art |
| 02 | Shared board visual grammar | Illustrations, mechanical cell counts not reliable |
| 03 | Assemble / Planar paired board treatments | Concept only |
| 04 | 390x844 mobile approach | Concept; verify tap targets and actual counts |
| 05 | Geometry contract, materials, orientation, rack and rails | Modeling specification |
| 06 | Source geometry GLBs, engineering plates, glyph concepts | Importable **graybox**; not production art |

## Remaining constraints

- Do not copy incorrect grids, piece silhouettes, arrow counts or rack layouts from illustrative images.
- Validate 390x844 touch UX with children/physical devices; use 44 CSS-pixel essential controls.
- Atlas Workshop visuals are provisional; real cultural motifs require provenance and review.
- No production shaders, photography UVs, texture compression, animations or device benchmarks were completed in Pass 06.
- Do not treat CAESAR exploratory gameplay telemetry as a scientifically validated cognitive assessment.

## Approval register

| Area | Status | Reviewer required |
| --- | --- | --- |
| Shared visual direction | Working direction accepted | Art director final approval |
| Mechanics freeze | Proposed and direction accepted | Product and game engineering |
| GLB dimensions | Packaged; individual assets need import QA | Technical artist |
| Planar glyph distinguishability | Provisional | Accessibility and cultural reviewer |
| 2D/3D parity | Not implemented | Game QA |
| Physical device performance | Not benchmarked | QA / mobile engineering |
| Production source SHA, Supabase RLS | Not verified by asset work | Release and security |
