-- =====================================================
-- RANKED MATCH V2 TRUSTED BOOTSTRAP INPUTS
-- =====================================================
-- Authority pins and prepared puzzle manifests are service-only. The browser
-- cannot choose an authority model or submit the protected answer catalogue.

CREATE TABLE public.match_authority_pins (
  game_id UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  authority_model TEXT NOT NULL
    CHECK (authority_model IN ('legacy', 'authoritative_v2')),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.ranked_puzzle_manifests (
  game_id UUID PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  rows INTEGER NOT NULL CHECK (rows > 0),
  cols INTEGER NOT NULL CHECK (cols > 0),
  gameplay_mode TEXT NOT NULL
    CHECK (gameplay_mode IN ('CLASSIC', 'SUPER', 'SAGE', 'NEXUS', 'SAVANT')),
  rack_capacity INTEGER NOT NULL DEFAULT 10 CHECK (rack_capacity > 0),
  piece_catalog JSONB NOT NULL CHECK (jsonb_typeof(piece_catalog) = 'array'),
  asset_manifest JSONB NOT NULL CHECK (jsonb_typeof(asset_manifest) = 'array'),
  source_digest TEXT NOT NULL CHECK (length(source_digest) >= 32),
  prepared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_array_length(piece_catalog) = rows * cols),
  CHECK (jsonb_array_length(asset_manifest) = rows * cols)
);

ALTER TABLE public.match_authority_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ranked_puzzle_manifests ENABLE ROW LEVEL SECURITY;

-- Deliberately no anon/authenticated policies. Only trusted provisioning and
-- Edge workers may read pins, protected answers, or asset manifests.
REVOKE ALL ON TABLE public.match_authority_pins FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ranked_puzzle_manifests FROM PUBLIC, anon, authenticated;
-- Pins are append-only for the service role. Match deletion removes them via
-- the foreign-key cascade, but application code cannot repin a live game.
GRANT SELECT, INSERT ON TABLE public.match_authority_pins TO service_role;
GRANT ALL ON TABLE public.ranked_puzzle_manifests TO service_role;

COMMENT ON TABLE public.match_authority_pins IS
  'Server-owned authority choice pinned for the full lifetime of a match.';
COMMENT ON TABLE public.ranked_puzzle_manifests IS
  'Server-prepared opaque piece IDs, protected answers, and coordinate-free assets.';
