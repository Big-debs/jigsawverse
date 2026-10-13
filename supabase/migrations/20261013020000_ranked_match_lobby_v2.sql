-- =====================================================
-- TRUSTED RANKED MATCH LOBBY COORDINATOR
-- =====================================================
-- Creation pins authority and enqueues private asset preparation in the same
-- transaction. Browsers never write authority pins or provisioning jobs.

CREATE TABLE public.ranked_match_jobs (
  game_id UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  image_id UUID NOT NULL REFERENCES public.images(id),
  rows INTEGER NOT NULL CHECK (rows BETWEEN 5 AND 15),
  cols INTEGER NOT NULL CHECK (cols BETWEEN 5 AND 15),
  gameplay_mode TEXT NOT NULL
    CHECK (gameplay_mode IN ('CLASSIC', 'SUPER', 'SAGE', 'NEXUS', 'SAVANT')),
  rack_capacity INTEGER NOT NULL DEFAULT 10 CHECK (rack_capacity > 0),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'processing', 'prepared', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_expires_at TIMESTAMPTZ,
  last_error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ranked_match_jobs_ready
  ON public.ranked_match_jobs (available_at, created_at)
  WHERE status IN ('queued', 'failed');

ALTER TABLE public.ranked_match_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ranked_match_jobs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ranked_match_jobs TO service_role;

CREATE TRIGGER update_ranked_match_jobs_updated_at
  BEFORE UPDATE ON public.ranked_match_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.create_ranked_match_lobby_v2(
  p_actor_id UUID,
  p_image_id UUID,
  p_player_name TEXT,
  p_rows INTEGER,
  p_cols INTEGER,
  p_gameplay_mode TEXT,
  p_rack_capacity INTEGER,
  p_time_limit INTEGER
)
RETURNS TABLE (game_id UUID, game_code TEXT, lobby_status TEXT, asset_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR p_image_id IS NULL THEN
    RAISE EXCEPTION 'Actor and image are required';
  END IF;
  IF p_rows NOT BETWEEN 5 AND 15 OR p_cols NOT BETWEEN 5 AND 15
    OR p_rack_capacity < 1 OR p_time_limit NOT BETWEEN 60 AND 7200 THEN
    RAISE EXCEPTION 'Invalid ranked match settings';
  END IF;
  IF p_gameplay_mode NOT IN ('CLASSIC', 'SUPER', 'SAGE', 'NEXUS', 'SAVANT') THEN
    RAISE EXCEPTION 'Invalid ranked gameplay mode';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.images
    WHERE id = p_image_id
      AND (uploaded_by = p_actor_id OR is_public = TRUE)
  ) THEN
    RAISE EXCEPTION 'Image is unavailable to the actor';
  END IF;

  INSERT INTO public.games (
    host_id, mode, grid_size, time_limit, image_id,
    player_a_id, player_a_name, current_turn, status
  ) VALUES (
    p_actor_id, 'multiplayer', p_rows * p_cols, p_time_limit, p_image_id,
    p_actor_id, LEFT(COALESCE(NULLIF(BTRIM(p_player_name), ''), 'Player A'), 80),
    'playerA', 'waiting'
  ) RETURNING * INTO v_game;

  INSERT INTO public.match_authority_pins (game_id, authority_model)
  VALUES (v_game.id, 'authoritative_v2');

  INSERT INTO public.ranked_match_jobs (
    game_id, image_id, rows, cols, gameplay_mode, rack_capacity
  ) VALUES (
    v_game.id, p_image_id, p_rows, p_cols, p_gameplay_mode, p_rack_capacity
  );

  RETURN QUERY SELECT v_game.id, v_game.game_code, v_game.status::TEXT, 'queued'::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.join_ranked_match_lobby_v2(
  p_actor_id UUID,
  p_game_code TEXT,
  p_player_name TEXT
)
RETURNS TABLE (game_id UUID, game_code TEXT, lobby_status TEXT, asset_status TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_game public.games%ROWTYPE;
  v_asset_status TEXT;
BEGIN
  SELECT game.* INTO v_game
  FROM public.games game
  JOIN public.match_authority_pins pin ON pin.game_id = game.id
  WHERE game.game_code = UPPER(BTRIM(p_game_code))
    AND pin.authority_model = 'authoritative_v2'
  FOR UPDATE OF game;

  IF NOT FOUND THEN RAISE EXCEPTION 'Authoritative lobby not found'; END IF;
  IF v_game.host_id = p_actor_id THEN RAISE EXCEPTION 'Host cannot join own lobby'; END IF;
  IF v_game.status <> 'waiting' OR v_game.player_b_id IS NOT NULL THEN
    RAISE EXCEPTION 'Lobby is no longer accepting players';
  END IF;

  UPDATE public.games SET
    player_b_id = p_actor_id,
    player_b_name = LEFT(COALESCE(NULLIF(BTRIM(p_player_name), ''), 'Player B'), 80),
    status = 'active',
    started_at = NOW()
  WHERE id = v_game.id;

  SELECT job.status INTO v_asset_status
  FROM public.ranked_match_jobs job WHERE job.game_id = v_game.id;

  RETURN QUERY SELECT v_game.id, v_game.game_code, 'active'::TEXT, v_asset_status;
END;
$$;

REVOKE ALL ON FUNCTION public.create_ranked_match_lobby_v2(
  UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ranked_match_lobby_v2(
  UUID, UUID, TEXT, INTEGER, INTEGER, TEXT, INTEGER, INTEGER
) TO service_role;

REVOKE ALL ON FUNCTION public.join_ranked_match_lobby_v2(UUID, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_ranked_match_lobby_v2(UUID, TEXT, TEXT)
  TO service_role;

-- Provisioning may encounter the authority pin created by the coordinator.
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
  v_authority TEXT;
BEGIN
  SELECT * INTO v_game FROM public.games WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF v_game.status NOT IN ('waiting', 'active') THEN
    RAISE EXCEPTION 'Only open games may be provisioned';
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
  FROM public.ranked_puzzle_manifests WHERE game_id = p_game_id;
  IF FOUND THEN
    IF v_existing_digest = p_source_digest THEN RETURN; END IF;
    RAISE EXCEPTION 'Game already has a different ranked manifest';
  END IF;

  SELECT authority_model INTO v_authority
  FROM public.match_authority_pins WHERE game_id = p_game_id;
  IF FOUND AND v_authority <> 'authoritative_v2' THEN
    RAISE EXCEPTION 'Game is pinned to another authority';
  ELSIF NOT FOUND THEN
    INSERT INTO public.match_authority_pins (game_id, authority_model)
    VALUES (p_game_id, 'authoritative_v2');
  END IF;

  INSERT INTO public.ranked_puzzle_manifests (
    game_id, rows, cols, gameplay_mode, rack_capacity,
    piece_catalog, asset_manifest, source_digest
  ) VALUES (
    p_game_id, p_rows, p_cols, p_gameplay_mode, p_rack_capacity,
    p_piece_catalog, p_asset_manifest, p_source_digest
  );

  UPDATE public.ranked_match_jobs
  SET status = 'prepared', lease_expires_at = NULL, last_error_code = NULL
  WHERE game_id = p_game_id;
END;
$$;

