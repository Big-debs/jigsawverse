// =====================================================
// USERS API - User and authentication endpoints
// =====================================================

import { supabase } from '../config/supabase';
import { authService } from '../services/auth.service';

/**
 * Auth API - Provides endpoints for authentication
 */
export const authApi = {
  /**
   * Sign up with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} username - User display name
   * @returns {Promise<Object>} Auth response with user data
   */
  async signUp(email, password, username) {
    return authService.signUp(email, password, username);
  },

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} Auth response with session
   */
  async signIn(email, password) {
    return authService.signIn(email, password);
  },

  /**
   * Sign in with OAuth provider
   * @param {string} provider - OAuth provider ('google', 'github', etc.)
   * @returns {Promise<Object>} Auth response
   */
  async signInWithOAuth(provider) {
    return authService.signInWithOAuth(provider);
  },

  /**
   * Sign in as guest (anonymous)
   * @returns {Promise<Object>} Auth response with guest user
   */
  async signInAsGuest() {
    return authService.signInAnonymously();
  },

  /**
   * Sign out current user
   * @returns {Promise<void>}
   */
  async signOut() {
    return authService.signOut();
  },

  /**
   * Get current session
   * @returns {Promise<Object|null>} Current session or null
   */
  async getSession() {
    return authService.getSession();
  },

  /**
   * Get current authenticated user
   * @returns {Promise<Object|null>} Current user or null
   */
  async getCurrentUser() {
    return authService.getCurrentUser();
  },

  /**
   * Listen to auth state changes
   * @param {Function} callback - Callback for auth state changes
   * @returns {Object} Subscription object with unsubscribe method
   */
  onAuthStateChange(callback) {
    return authService.onAuthStateChange(callback);
  }
};

/**
 * Profiles API - Provides endpoints for user profile management
 */
export const profilesApi = {
  /**
   * Get user profile by ID
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User profile data
   */
  async getProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get profile by username
   * @param {string} username - Username to search for
   * @returns {Promise<Object|null>} User profile or null
   */
  async getProfileByUsername(username) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('username', username)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },

  /**
   * Update user profile
   * @param {string} userId - User UUID
   * @param {Object} updates - Profile fields to update
   * @returns {Promise<Object>} Updated profile data
   */
  async updateProfile(userId, updates) {
    return authService.updateProfile(userId, updates);
  },

  /**
   * Check if username is available
   * @param {string} username - Username to check
   * @returns {Promise<boolean>} True if username is available
   */
  async isUsernameAvailable(username) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .single();

    if (error && error.code === 'PGRST116') return true;
    if (error) throw error;
    return !data;
  },

  /**
   * Search for users by username
   * @param {string} query - Search query
   * @param {number} limit - Maximum results to return
   * @returns {Promise<Array>} List of matching profiles
   */
  async searchUsers(query, limit = 10) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .ilike('username', `%${query}%`)
      .limit(limit);

    if (error) throw error;
    return data;
  }
};

/**
 * User Stats API - Provides endpoints for user statistics
 */
export const userStatsApi = {
  /**
   * Get user statistics
   * @param {string} userId - User UUID
   * @returns {Promise<Object>} User statistics
   */
  async getStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data || {
      games_played: 0,
      games_won: 0,
      games_lost: 0,
      games_tied: 0,
      total_score: 0,
      best_streak: 0,
      best_accuracy: 0,
      total_playtime_seconds: 0
    };
  },

  /**
   * Update user statistics
   * @param {string} userId - User UUID
   * @param {Object} updates - Stats fields to update
   * @returns {Promise<Object>} Updated stats
   */
  async updateStats(userId, updates) {
    const { data, error } = await supabase
      .from('user_stats')
      .upsert({
        user_id: userId,
        ...updates
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get win rate for a user
   * @param {string} userId - User UUID
   * @returns {Promise<number>} Win rate percentage
   */
  async getWinRate(userId) {
    const stats = await this.getStats(userId);
    if (!stats || stats.games_played === 0) return 0;
    return Math.round((stats.games_won / stats.games_played) * 100);
  },

  /**
   * Get user's rank based on total score
   * @param {string} userId - User UUID
   * @returns {Promise<number>} User's rank
   */
  async getUserRank(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('user_id, total_score')
      .order('total_score', { ascending: false });

    if (error) throw error;

    const rank = data.findIndex(s => s.user_id === userId) + 1;
    return rank || data.length + 1;
  }
};

export default {
  authApi,
  profilesApi,
  userStatsApi
};
