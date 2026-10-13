-- =====================================================
-- PRIVATE RANKED PIECE ASSETS + TRANSACTIONAL PROVISIONING
-- =====================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ranked-piece-assets',
  'ranked-piece-assets',
  FALSE,
  5242880,
  ARRAY['image/png']::TEXT[]
)
ON CONFLICT (id) DO UPDATE
SET public = FALSE,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- No storage.objects policy is created. Only service-role workers upload,
-- remove, or sign these objects; authenticated clients use short-lived URLs.

CREATE OR REPLACE FUNCTION public.provision_ranked_puzzle_manifest_v2(
  p_game_id UUID,
  p_rows INTEGER,
  p_cols INTEGER,
  p_gameplay_mode TEXT,
  p_rack_capacity INTEGER,
  p_piece_catalog JSONB,
  p_asset_manifest JSONB,
  p_source_digest TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_existing_digest TEXT;
BEGIN
  SELECT * INTO v_game
  FROM public.games
  WHERE id = p_game_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Game not found';
  END IF;
  IF v_game.status <> 'waiting' THEN
    RAISE EXCEPTION 'Only waiting games may be provisioned';
  END IF;
  IF EXISTS (SELECT 1 FROM public.game_state WHERE game_id = p_game_id)
    OR EXISTS (SELECT 1 FROM public.authoritative_matches WHERE game_id = p_game_id) THEN
    RAISE EXCEPTION 'Game authority has already started';
  END IF;
  IF p_rows < 1 OR p_cols < 1 OR p_rack_capacity < 1 THEN
    RAISE EXCEPTION 'Invalid ranked puzzle dimensions';
  END IF;
  IF p_gameplay_mode NOT IN ('CLASSIC', 'SUPER', 'SAGE', 'NEXUS', 'SAVANT') THEN
    RAISE EXCEPTION 'Invalid ranked gameplay mode';
  END IF;
  IF COALESCE(jsonb_typeof(p_piece_catalog), 'null') <> 'array'
    OR jsonb_array_length(p_piece_catalog) <> p_rows * p_cols
    OR COALESCE(jsonb_typeof(p_asset_manifest), 'null') <> 'array'
    OR jsonb_array_length(p_asset_manifest) <> p_rows * p_cols
    OR length(COALESCE(p_source_digest, '')) < 32 THEN
    RAISE EXCEPTION 'Invalid ranked puzzle manifest';
  END IF;

  SELECT source_digest INTO v_existing_digest
  FROM public.ranked_puzzle_manifests
  WHERE game_id = p_game_id;

  IF FOUND THEN
    IF v_existing_digest = p_source_digest
      AND EXISTS (
        SELECT 1 FROM public.match_authority_pins
        WHERE game_id = p_game_id AND authority_model = 'authoritative_v2'
      ) THEN
      RETURN;
    END IF;
    RAISE EXCEPTION 'Game already has a different ranked manifest';
  END IF;

  INSERT INTO public.match_authority_pins (game_id, authority_model)
  VALUES (p_game_id, 'authoritative_v2');

  INSERT INTO public.ranked_puzzle_manifests (
    game_id, rows, cols, gameplay_mode, rack_capacity,
    piece_catalog, asset_manifest, source_digest
  ) VALUES (
    p_game_id, p_rows, p_cols, p_gameplay_mode, p_rack_capacity,
    p_piece_catalog, p_asset_manifest, p_source_digest
  );
END;
$$;

REVOKE ALL ON FUNCTION public.provision_ranked_puzzle_manifest_v2(
  UUID, INTEGER, INTEGER, TEXT, INTEGER, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_ranked_puzzle_manifest_v2(
  UUID, INTEGER, INTEGER, TEXT, INTEGER, JSONB, JSONB, TEXT
) TO service_role;
