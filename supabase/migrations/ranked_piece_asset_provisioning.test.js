import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  new URL('./20261013010000_ranked_piece_asset_provisioning.sql', import.meta.url),
  'utf8'
);

describe('ranked piece asset provisioning migration', () => {
  it('creates a private PNG-only bucket without client object policies', () => {
    expect(sql).toContain("'ranked-piece-assets'");
    expect(sql).toContain('FALSE');
    expect(sql).toContain("ARRAY['image/png']::TEXT[]");
    expect(sql).not.toMatch(/CREATE POLICY[\s\S]+ranked-piece-assets/i);
  });

  it('provisions the v2 pin and manifest in one service-only transaction', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.provision_ranked_puzzle_manifest_v2');
    expect(sql).toContain("VALUES (p_game_id, 'authoritative_v2')");
    expect(sql).toContain('INSERT INTO public.ranked_puzzle_manifests');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('TO service_role');
  });

  it('refuses to convert started or legacy-initialized games', () => {
    expect(sql).toContain("v_game.status <> 'waiting'");
    expect(sql).toContain('FROM public.game_state WHERE game_id = p_game_id');
    expect(sql).toContain('FROM public.authoritative_matches WHERE game_id = p_game_id');
  });
});
