-- Persist public reveal state and per-cell ownership so reconnects and
-- end-game resolution produce identical results for both players.
ALTER TABLE public.game_state
ADD COLUMN IF NOT EXISTS revealed_scores JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS piece_placed_by JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS piece_marks JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS piece_owners JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS nexus_resolved BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS last_gameplay_event JSONB;
