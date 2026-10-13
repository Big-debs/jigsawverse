-- =====================================================
-- LEASED RANKED ASSET JOB WORKER
-- =====================================================

ALTER TABLE public.ranked_match_jobs
  ADD COLUMN lease_token UUID;

CREATE UNIQUE INDEX idx_ranked_match_jobs_active_lease
  ON public.ranked_match_jobs (lease_token)
  WHERE lease_token IS NOT NULL;

CREATE OR REPLACE FUNCTION public.claim_ranked_match_job_v2(p_lease_token UUID)
RETURNS TABLE (
  game_id UUID,
  image_id UUID,
  source_path TEXT,
  rows INTEGER,
  cols INTEGER,
  gameplay_mode TEXT,
  rack_capacity INTEGER,
  attempt INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_job public.ranked_match_jobs%ROWTYPE;
  v_source_path TEXT;
BEGIN
  IF p_lease_token IS NULL THEN RAISE EXCEPTION 'Lease token is required'; END IF;

  SELECT job.* INTO v_job
  FROM public.ranked_match_jobs job
  WHERE job.attempts < 5
    AND job.available_at <= NOW()
    AND (
      job.status IN ('queued', 'failed')
      OR (job.status = 'processing' AND job.lease_expires_at < NOW())
    )
  ORDER BY job.available_at, job.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN RETURN; END IF;

  SELECT image.storage_path INTO v_source_path
  FROM public.images image WHERE image.id = v_job.image_id;
  IF v_source_path IS NULL THEN
    RAISE EXCEPTION 'Ranked source image is unavailable';
  END IF;

  UPDATE public.ranked_match_jobs job SET
    status = 'processing',
    attempts = job.attempts + 1,
    lease_token = p_lease_token,
    lease_expires_at = NOW() + INTERVAL '30 minutes',
    last_error_code = NULL
  WHERE job.game_id = v_job.game_id;

  RETURN QUERY SELECT
    v_job.game_id,
    v_job.image_id,
    v_source_path,
    v_job.rows,
    v_job.cols,
    v_job.gameplay_mode,
    v_job.rack_capacity,
    v_job.attempts + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_ranked_match_job_v2(
  p_game_id UUID,
  p_lease_token UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.ranked_match_jobs SET
    status = 'prepared',
    lease_token = NULL,
    lease_expires_at = NULL,
    last_error_code = NULL
  WHERE game_id = p_game_id
    AND status = 'processing'
    AND lease_token = p_lease_token
    AND EXISTS (
      SELECT 1 FROM public.ranked_puzzle_manifests manifest
      WHERE manifest.game_id = p_game_id
    );
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset job lease is stale or manifest is missing'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_ranked_match_job_v2(
  p_game_id UUID,
  p_lease_token UUID,
  p_error_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_attempts INTEGER;
BEGIN
  SELECT attempts INTO v_attempts
  FROM public.ranked_match_jobs
  WHERE game_id = p_game_id
    AND status = 'processing'
    AND lease_token = p_lease_token
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Asset job lease is stale'; END IF;

  UPDATE public.ranked_match_jobs SET
    status = 'failed',
    lease_token = NULL,
    lease_expires_at = NULL,
    available_at = NOW() + (INTERVAL '30 seconds' * POWER(2, LEAST(v_attempts - 1, 6))),
    last_error_code = LEFT(COALESCE(NULLIF(p_error_code, ''), 'asset_worker_failed'), 80)
  WHERE game_id = p_game_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_ranked_match_job_v2(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_ranked_match_job_v2(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.complete_ranked_match_job_v2(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_ranked_match_job_v2(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION public.fail_ranked_match_job_v2(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_ranked_match_job_v2(UUID, UUID, TEXT) TO service_role;

-- Completion is token-checked by complete_ranked_match_job_v2. Provisioning
-- only writes the protected manifest so a worker crash remains recoverable.
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
END;
$$;
