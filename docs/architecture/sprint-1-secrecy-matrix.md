# Sprint 1 ranked Assemble secrecy matrix

**Status:** protocol v2/ruleset v1 policy implemented; product/security approval and staging attack tests pending  
**Applies to:** ranked `CLASSIC`, `SUPER`, `SAGE`, `SAVANT`, and `NEXUS`  
**Does not apply to:** local `SINGLE_PLAYER`, which is not transported through the ranked protocol

`VIEWER_PROJECTION_ALLOW_LIST` is the executable source of truth for the projection shape. REST snapshots, command acknowledgements, private Realtime broadcasts, reconnect recovery and outbox payloads must all use `createViewerProjection()` output. Canonical state is never an allowed transport payload.

## Common field policy

| Information | Current player | Opponent | Spectator | Logs and telemetry |
|---|---|---|---|---|
| Match ID, mode, status, dimensions, rack capacity, start/deadline | Full | Full | Denied in Sprint 1 | IDs/version/status only where operationally required |
| Board occupancy | Piece IDs only | Piece IDs only | Denied | Counts/revision only |
| Correct positions and piece catalogue | Never | Never | Never | Never |
| Own rack | Piece IDs | Count only | Never | Count only |
| Piece pool | Count only | Count only | Never | Count only |
| True scores, accuracy, streak and placement correctness | Never before approved reveal | Never before approved reveal | Never | Never |
| Milestone-approved scores | `revealedScores` | `revealedScores` | Denied | Numeric values excluded; milestone event/version may be recorded |
| Hint usage | Own `hintsUsed` count | Never | Never | Hint type/count only if approved; never hint answer data |
| Turns/check allowances and current turn | Full | Full | Denied | Aggregate counters only |
| Move history | Never | Never | Never | Semantic command type and revision only; no correctness or protected payload |
| Final result | Status, winner, finalized time | Same | Denied | Status/winner only if required |
| Final score details | Only through milestone/final `revealedScores` | Same | Denied | Never in general application logs |

Unknown fields are denied. Adding any projection field requires a schema/protocol decision, a matrix update and leak-prevention tests.

## Ruleset-specific policy

| Ruleset | Pending checks and milestones | Marks and hints | Result/reveal rule |
|---|---|---|---|
| `CLASSIC` | Both players receive placer, piece ID, grid index and `revealCorrectness` eligibility. The actual `correct` value, scoring detail and internal timestamp stay private. Scores change publicly only through `revealedScores`. | Ranked hints are disabled until an authoritative hint command exists. | Public result contains only status, winner and finalized time. |
| `SUPER` | Same secrecy boundary as `CLASSIC`; extra turns do not broaden exposure. | Same as `CLASSIC`. | Same as `CLASSIC`. |
| `SAGE` | Same secrecy boundary as `CLASSIC`; multiple checks do not expose prior correctness or move history. | Same as `CLASSIC`. | Same as `CLASSIC`. |
| `SAVANT` | No opponent check payload. Immediate server scoring remains true-score state and is not automatically public. | Ranked hints remain disabled. | Only `revealedScores` and the restricted result envelope may leave the server. |
| `NEXUS` | No pending check payload. Piece placement ownership is visible because it governs legal marks. | Before resolution, each player sees only their own suspect/confident marks. After authoritative resolution, both players may see all sanitized marks. Marks never contain correctness. | Resolution may update `revealedScores`; answer mappings and detailed scoring evidence remain private. |

## Hints

Protocol v2/ruleset v1 has no ranked hint command. A browser must not call local `GameLogic.useHint()` during an authoritative match. A future server hint command may return answer-bearing hint content only to the authenticated requester in that command response. Hint content must not enter canonical shared projections, the outbox, the opponent topic, general logs or telemetry.

## Spectators

Spectators are deny-by-default in Sprint 1: they receive no `match_projections` row and cannot join a player topic. A future spectator protocol requires a separate delayed projection, topic namespace, authorization policy and disclosure review; it must never reuse a player projection.

## Logging and telemetry

Allowed operational data is limited to opaque game/command IDs, protocol/schema/ruleset versions, revision, command type, stable error code, latency, retry count and aggregate payload size. Do not log or emit canonical state, projection bodies, rack/pool piece IDs, answer mappings, pending correctness, hint answers, true scores, detailed result objects or database error text. Gameplay analytics must use a separately versioned, privacy-reviewed event contract.

## Verification gates

- Exact top-level and nested allow-list tests must pass.
- Tainted answer, rack, pool, score, history, pending-check and result values must be absent from both player projections.
- Nexus cross-player mark tests must pass before and after resolution.
- Staging must repeat the checks through REST, command responses, private Realtime, reconnect snapshots, outbox retries, function/database logs and telemetry capture.
- Product and security/DB owners must approve this matrix before ranked exposure.

