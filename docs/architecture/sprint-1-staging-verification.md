# Sprint 1 authoritative staging verification

**Status:** guarded verifier implemented; no staging project was configured in
this checkout, so no remote deployment or verification has been performed.

Local Supabase may be used for the no-cost preflight when a separate hosted
staging project is unavailable. Local evidence does not satisfy the final
hosted-staging deployment, recovery, monitoring, or approval gates.

## Safety boundary

The verifier creates and deletes users, storage objects, an image, a lobby,
private piece assets, projections, commands, and outbox rows. It refuses to run
unless all of these conditions hold:

- `STAGING_ENVIRONMENT_NAME` is exactly `staging`;
- `ALLOW_STAGING_MUTATIONS` is exactly `true`;
- `STAGING_PROJECT_REF` is a valid project reference and exactly matches the
  hostname in `STAGING_SUPABASE_URL`; and
- `STAGING_EXPECTED_GIT_SHA` is a full SHA matching the current checkout.

The checkout must also be clean. Any tracked or untracked change causes the
verifier to stop before contacting Supabase, keeping evidence tied to the exact
candidate commit.

The staging queue must also contain no queued, processing, or failed ranked
asset jobs. This prevents the verifier's single-job worker invocation from
claiming unrelated work.

## Deployment order

From the exact candidate checkout, authenticate and link the Supabase CLI to
the isolated staging project, then apply and deploy:

```sh
supabase link --project-ref <staging-project-ref>
supabase db push --linked
supabase functions deploy ranked-command-v2 --project-ref <staging-project-ref>
supabase functions deploy ranked-match-lobby-v2 --project-ref <staging-project-ref>
supabase functions deploy ranked-match-bootstrap-v2 --project-ref <staging-project-ref>
```

Confirm the linked project reference before every command. Do not use a
production project for this procedure. Configure the ranked asset worker as a
server-side scheduled job with `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; keep both out of browser environments and logs.

## Verification run

Set the following variables in a secure operator environment without printing
their values:

```text
STAGING_SUPABASE_URL
STAGING_SUPABASE_ANON_KEY
STAGING_SUPABASE_SERVICE_ROLE_KEY
STAGING_PROJECT_REF
STAGING_ENVIRONMENT_NAME=staging
ALLOW_STAGING_MUTATIONS=true
STAGING_EXPECTED_GIT_SHA=<full candidate SHA>
```

Then run:

```sh
npm run test:sprint1-gates
npm run verify:authoritative-staging
```

The verifier checks:

1. two assigned users see exactly one private projection each;
2. an unrelated user sees no projection;
3. all three users are denied canonical, command, outbox, manifest, and job tables;
4. authenticated users cannot execute the asset-job claim RPC;
5. the unrelated user cannot bootstrap the match;
6. signed piece records contain no answer position;
7. two same-revision placements to one cell produce one accept and one reject; and
8. the committed revision produces exactly two private outbox rows.

It emits one JSON object containing only the candidate SHA, run ID, duration,
counts, statuses, and revisions. It never reports projections, racks, answer
catalogues, asset paths, credentials, raw provider errors, or canonical state.
Fixture cleanup runs in `finally`, including users and storage objects.

## Local preflight

Start the stack from the candidate checkout with `npx supabase start`. Obtain
the local values with `npx supabase status -o env`, then set:

```text
VERIFICATION_TARGET=local
LOCAL_SUPABASE_URL=http://127.0.0.1:54321
LOCAL_SUPABASE_ANON_KEY=<local ANON_KEY>
LOCAL_SUPABASE_SERVICE_ROLE_KEY=<local SERVICE_ROLE_KEY>
LOCAL_PROJECT_REF=local
LOCAL_ENVIRONMENT_NAME=local
ALLOW_LOCAL_MUTATIONS=true
LOCAL_EXPECTED_GIT_SHA=<full candidate SHA>
```

The local guard rejects `localhost`, non-loopback hosts, alternate ports,
HTTPS, URL paths, and any project reference other than `local`. Run
`npm run verify:authoritative-staging`; cleanup is identical to staging.

## Evidence and remaining gates

Store the aggregate JSON output with the deployment SHA and migration/function
deployment logs. This verifier supplies evidence for candidate identity, the
core RLS attack matrix, basic same-cell concurrency, outbox count, and ranked
asset deployment. It does not replace rollback rehearsal, realtime fault
injection, load/soak testing, deadline/finalization tests, shadow parity, secret
review, alerting, or approval sign-off.
