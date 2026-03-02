-- =====================================================
-- FIX: user_stats RLS policy for leaderboard reads
-- FIX: Atomic stats increment RPC function
-- =====================================================

-- Allow all authenticated users to read user_stats (needed for leaderboards)
CREATE POLICY "Authenticated users can view all stats for leaderboard"
  ON public.user_stats FOR SELECT
  TO authenticated
  USING (true);

-- Atomic stats increment function to avoid race conditions
-- when multiple games complete simultaneously for the same user
CREATE OR REPLACE FUNCTION public.increment_user_stats(
  p_user_id UUID,
  p_result TEXT,    -- 'win', 'loss', or 'tie'
  p_score INTEGER
)
RETURNS VOID AS $$
BEGIN
  UPDATE public.user_stats
  SET
    games_played = games_played + 1,
    total_score = total_score + p_score,
    games_won = games_won + CASE WHEN p_result = 'win' THEN 1 ELSE 0 END,
    games_lost = games_lost + CASE WHEN p_result = 'loss' THEN 1 ELSE 0 END,
    games_tied = games_tied + CASE WHEN p_result = 'tie' THEN 1 ELSE 0 END
  WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
