// =====================================================
// USER SERVICE
// =====================================================

import { supabase } from '../config/supabase';

export const userService = {
  // Get user stats
  async getUserStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Create stats if they don't exist
      if (error.code === 'PGRST116') {
        return this.createUserStats(userId);
      }
      throw error;
    }
    return data;
  },

  // Create user stats
  async createUserStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .insert({
        user_id: userId,
        games_played: 0,
        games_won: 0,
        games_lost: 0,
        total_score: 0,
        best_streak: 0,
        average_accuracy: 100
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update user stats
  async updateUserStats(userId, updates) {
    const { data, error } = await supabase
      .from('user_stats')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get leaderboard
  async getLeaderboard(limit = 100) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles:user_id (
          username,
          avatar_url
        )
      `)
      .order('total_score', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
};

export default userService;
