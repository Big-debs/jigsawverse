# Jigsawverse 3D phased implementation plan

**Status:** proposed for architecture review  
**Planning assumption:** six two-week implementation sprints (about 12 weeks), with progression determined by exit gates rather than dates.

## Outcome

Ship **The Living Atlas / Atlas Workshop** as a shared, accessible 3D presentation for Assemble and solo Planar, while retaining a fully playable 2D fallback.  Competitive Assemble must move to server-authoritative commands before it is exposed as ranked play. Planar multiplayer is not in this release scope.

## Delivery principles

- React remains responsible for navigation, score, timer, settings, results and accessible controls.
- Each gameplay viewport has exactly one renderer: Three.js *or* the existing 2D implementation; never stack Three.js behind Phaser.
- Game rules, rack capacity (initially 10), score/reveal behavior and Planar v1 mechanics are frozen through this programme.
- 3D is progressively enhanced. Unsupported, constrained and failed-WebGL devices receive the equivalent 2D game.
- Client submissions are player intents, not replacement board state, scores or timers.
- Theme assets are versioned data; adding a theme must not fork gameplay or rendering logic.

## Milestones and phase plan

| Phase | Target window | Objective | Deliverables | Exit gate |
| --- | --- | --- | --- | --- |
| 0. Architecture review | Week 0 | Approve scope and irreversible decisions | Decision record covering renderer, first theme, ranked reveal policy, authority model, device budgets, fallback and rollout | Product and engineering owners approve; deployed SHA/database baseline is recorded |
| 1. Rules and authority foundations | Weeks 1–2 | Make game logic reproducible and secure for competitive Assemble | Pure rules/transition boundaries; canonical versioned match state; command and snapshot contracts; authoritative server transaction; private per-viewer projections; server deadlines; test/CI baseline | Rules parity passes; stale, duplicate, unauthorised and concurrent commands are rejected; migration rollback documented |
| 2. Shared 3D platform and art graybox | Weeks 3–4 | Prove the renderer and theme contract on real devices | Lazy Three.js host; capability/quality selection; orthographic board camera; 2D fallback selector; Atlas graybox kit; asset registry and validation; telemetry shell | Assemble and Planar mount through one theme contract; exactly one active renderer; low-tier device budget passes |
| 3. Assemble vertical slice | Weeks 5–6 | Deliver complete Atlas Assemble presentation | Shared puzzle texture with UV-mapped pieces; rack/board interaction; picking; marks, hints, revealed states and results; texture lifecycle; audio service; solo plus multiplayer adapters | Existing rules match in 2D/3D; reconnect and resource-lifecycle suites pass; unrevealed correctness has no visual, audio or telemetry leak |
| 4. Planar vertical slice | Weeks 7–8 | Deliver solo Planar in the same world | Pure deterministic turn trace; row/column rail controls; wrap and cascade choreography; clipping; keyboard/reduced-motion controls; reset/background safety | Seam/full-line behavior and v1 mechanics preserved; trace-replay parity passes; no tile-swapping interaction appears |
| 5. Reuse proof and hardening | Weeks 9–10 | Verify theming, performance and operational readiness | River Courtyard as a data/asset-only theme; performance and thermal passes; caching/context-loss recovery; 500-player staging load; pilot usability sessions | Second theme requires no engine fork; device gates and 500-player test pass; operational runbook complete |
| 6. Controlled release | Weeks 11–12+ | Safely expose the completed experience | Feature flags, dashboards, support scripts, rollback rehearsal and staged cohorts: internal → invited → 10% → 50% → general availability | Metrics reviewed, no launch blockers, renderer and protocol recovery paths exercised; ranked play only when authority gates remain green |

## Workstream ownership

