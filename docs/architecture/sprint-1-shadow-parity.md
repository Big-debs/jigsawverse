# Sprint 1 legacy-authoritative shadow parity

**Status:** provider-neutral harness and worker observation boundary implemented; legacy adapter, telemetry sink and staging soak pending

Shadow mode is evidence collection only. It must never select gameplay state, modify a command result, delay a database transaction, expose protected comparison values, or authorize production rollout by itself.

## Execution model

1. Capture the same settled pre-command state, verified actor role, semantic command and evaluation time for both paths.
2. Let the authoritative evaluator produce the state that will be committed.
3. Let a staging-only legacy adapter independently apply the command and translate its result into the canonical schema.
4. Call `compareShadowMatchStates()` or `observeShadowParity()` inside the trusted boundary.
5. Emit the safe report to a restricted staging metric/event sink.
6. Continue returning the already committed authoritative response even if shadow evaluation or reporting fails.

`processRankedCommand()` exposes the optional `observeEvaluation` hook only after a command commit succeeds. Production leaves the hook unset. Staging wiring must not reuse the authoritative evaluator as the legacy adapter, because comparing one implementation with itself provides no parity evidence.

## Compared dimensions

- Revision and match status.
- Board state and pinned answer catalogue.
- Player A rack, player B rack and piece pool.
- Current turn, remaining turns/checks and check-reveal progress.
- True scores and milestone-revealed scores.
- Pending decision semantics and move history, excluding timestamps.
- Nexus placement ownership, marks and resolution.
- Terminal status and winner, excluding finalization timestamp.

The comparator reports `parity`, `diverged`, or `shadow_error`. Divergence reports contain only report version, game/command IDs, command type, expected/actual revisions, check time and stable mismatch codes. They never contain canonical state, projections, rule results, scores, answers, racks, marks, database errors or exception messages.

## Required staging matrix

Exercise every ranked ruleset and command type, including correct/incorrect placement, check/pass branches, score-reveal milestones, multi-turn/check exhaustion, Nexus own/opponent marks, Nexus resolution, rack refill, finalization, duplicate command replay, same-cell collision, deadline expiry and reconnect recovery. Include both player roles and mobile reconnect timing.

Production activation requires:

- zero unexplained divergences in the approved deterministic test corpus;
- a documented staging soak with no unresolved mismatch category;
- explicit review of every `shadow_error` and any excluded nondeterministic field;
- confirmation that the report sink contains no protected payloads;
- product and engineering sign-off on accepted differences, if any.

## Current limitation

The repository does not establish the live legacy schema, deployed SHA, staging credentials or approved telemetry destination. Those inputs are required to implement and enable the independent legacy adapter. Until then, the harness is tested but deliberately not activated.

