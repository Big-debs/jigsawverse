-- Store gameplay mode (CLASSIC/SUPER/SAGE/...) for multiplayer sync
ALTER TABLE public.game_state
ADD COLUMN IF NOT EXISTS gameplay_mode TEXT DEFAULT 'CLASSIC';
