# ADR-0001: Jigsawverse 3D Phase 0 — Approved Direction and Open Gates

- **Date:** 2026-10-10
- **Status:** Direction approved by product owner; technical release authorization pending verification
- **Repository:** `Big-debs/jigsawverse`
- **Scope:** Assemble and Jigsawverse Planar only
- **Excluded:** Standalone Planar-Cube educational trainer; its repository, rules, algorithms, tutorials, and release milestones
- **Source baseline:** Work Architecture Specification v1.0 (2026-10-10) and Codex 3D Phased Implementation Plan (six two-week implementation sprints)

## Context

Jigsawverse requires one Afrofuturistic universe and asset pipeline supporting two different game families without conflating their mechanics. The repository audit reported React/Vite, Phaser for Assemble and a DOM-based solo Planar prototype on a separate branch. Ranked Assemble currently requires stronger server-side command authority, viewer-specific secrecy and reconnect/state guarantees before tournament release. The audited GitHub main revision was `e6d2f9c6a3a462b6cde2cf2134055c824d4d69d5`; Planar was audited at `0c86a9b6e69597a418764adbc799da7f7cc47c69`. These are *audit snapshots*, not verified production deployment heads.

## Product-owner decisions — direction accepted

1. **One universe, two game families.** A shared visual language, worlds, themes and art pipeline serve **Assemble** and **Jigsawverse Planar**. Mechanics, scoring and mode adapters remain family-specific. `CLASSIC`, `SUPER`, `SAGE`, `NEXUS`, `SAVANT` and `SINGLE_PLAYER` are Assemble ruleset identifiers, not separate worlds.
2. **Art universe.** Adopt **The Living Atlas** as the *working narrative universe*; prioritize a concept comparison and art-bible approval before locking final visual treatment. Preserve the exciting, monumental, tactile quality of the tournament flyer without sacrificing on-device clarity. The prior Golden Kingdom direction is a visual concept/championship treatment to evaluate, **not** a competing code architecture or pre-approved theme.
3. **World sequence.** **Atlas Workshop** is the first shared graybox/production theme; **River Courtyard** is the second asset-only reuse proof. Further worlds are out of the first release scope.
4. **Rendering.** Use React for shell and accessible HUD; use an imperative **Three.js/WebGL2** renderer for real 3D boards. Preserve playable **Phaser Assemble** and **DOM Planar** alternatives; only one viewport renderer can run at a time. No Unity migration, React major-version migration or mandatory React Three Fiber adoption in this programme.
5. **Rules freeze.** Existing Assemble game rules and Jigsawverse Planar v1 gameplay remain unchanged by the rendering programme. Preserve a ten-piece Assemble rack initially; changing rack capacity or game rules requires a separately versioned gameplay decision. Planar v1 retains its row/column one-cell shifts, wrap behavior, matches and cascades; no individual tile swaps or cube-solver behavior.
6. **Ranked secrecy.** Competitive Assemble must use **server-private** protected scores, solution/answer mappings, foreign racks and other unrevealed information; only authorized per-viewer projections may reach clients. Animations/audio/telemetry may not reveal concealed correctness ahead of rule-approved disclosure. Puzzle imagery may still support human inference; the goal is to prevent direct metadata leaks, not promise perfect cheat-proofing.
7. **Multiplayer authority.** For **ranked** Assemble: verified-actor, server-authoritative commands; atomic versioned updates; idempotency keyed by game and command ID; authenticated private projections; server deadlines and finalization. Existing client-authored state is not acceptable for ranked release. Keep Supabase as the baseline service stack subject to capacity/security verification.
8. **Release scope.** Solo Assemble and **solo Jigsawverse Planar** may be visually released after parity/device gates; Planar multiplayer is **deferred**. Ranked Assemble must independently pass authority, reconnect, secrecy and load gates.
9. **Cognitive measurement separation.** Instrument a versioned, privacy-conscious gameplay event contract distinct from tournament score. CAESAR-derived cognitive measures are research indicators until separately validated; they must not be marketed as validated cognitive assessments merely because the game collects telemetry. Pilot consent/data-retention requirements must be documented before children's gameplay is collected.
10. **Rollout.** Use feature flags (`renderer3dAssemble`, `renderer3dPlanar`, `themeAtlas`, `themeRiver`, `authoritativeMultiplayerV2`), progressive device tiers, 2D fallbacks and staged rollout. Renderer rollback may remount from a settled snapshot; **do not** roll an in-progress authoritative match back to client-written state.

