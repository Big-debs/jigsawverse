import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(new URL('./20261013020000_ranked_match_lobby_v2.sql', import.meta.url), 'utf8');

describe('ranked match lobby v2 migration', () => {
  it('keeps jobs and coordinator RPCs service-only', () => {
    expect(sql).toContain('CREATE TABLE public.ranked_match_jobs');
    expect(sql).toContain('ALTER TABLE public.ranked_match_jobs ENABLE ROW LEVEL SECURITY');
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.ranked_match_jobs FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.create_ranked_match_lobby_v2[\s\S]+FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.join_ranked_match_lobby_v2[\s\S]+FROM PUBLIC, anon, authenticated/);
  });

  it('pins authority and queues preparation in the creation transaction', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION public\.create_ranked_match_lobby_v2[\s\S]+?\$\$;/)?.[0] ?? '';
    expect(body).toContain("VALUES (v_game.id, 'authoritative_v2')");
    expect(body).toContain('INSERT INTO public.ranked_match_jobs');
    expect(body).toContain('uploaded_by = p_actor_id OR is_public = TRUE');
  });

  it('serializes join and refuses legacy authority', () => {
    const body = sql.match(/CREATE OR REPLACE FUNCTION public\.join_ranked_match_lobby_v2[\s\S]+?\$\$;/)?.[0] ?? '';
    expect(body).toContain("pin.authority_model = 'authoritative_v2'");
    expect(body).toContain('FOR UPDATE OF game');
    expect(body).toContain("v_game.status <> 'waiting'");
  });

  it('allows the provisioner to consume a coordinator-owned pin', () => {
    expect(sql).toContain("IF FOUND AND v_authority <> 'authoritative_v2'");
    expect(sql).toContain("SET status = 'prepared'");
  });
});