| Workstream | Primary owner | Key responsibilities |
| --- | --- | --- |
| Product and release | Product owner | Scope freeze, reveal policy, cohort decisions, launch/rollback authority |
| Gameplay/frontend | Frontend/game engineer | Pure engine boundaries, renderer adapters, input parity, accessibility and 2D fallback |
| Authority/services | Backend engineer | Command transaction, RLS/RPC, projections, recovery, timed finalization and load tests |
| World/technical art | Technical artist with art lead | Atlas/River kits, LODs, material budgets, asset registry, cultural/rights ledger and validators |
| Quality | QA | Device matrix, screenshots, reconnection/concurrency suites, thermal tests and release gates |
| Cultural review | Named reviewer(s) | Review documented references and permissions before assets are approved |

## First implementation tickets

1. **Baseline and contract spike:** identify the production revision and database schema; record feature-flag defaults and the target-device matrix.
2. **Canonical match state:** define a versioned state schema covering board, racks/pool, scores, reveal state, marks, ownership, pending decisions, result status, PRNG where applicable and revision.
3. **Authoritative command path:** implement idempotent `(game_id, command_id)` processing with locking/compare-and-swap, authenticated actor derivation, server deadline checks and sanitized per-viewer snapshots.
4. **Parity harness:** replay the same command trace against legacy 2D and extracted logical engines; cover image orientation, resize/zoom picking and Planar cascades.
5. **Atlas renderer laboratory:** add a lazily loaded Three.js host, orthographic camera, failure fallback and procedural tiles before commissioning finished art.
6. **Theme manifest and validator:** define asset IDs, versions, quality variants, hashes, licenses, rights/cultural-review metadata and fallback assets.

## Dependencies and sequencing

```text
Phase 0 approval
    ├── Phase 1 authority + parity contracts ── required before ranked Assemble
    └── Phase 2 renderer graybox ────────────── may start after contracts are approved
            ├── Phase 3 Assemble 3D
            └── Phase 4 Planar 3D
                    └── Phase 5 hardening + reuse proof
                            └── Phase 6 staged rollout
```

Finished art production can begin after the Phase 2 graybox validates readability and budgets. It should not precede that validation. Phases 3 and 4 share the renderer host and theme kit, but each requires its own parity exit gate.

## Required acceptance checks

- **Logic:** placement/score/reveal parity, stable IDs, Planar wraps/cascades/reshuffles, cancellation and terminal states.
- **Security and recovery:** unauthorised, stale and duplicate commands; simultaneous-cell conflicts; wrong-rack actions; deadline enforcement; reconnect snapshot race and missing-event recovery.
- **Rendering:** one active renderer, correct image orientation, resize/zoom picking, WebGL loss/error fallback and texture/listener cleanup across 20 resets and 10 theme switches.
- **Accessibility:** keyboard controls, visible focus, 44px essential targets, shape/glyph distinctions beyond color, reduced motion and concise settled-state announcements.
- **Performance:** measured ready time, frame percentiles, draw calls, memory, thermal behavior and asset failures on agreed physical low/mid/high devices.
- **Scale:** staged test of 500 concurrent players in 250 Assemble rooms with p95 acknowledgement at or below 750 ms, no duplicate finalization, impossible placement or cross-room data exposure.

## Flags and rollback

Keep these flags independent: `renderer3dAssemble`, `renderer3dPlanar`, `themeAtlas`, `themeRiver`, and `authoritativeMultiplayerV2`.

Renderer rollback can immediately return a compatible match to 2D using its versioned snapshot. Protocol rollback is different: an in-progress authoritative match must not fall back to legacy client-authored state. Introduce schema changes additively, isolate old/new protocol matches, rehearse restore procedures, and name the owner for each kill switch before cohort rollout.

## Decisions required before Phase 1

1. Is ranked reveal behavior UI-only, or must scores/solutions/racks be server-private per viewer?
2. Which physical devices define low, mid and high quality tiers, and what measured budget applies to each?
3. Which deployed revision and live Supabase migrations are the baseline?
4. Who approves cultural references, asset rights and the pilot audience plan?
5. What minimum client-version policy applies once authoritative multiplayer begins?

