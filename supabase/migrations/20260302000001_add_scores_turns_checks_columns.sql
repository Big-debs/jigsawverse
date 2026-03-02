-- =====================================================
-- ADD scores, turns_remaining, checks_remaining to game_state
-- Needed so scoring and turn state survive reconnects
-- =====================================================

ALTER TABLE public.game_state
ADD COLUMN IF NOT EXISTS scores JSONB DEFAULT '{}';

ALTER TABLE public.game_state
ADD COLUMN IF NOT EXISTS turns_remaining JSONB DEFAULT '{}';

ALTER TABLE public.game_state
ADD COLUMN IF NOT EXISTS checks_remaining JSONB DEFAULT '{}';
