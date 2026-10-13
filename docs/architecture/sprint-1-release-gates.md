# Sprint 1 authoritative multiplayer release gates

**Status:** local deterministic gates pass; staging and production-readiness gates remain pending

This checklist separates repository evidence from evidence that can only be
collected against deployed infrastructure. A local pass does not authorize the
ranked feature flag.

## Automated repository gate

Run:

```sh
npm run test:sprint1-gates
```

The command covers the stateful command worker harness, client recovery, and
the migration contract. It must pass on the exact candidate commit.

| Gate | Required outcome | Current evidence | Status |
| --- | --- | --- | --- |
| Concurrent same-revision commands | Exactly one commit; the other command receives `revision_conflict` | Deterministic worker/RPC-model test | Pass locally |
| Duplicate command replay | Same accepted result; one revision and one pair of outbox rows | Deterministic worker/RPC-model test | Pass locally |
| Conflicting command-ID reuse | Rejected as `command_id_conflict`; no extra commit | Deterministic worker/RPC-model test | Pass locally |
| Worker interruption after begin | Pending ledger entry resumes safely with the same command ID | Injected commit interruption test | Pass locally |
| Deadline boundary | A command beginning exactly at `ends_at` is rejected; no projection event | Deterministic authoritative-clock test | Pass locally |
| Projection delivery | Exactly one private outbox row per player for an accepted revision | Stateful harness and migration contract tests | Pass locally |
| Reconnect and event gaps | Duplicate/out-of-order events are ignored and gaps trigger a fresh snapshot | Session recovery tests | Pass locally |
| Schema isolation | Canonical state, commands, and outbox remain service-only | Migration contract tests | Pass locally |
| Client authority routing | New-match flags and persisted in-progress authority are separate decisions | Routing tests | Pass locally |
| Projection UI mapping | Foreign rack IDs, answer coordinates, and unrevealed scores do not enter gameplay state | Client-adapter tests | Pass locally |
| Trusted bootstrap boundary | Client sends only game ID; worker verifies player/pin and builds revision zero from a service-only manifest | Bootstrap worker, Edge source-boundary, and migration contract tests | Pass locally |
| Ranked asset preparation | Trusted image slicing, opaque IDs, private paths, leased queue claims, bounded retries, transactional manifest/pin, and failure cleanup | Provisioner, worker, and storage migration tests | Pass locally |
| Trusted lobby coordination | Creation atomically pins v2 and queues preparation; join serializes player-B assignment; existing matches resolve persisted authority | Coordinator, Edge-boundary, browser-service, and migration tests | Pass locally |
| Feature-flagged screen handoff | Flag selects only new creation; joins resolve persisted authority; gameplay starts only after readiness and private bootstrap | Flow orchestration and screen-boundary tests | Pass locally |

The provider-neutral store in
`supabase/functions/_shared/authoritativeCommandGateHarness.js` models the
transaction boundaries and idempotency behavior of the three v2 RPCs. It runs
the real `processRankedCommand()` orchestration but does not model PostgreSQL,
network, Edge runtime, or Realtime capacity. It must never be cited as load-test
or deployment evidence.

## Staging gate

All rows below require evidence captured from an isolated Supabase staging
project running the exact candidate commit and migration.

| Gate | Acceptance criterion | Required evidence | Status |
| --- | --- | --- | --- |
| Candidate identity | Application, worker, and migration SHAs are recorded and pinned | Deployment record | Pending |
| Migration and rollback | Additive migration applies cleanly; rollback rehearsal follows the documented sequence | Migration logs and operator notes | Pending |
| RLS attack matrix | Two assigned players see only their projections; an unrelated authenticated account sees none; clients cannot invoke trusted RPCs | Redacted request/response report | Pending |
| Command concurrency | Repeated same-cell, different-cell, duplicate-ID, and conflicting-ID bursts preserve a single revision order | Aggregate run report; no canonical payloads | Pending |
| Deadline and finalization | Server-clock boundary and simultaneous terminal commands produce one final result | Aggregate run report | Pending |
| Realtime recovery | Disconnect, dropped event, duplicate event, delayed event, and reconnect recover to the latest projection | Revision-only trace | Pending |
| Outbox resilience | Publisher interruption/retry causes no missing committed revision; duplicate delivery is harmless | Revision/count report | Pending |
| Load and latency | Product-approved concurrency, p95/p99 latency, error-rate, and soak thresholds are met | Approved load profile and results | Pending |
| Shadow parity | Approved deterministic corpus and soak have zero unexplained divergence | Safe mismatch-code report | Pending |
| Secret and logging review | Service-role secret is server-only and logs/telemetry contain no protected state | Security review | Pending |
| Ranked asset deployment | Opaque IDs and coordinate-free pieces are generated in the deployed worker; private storage, signed URLs, cleanup, and expiry behave under attack/load | Pipeline run and metadata attack report | Pending |

Staging reports may contain game ID, command ID, command type, status, revision,
safe error code, duration, and counts. They must not contain canonical state,
answers, true scores, racks, Nexus marks, service credentials, raw database
errors, or evaluator exception messages.

## Activation approvals

Before enabling `authoritativeMultiplayerV2` for ranked match creation:

- Engineering names the candidate commit and signs the staging evidence.
- Product approves the load profile, latency/error thresholds, and any accepted
  shadow differences.
- Security approves the secrecy matrix, RLS results, service-role handling,
  and restricted telemetry sink.
- Operations confirms alerting, feature-flag ownership, the pinned worker
  version, and rollback responsibility.
- The release record links every pending row above to immutable evidence.

Legacy ranked creation remains enabled and the v2 flag remains off until every
staging gate and activation approval is complete. Existing matches are never
switched between authority models in progress.
