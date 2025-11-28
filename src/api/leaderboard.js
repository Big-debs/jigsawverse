// =====================================================
// LEADERBOARD API - Leaderboard and ranking endpoints
// =====================================================

import { supabase } from '../config/supabase';

// Configuration constants
const LEADERBOARD_CONFIG = {
  DEFAULT_LIMIT: 50,
  MIN_GAMES_FOR_WIN_RATE: 5,
  MIN_GAMES_FOR_ACCURACY: 5
};

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
   * Get leaderboard by win rate (minimum games required)
   * Note: Uses in-memory sorting for win rate since Supabase doesn't support 
   * computed column ordering. For large datasets, consider using a database view
   * or stored procedure with window functions.
   * @param {number} limit - Maximum entries to return
   * @param {number} offset - Offset for pagination
   * @param {number} minGames - Minimum games played to qualify
   * @returns {Promise<Array>} Leaderboard entries
   */
  async getWinRateLeaderboard(limit = LEADERBOARD_CONFIG.DEFAULT_LIMIT, offset = 0, minGames = LEADERBOARD_CONFIG.MIN_GAMES_FOR_WIN_RATE) {
    // For optimal performance with large datasets, consider creating a database view
    // that pre-calculates win_rate: (games_won::float / games_played * 100)
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .gte('games_played', minGames)
      .gt('games_won', 0);

    if (error) throw error;

    // Calculate win rate and sort (in-memory due to Supabase limitations)
    // For better scalability, create a materialized view with pre-calculated win_rate
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
   * Note: For large user bases, consider using a PostgreSQL function with
   * window functions (ROW_NUMBER() OVER (ORDER BY total_score DESC)) for
   * better performance. Example:
   * SELECT *, ROW_NUMBER() OVER (ORDER BY total_score DESC) as rank
   * FROM user_stats WHERE user_id = $1
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User's rank and surrounding entries
   */
  async getUserLeaderboardPosition(userId) {
    // First, get the user's stats and count of players with higher scores
    const { data: userStats, error: userError } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .eq('user_id', userId)
      .single();

    if (userError && userError.code !== 'PGRST116') throw userError;

    // Get total count
    const { count: totalPlayers, error: countError } = await supabase
      .from('user_stats')
      .select('*', { count: 'exact', head: true });

    if (countError) throw countError;

    if (!userStats) {
      return {
        rank: totalPlayers + 1,
        totalPlayers: totalPlayers || 0,
        userStats: null,
        nearbyPlayers: []
      };
    }

    // Count players with higher scores to determine rank
    const { count: higherScores, error: rankError } = await supabase
      .from('user_stats')
      .select('*', { count: 'exact', head: true })
      .gt('total_score', userStats.total_score);

    if (rankError) throw rankError;

    const userRank = (higherScores || 0) + 1;

    // Get nearby players (2 above and 2 below)
    const { data: nearbyData, error: nearbyError } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles!inner(id, username, display_name, avatar_url)
      `)
      .order('total_score', { ascending: false })
      .range(Math.max(0, userRank - 3), userRank + 1);

    if (nearbyError) throw nearbyError;

    const nearbyPlayers = nearbyData.map((entry, idx) => ({
      rank: Math.max(0, userRank - 2) + idx + 1,
      userId: entry.user_id,
      username: entry.profiles.username,
      displayName: entry.profiles.display_name,
      avatarUrl: entry.profiles.avatar_url,
      totalScore: entry.total_score,
      isCurrentUser: entry.user_id === userId
    }));

    return {
      rank: userRank,
      totalPlayers: totalPlayers || 0,
      userStats: {
        totalScore: userStats.total_score,
        gamesPlayed: userStats.games_played,
        gamesWon: userStats.games_won,
        winRate: userStats.games_played > 0 
          ? Math.round((userStats.games_won / userStats.games_played) * 100) 
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