## Architectural constraints

- Shared logical state and semantic inputs are independent of renderer and art.
- Same ruleset, outcome, score, hints and reveal policy in 2D and 3D.
- One immutable/versioned asset manifest per theme with licenses, hashes, bounds, LOD variants and fallbacks; changing a theme does not change gameplay.
- Assemble 3D uses one puzzle image texture with per-piece UV mapping; Planar uses stable tile IDs and kind glyphs and animates turn traces rather than letting visuals decide rules.
- Browser-first, mobile-first; graceful recovery from WebGL errors, context loss, low bandwidth and tab resets.
- Maintain adequate focus targets, keyboard control, reduced motion and non-color-only distinctions.

## Items explicitly NOT yet verified or approved for release

### G0. Deployed baseline

Identify actual Vercel/hosting production deployment SHA; reconcile `main`, `codex/planar-match3-prototype`, and other divergent patches; inventory live Supabase migrations, RLS, RPC, realtime policies, schema and rollback backups. GitHub repo SHA alone is not production verification.

### G1. Protected-information design

Specify exact per-viewer fields and secrecy rules for all Assemble rulesets, hints, marks, reveal milestones, spectators and gameplay event logs. Test attacks via WebSocket payload, REST queries, storage, logs and telemetry. Approve before ranked deployment.

### G2. Physical mobile/device budget

Record exact local budget Android, midrange Android, older iPhone Safari and desktop browser models; pin test OS versions. Treat frame rates, draw calls, download size, GPU memory and load time in the architecture spec as **proposed targets, not achieved measurements**. Confirm or revise after graybox.

### G3. Implementation ownership

Name engineering lead, art lead, technical artist, security/DB owner, QA/release owner and cultural/rights reviewers. Art concepts and assets must carry region-specific provenance, licensing and permission records. No assumption that one reviewer represents all African traditions.

### G4. Children’s tournament operations and measurements

Define parent/guardian consent, lawful handling and minimization of child-related data, retention periods, moderation, challenge content, pseudonymous leaderboards, fairness and support policy. Record tournament mode, prize rules and disconnection/adjudication policy before opening registrations.

### G5. Client/protocol compatibility and deploy rollback

Determine minimum client version, additive migration sequence, authoritative-match isolation, command transaction rollback, RLS revocation timing, feature-flag ownership and operational runbook. Do not switch protocols mid-match.

## Phase 0 acceptance gate

Phase 0 is **not complete** merely because the defaults above were accepted. To authorize Sprint 1, collect links to: (a) verified deployed SHA/database baseline, (b) immutable gameplay and snapshot contracts, (c) viewer-projection/secrecy policy, (d) device targets and performance-test method, (e) named approvers and asset-rights policy, (f) child-pilot measurement/consent policy, (g) staged rollout and rollback policy. Obtain explicit product and engineering sign-off.

**No production gameplay code, database migration, deployment configuration or live environment is modified by this ADR.**

## Source of record

- Work: `Jigsawverse-3D-Architecture-Specification(1).md` supplied in the project conversation.
- Codex: `# Jigsawverse 3D phased implementat.txt` supplied in the project conversation.
- This ADR records the user's acceptance of the assistant's recommendations and clarifies conditional gates; it does not assert verification of production infrastructure.