import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  new URL('./20261012000000_authoritative_multiplayer_v2_foundation.sql', import.meta.url),
  'utf8'
);

describe('authoritative multiplayer v2 migration', () => {
  it('keeps protected tables behind RLS and explicit privilege revocation', () => {
    for (const table of [
      'authoritative_matches',
      'match_commands',
      'match_projections',
      'match_outbox'
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`);
    }
  });

  it('grants authenticated users read access only to their sanitized projection', () => {
    expect(migration).toContain('viewer_id = auth.uid()');
    expect(migration).toContain('GRANT SELECT ON TABLE public.match_projections TO authenticated');
    expect(migration).not.toContain('GRANT SELECT ON TABLE public.authoritative_matches TO authenticated');
  });

  it('restricts every authoritative RPC to the service role', () => {
    for (const name of [
      'initialize_authoritative_match_v2',
      'begin_authoritative_match_command_v2',
      'commit_authoritative_match_command_v2',
      'reject_authoritative_match_command_v2'
    ]) {
      expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${name}`);
      expect(migration).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([\\s\\S]*?FROM PUBLIC, anon, authenticated`));
      expect(migration).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([\\s\\S]*?TO service_role`));
    }
  });

  it('enforces idempotency, revision locking, deadlines, and an atomic outbox', () => {
    expect(migration).toContain('PRIMARY KEY (game_id, command_id)');
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain("v_error_code := 'deadline_expired'");
    expect(migration).toContain("v_error_code := 'stale_revision'");
    expect(migration).toContain('INSERT INTO public.match_outbox');
    expect(migration).toContain("'actorRole', v_actor_role");
    expect(migration).toContain("v_existing.status = 'pending'");
  });
});
