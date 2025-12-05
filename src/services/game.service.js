// =====================================================
// GAME SERVICE
// =====================================================

import { supabase } from '../config/supabase';

export const gameService = {
  // Create new game
  async createGame(hostId, settings) {
    const { data, error } = await supabase
      .from('games')
      .insert({
        host_id: hostId,
        mode: settings.mode || 'multiplayer',
        grid_size: settings.gridSize || 100,
        time_limit: settings.timeLimit || 600,
        image_id: settings.imageId,
        player_a_id: hostId,
        player_a_name: settings.playerAName,
        current_turn: 'playerA',
        status: 'waiting'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Join game by code
  async joinGame(gameCode, userId, playerName) {
    // Get game - use maybeSingle() to handle zero results gracefully
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('game_code', gameCode.toUpperCase())
      .eq('status', 'waiting')
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!game) throw new Error('Game not found or no longer accepting players');

    // Prevent host from joining their own game
    if (game.host_id === userId) {
      throw new Error('You cannot join your own game');
    }

    // Update game with player B
    const { data, error } = await supabase
      .from('games')
      .update({
        player_b_id: userId,
        player_b_name: playerName,
        status: 'active',
        started_at: new Date().toISOString()
      })
      .eq('id', game.id)
      .eq('status', 'waiting') // Ensure game hasn't been joined by someone else
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Game was already joined by another player');
    
    return data;
  },

  // Get game by ID
  async getGame(gameId) {
    const { data, error } = await supabase
      .from('games')
      .select('*, images(*)')
      .eq('id', gameId)
      .single();

    if (error) throw error;
    return data;
  },

  // Get game by code
  async getGameByCode(gameCode) {
    const { data, error } = await supabase
      .from('games')
      .select('*, images(*)')
      .eq('game_code', gameCode.toUpperCase())
      .maybeSingle();

    if (error) throw error;
    return data;
  },

  // Get active games (for lobby)
  async getActiveGames(limit = 10) {
    const { data, error } = await supabase
      .from('games')
      .select('*, profiles!games_host_id_fkey(username, avatar_url)')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  // Update game
  async updateGame(gameId, updates) {
    const { data, error } = await supabase
      .from('games')
      .update(updates)
      .eq('id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Complete game
  async completeGame(gameId, winner, finalScores) {
    const { data, error } = await supabase
      .from('games')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        winner,
        player_a_score: finalScores.playerA,
        player_b_score: finalScores.playerB
      })
      .eq('id', gameId)
      .select()
      .single();

    if (error) throw error;

    // Update user stats
    const game = data;
    if (winner === 'playerA') {
      await this.updateUserStatsAfterGame(game.player_a_id, 'win', finalScores.playerA);
      await this.updateUserStatsAfterGame(game.player_b_id, 'loss', finalScores.playerB);
    } else if (winner === 'playerB') {
      await this.updateUserStatsAfterGame(game.player_b_id, 'win', finalScores.playerB);
      await this.updateUserStatsAfterGame(game.player_a_id, 'loss', finalScores.playerA);
    } else {
      await this.updateUserStatsAfterGame(game.player_a_id, 'tie', finalScores.playerA);
      await this.updateUserStatsAfterGame(game.player_b_id, 'tie', finalScores.playerB);
    }

    return data;
  },

  // Update user stats after game
  async updateUserStatsAfterGame(userId, result, score) {
    const { data: stats } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    const updates = {
      games_played: (stats?.games_played || 0) + 1,
      total_score: (stats?.total_score || 0) + score
    };

    if (result === 'win') {
      updates.games_won = (stats?.games_won || 0) + 1;
    } else if (result === 'loss') {
      updates.games_lost = (stats?.games_lost || 0) + 1;
    } else {
      updates.games_tied = (stats?.games_tied || 0) + 1;
    }

    await supabase
      .from('user_stats')
      .update(updates)
      .eq('user_id', userId);
  },

  // Delete/abandon game
  async deleteGame(gameId) {
    const { error } = await supabase
      .from('games')
      .delete()
      .eq('id', gameId);

    if (error) throw error;
  },

  // Get user's game history (both completed and in-progress)
  async getUserGames(userId, limit = 10) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .or(`player_a_id.eq.${userId},player_b_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  },

  // End game with winner
  async endGame(gameId, winnerId) {
    const { data, error } = await supabase
      .from('games')
      .update({
        status: 'completed',
        winner_id: winnerId,
        completed_at: new Date().toISOString()
      })
      .eq('id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }
};

export default gameService;
