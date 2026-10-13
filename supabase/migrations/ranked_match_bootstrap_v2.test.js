import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20261013000000_ranked_match_bootstrap_v2.sql', import.meta.url),
  'utf8'
);

describe('ranked match bootstrap migration', () => {
  it('stores authority pins outside the client-writable games row', () => {
    expect(sql).toContain('CREATE TABLE public.match_authority_pins');
    expect(sql).toContain("authority_model IN ('legacy', 'authoritative_v2')");
    expect(sql).not.toMatch(/ALTER TABLE public\.games\s+ADD.*authority/is);
    expect(sql).toContain('GRANT SELECT, INSERT ON TABLE public.match_authority_pins TO service_role');
    expect(sql).not.toContain('GRANT ALL ON TABLE public.match_authority_pins TO service_role');
  });

  it('keeps protected manifests service-only', () => {
    expect(sql).toContain('ALTER TABLE public.ranked_puzzle_manifests ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON TABLE public.ranked_puzzle_manifests FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT ALL ON TABLE public.ranked_puzzle_manifests TO service_role');
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]*ranked_puzzle_manifests/i);
  });

  it('requires one protected answer and safe asset record per board cell', () => {
    expect(sql).toContain('jsonb_array_length(piece_catalog) = rows * cols');
    expect(sql).toContain('jsonb_array_length(asset_manifest) = rows * cols');
  });
});
