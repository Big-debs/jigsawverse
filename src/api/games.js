// =====================================================
// GAMES API - Game-related endpoints
// =====================================================

import { supabase } from '../config/supabase';
import { gameService } from '../services/game.service';
import { realtimeService } from '../services/realtime.service';
import { storageService } from '../services/storage.service';

/**
 * Games API - Provides endpoints for game management
 */
export const gamesApi = {
  /**
   * Create a new game
   * @param {string} hostId - The host user ID
   * @param {Object} settings - Game settings
   * @returns {Promise<Object>} Created game data
   */
  async createGame(hostId, settings) {
    return gameService.createGame(hostId, settings);
  },

  /**
   * Join an existing game by code
   * @param {string} gameCode - The 6-character game code
   * @param {string} userId - The joining user's ID
   * @param {string} playerName - The joining player's name
   * @returns {Promise<Object>} Updated game data
   */
  async joinGame(gameCode, userId, playerName) {
    return gameService.joinGame(gameCode, userId, playerName);
  },

  /**
   * Get game by ID
   * @param {string} gameId - The game UUID
   * @returns {Promise<Object>} Game data with image info
   */
  async getGame(gameId) {
    return gameService.getGame(gameId);
  },

  /**
   * Get game by code
   * @param {string} gameCode - The 6-character game code
   * @returns {Promise<Object>} Game data with image info
   */
  async getGameByCode(gameCode) {
    return gameService.getGameByCode(gameCode);
  },

  /**
   * Get list of active (waiting) games
   * @param {number} limit - Maximum number of games to return
   * @returns {Promise<Array>} List of waiting games
   */
  async getActiveGames(limit = 10) {
    return gameService.getActiveGames(limit);
  },

  /**
   * Update game data
   * @param {string} gameId - The game UUID
   * @param {Object} updates - Fields to update
   * @returns {Promise<Object>} Updated game data
   */
  async updateGame(gameId, updates) {
    return gameService.updateGame(gameId, updates);
  },

  /**
   * Complete a game and record results
   * @param {string} gameId - The game UUID
   * @param {string} winner - Winner identifier ('playerA', 'playerB', or 'tie')
   * @param {Object} finalScores - Final scores for both players
   * @returns {Promise<Object>} Completed game data
   */
  async completeGame(gameId, winner, finalScores) {
    return gameService.completeGame(gameId, winner, finalScores);
  },

  /**
   * Delete/abandon a game
   * @param {string} gameId - The game UUID
   * @returns {Promise<void>}
   */
  async deleteGame(gameId) {
    return gameService.deleteGame(gameId);
  },

  /**
   * Get game history for a user
   * @param {string} userId - The user UUID
   * @param {number} limit - Maximum number of games to return
   * @returns {Promise<Array>} List of completed games
   */
  async getUserGameHistory(userId, limit = 20) {
    const { data, error } = await supabase
      .from('games')
      .select('*, images(*)')
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  /**
   * Get games in progress for a user
   * @param {string} userId - The user UUID
   * @returns {Promise<Array>} List of active games
   */
  async getUserActiveGames(userId) {
    const { data, error } = await supabase
      .from('games')
      .select('*, images(*)')
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .in('status', ['waiting', 'active', 'paused'])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }
};

/**
 * Game State API - Provides endpoints for real-time game state management
 */
export const gameStateApi = {
  /**
   * Initialize game state
   * @param {string} gameId - The game UUID
   * @param {Array} pieces - Array of puzzle piece objects
   * @param {number} gridSize - Total number of grid positions
   * @returns {Promise<Object>} Initial game state
   */
  async initializeGameState(gameId, pieces, gridSize) {
    return realtimeService.initializeGameState(gameId, pieces, gridSize);
  },

  /**
   * Get current game state
   * @param {string} gameId - The game UUID
   * @returns {Promise<Object>} Current game state
   */
  async getGameState(gameId) {
    return realtimeService.getGameState(gameId);
  },

  /**
   * Update game state
   * @param {string} gameId - The game UUID
   * @param {Object} updates - State updates
   * @returns {Promise<Object>} Updated game state
   */
  async updateGameState(gameId, updates) {
    return realtimeService.updateGameState(gameId, updates);
  },

  /**
   * Subscribe to game state changes
   * @param {string} gameId - The game UUID
   * @param {Function} callback - Callback for state changes
   * @param {Function} onStatusChange - Callback for connection status changes
   * @returns {Function} Unsubscribe function
   */
  subscribeToGameState(gameId, callback, onStatusChange = null) {
    return realtimeService.subscribeToGameState(gameId, callback, onStatusChange);
  },

  /**
   * Subscribe to game metadata changes
   * @param {string} gameId - The game UUID
   * @param {Function} callback - Callback for game changes
   * @param {Function} onStatusChange - Callback for connection status changes
   * @returns {Function} Unsubscribe function
   */
  subscribeToGame(gameId, callback, onStatusChange = null) {
    return realtimeService.subscribeToGame(gameId, callback, onStatusChange);
  }
};

/**
 * Game Images API - Provides endpoints for puzzle image management
 */
export const gameImagesApi = {
  /**
   * Upload a puzzle image
   * @param {string} userId - The uploader's user ID
   * @param {File} file - The image file to upload
   * @returns {Promise<Object>} Uploaded image data with URL
   */
  async uploadPuzzleImage(userId, file) {
    return storageService.uploadPuzzleImage(userId, file);
  },

  /**
   * Delete a puzzle image
   * @param {string} imageId - The image UUID
   * @param {string} storagePath - The storage path of the image
   * @returns {Promise<void>}
   */
  async deletePuzzleImage(imageId, storagePath) {
    return storageService.deleteImage(imageId, storagePath);
  },

  /**
   * Get user's uploaded images
   * @param {string} userId - The user UUID
   * @returns {Promise<Array>} List of user's images
   */
  async getUserImages(userId) {
    return storageService.getUserImages(userId);
  },

  /**
   * Get public/stock images
   * @param {string} category - Optional category filter
   * @param {number} limit - Maximum number of images to return
   * @returns {Promise<Array>} List of public images
   */
  async getPublicImages(category = null, limit = 20) {
    return storageService.getPublicImages(category, limit);
  }
};

export default {
  gamesApi,
  gameStateApi,
  gameImagesApi
};
