// =====================================================
// LEADERBOARD API - Leaderboard and ranking endpoints
// =====================================================

import { supabase } from '../config/supabase';

/**
 * Leaderboard API - Provides endpoints for leaderboard data
 */
export const leaderboardApi = {
  /**
   * Get global leaderboard by total score
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Leaderboard entries with user data
   */
  async getGlobalLeaderboard(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .order('total_score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      totalScore: entry.total_score,
      gamesPlayed: entry.games_played,
      gamesWon: entry.games_won,
      winRate: entry.games_played > 0 
        ? Math.round((entry.games_won / entry.games_played) * 100) 
        : 0,
      bestStreak: entry.best_streak,
      bestAccuracy: entry.best_accuracy
    }));
  },

  /**
   * Get leaderboard by win count
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getWinsLeaderboard(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .gt('games_won', 0)
      .order('games_won', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      gamesWon: entry.games_won,
      gamesPlayed: entry.games_played,
      winRate: entry.games_played > 0 
        ? Math.round((entry.games_won / entry.games_played) * 100) 
        : 0
    }));
  },

  /**
   * Get leaderboard by win rate (minimum 5 games)
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @param {number} minGames - Minimum games played to qualify
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getWinRateLeaderboard(limit = 50, offset = 0, minGames = 5) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .gte('games_played', minGames);

    if (error) throw error;

    // Calculate win rate and sort
    const sorted = data
      .map(entry => ({
        ...entry,
        winRate: Math.round((entry.games_won / entry.games_played) * 100)
      }))
      .sort((a, b) => b.winRate - a.winRate)
      .slice(offset, offset + limit);

    return sorted.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      winRate: entry.winRate,
      gamesWon: entry.games_won,
      gamesPlayed: entry.games_played
    }));
  },

  /**
   * Get leaderboard by best streak
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getStreakLeaderboard(limit = 50, offset = 0) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .gt('best_streak', 0)
      .order('best_streak', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      bestStreak: entry.best_streak,
      gamesPlayed: entry.games_played
    }));
  },

  /**
   * Get leaderboard by accuracy (minimum 5 games)
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @param {number} minGames - Minimum games played to qualify
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getAccuracyLeaderboard(limit = 50, offset = 0, minGames = 5) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .gte('games_played', minGames)
      .gt('best_accuracy', 0)
      .order('best_accuracy', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    return data.map((entry, index) => ({
      rank: offset + index + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      bestAccuracy: entry.best_accuracy,
      gamesPlayed: entry.games_played
    }));
  },

  /**
   * Get user's position on the global leaderboard
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User's rank and surrounding entries
   */
  async getUserLeaderboardPosition(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .order('total_score', { ascending: false });

    if (error) throw error;

    const userIndex = data.findIndex(entry => entry.user_id === userId);
    
    if (userIndex === -1) {
      return {
        rank: data.length + 1,
        totalPlayers: data.length,
        userStats: null,
        nearbyPlayers: []
      };
    }

    // Get 2 players above and below
    const start = Math.max(0, userIndex - 2);
    const end = Math.min(data.length, userIndex + 3);
    const nearbyPlayers = data.slice(start, end).map((entry, idx) => ({
      rank: start + idx + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      totalScore: entry.total_score,
      isCurrentUser: entry.user_id === userId
    }));

    const userEntry = data[userIndex];

    return {
      rank: userIndex + 1,
      totalPlayers: data.length,
      userStats: {
        totalScore: userEntry.total_score,
        gamesPlayed: userEntry.games_played,
        gamesWon: userEntry.games_won,
        winRate: userEntry.games_played > 0 
          ? Math.round((userEntry.games_won / userEntry.games_played) * 100) 
          : 0
      },
      nearbyPlayers
    };
  },

  /**
   * Get recent game results (for activity feed)
   * @param {number} limit - Maximum entries to return
   * @returns {Promise<Array>} Recent completed games
   */
  async getRecentGames(limit = 20) {
    const { data, error } = await supabase
      .from('games')
      .select(`
        id,
        game_code,
        player_a_name,
        player_a_score,
        player_b_name,
        player_b_score,
        winner,
        completed_at
      `)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return data.map(game => ({
      gameId: game.id,
      gameCode: game.game_code,
      playerA: {
        name: game.player_a_name,
        score: game.player_a_score
      },
      playerB: {
        name: game.player_b_name,
        score: game.player_b_score
      },
      winner: game.winner,
      completedAt: game.completed_at
    }));
  },

  /**
   * Get total player count
   * @returns {Promise<number>} Total number of players
   */
  async getTotalPlayerCount() {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;
    return count;
  },

  /**
   * Get total games played count
   * @returns {Promise<number>} Total number of completed games
   */
  async getTotalGamesCount() {
    const { count, error } = await supabase
      .from('games')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed');

    if (error) throw error;
    return count;
  }
};

export default leaderboardApi;
