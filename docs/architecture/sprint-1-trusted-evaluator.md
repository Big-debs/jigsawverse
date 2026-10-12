# Sprint 1 trusted command evaluator

**Status:** pure evaluator implemented; server worker adapter pending

The evaluator is the deterministic rules boundary between `begin_authoritative_match_command_v2` and `commit_authoritative_match_command_v2`. It accepts the protected canonical snapshot returned to the service role, a validated protocol-v2 command and the player role derived by the trusted worker from verified authentication.

## Guarantees

- The command game ID, protocol version and expected revision must match the canonical state.
- Only allow-listed semantic payload fields are accepted; clients cannot submit actors, scores, grids or replacement state.
- Board dimensions, piece catalogue IDs, correct-position mappings and the exactly-once distribution across board/racks/pool are checked before and after every command.
- Existing Assemble rules handle turn, rack ownership, occupied cells, check/pass and Nexus mark/resolve behavior.
- Move timestamps come from the trusted evaluator clock rather than the client.
- The evaluator returns a new canonical revision and independently generated player A/player B projections.
- Raw rule results remain server-only because they can include correctness and final scoring detail.
- Legacy debug logging on the evaluator path does not emit pending checks, answer mappings or occupied-piece objects.

## Worker sequence

1. Verify the caller's access token and derive the authenticated user ID.
2. Call `begin_authoritative_match_command_v2` with that verified actor ID.
3. Map the verified actor ID to `playerA` or `playerB`; never accept a role from the request body.
4. Evaluate the returned canonical state with `evaluateTrustedMatchCommand()`.
5. Call `commit_authoritative_match_command_v2` with the new canonical state and both sanitized projections.
6. Return only the committing actor's projection/result envelope.

The next integration step is a server-only adapter that performs this sequence and an outbox publisher that sends committed projections to authorized private topics.
