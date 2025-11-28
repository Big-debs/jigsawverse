// =====================================================
// PRESENCE API - Player presence and realtime endpoints
// =====================================================

import { supabase } from '../config/supabase';
import { realtimeService } from '../services/realtime.service';

// Configuration constants
const PRESENCE_CONFIG = {
  // Time in milliseconds before a player is considered offline
  ONLINE_TIMEOUT_MS: 5 * 60 * 1000 // 5 minutes
};

/**
 * Presence API - Provides endpoints for player presence tracking
 */
export const presenceApi = {
  /**
   * Track player presence in a game
   * @param {string} gameId - The game UUID
   * @param {string} userId - The user UUID
   * @param {string} userName - The user's display name
   * @returns {Promise<Object>} Presence channel with cleanup function
   */
  async trackPresence(gameId, userId, userName) {
    return realtimeService.trackPresence(gameId, userId, userName);
  },

  /**
   * Get current presence state for a channel
   * @param {Object} channel - The presence channel
   * @returns {Object} Current presence state
   */
  getPresenceState(channel) {
    return realtimeService.getPresenceState(channel);
  },

  /**
   * Broadcast a custom event to all players
   * @param {string} gameId - The game UUID
   * @param {string} eventType - Type of event to broadcast
   * @param {Object} payload - Event data
   * @returns {Promise<void>}
   */
  async broadcastEvent(gameId, eventType, payload) {
    return realtimeService.broadcastEvent(gameId, eventType, payload);
  },

  /**
   * Subscribe to custom broadcast events
   * @param {string} gameId - The game UUID
   * @param {string} eventType - Type of event to listen for
   * @param {Function} callback - Callback for events
   * @returns {Function} Unsubscribe function
   */
  subscribeToEvents(gameId, eventType, callback) {
    return realtimeService.subscribeToEvents(gameId, eventType, callback);
  },

  /**
   * Update player presence in database
   * @param {string} userId - The user UUID
   * @param {string} gameId - The game UUID (optional)
   * @param {boolean} isOnline - Online status
   * @returns {Promise<Object>} Updated presence record
   */
  async updatePresence(userId, gameId = null, isOnline = true) {
    const { data, error } = await supabase
      .from('player_presence')
      .upsert({
        user_id: userId,
        game_id: gameId,
        is_online: isOnline,
        last_seen: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get online players in a game
   * @param {string} gameId - The game UUID
   * @returns {Promise<Array>} List of online players
   */
  async getOnlinePlayers(gameId) {
    const { data, error } = await supabase
      .from('player_presence')
      .select(`
        *,
        profiles!inner(username, display_name, avatar_url)
      `)
      .eq('game_id', gameId)
      .eq('is_online', true);

    if (error) throw error;
    return data;
  },

  /**
   * Get total online player count
   * @returns {Promise<number>} Count of online players
   */
  async getOnlineCount() {
    // Consider players online if seen within the configured timeout
    const timeoutThreshold = new Date(Date.now() - PRESENCE_CONFIG.ONLINE_TIMEOUT_MS).toISOString();
    
    const { count, error } = await supabase
      .from('player_presence')
      .select('*', { count: 'exact', head: true })
      .eq('is_online', true)
      .gte('last_seen', timeoutThreshold);

    if (error) throw error;
    return count;
  },

  /**
   * Mark player as offline
   * @param {string} userId - The user UUID
   * @returns {Promise<void>}
   */
  async markOffline(userId) {
    const { error } = await supabase
      .from('player_presence')
      .update({
        is_online: false,
        last_seen: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;
  },

  /**
   * Leave current game
   * @param {string} userId - The user UUID
   * @returns {Promise<void>}
   */
  async leaveGame(userId) {
    const { error } = await supabase
      .from('player_presence')
      .update({
        game_id: null,
        last_seen: new Date().toISOString()
      })
      .eq('user_id', userId);

    if (error) throw error;
  }
};

export default presenceApi;
