// =====================================================
// GAME STATE SERVICE (Realtime)
// =====================================================

import { supabase } from '../config/supabase';

export const realtimeService = {
  // Initialize game state
  async initializeGameState(gameId, pieces, gridSize) {
    const { data, error } = await supabase
      .from('game_state')
      .insert({
        game_id: gameId,
        grid: Array(gridSize).fill(null),
        player_a_rack: pieces.slice(0, 10).map(p => p.id),
        player_b_rack: pieces.slice(10, 20).map(p => p.id),
        piece_pool: pieces.slice(20).map(p => p.id),
        pieces: pieces,
        current_turn: 'playerA',
        timer_remaining: 600
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get game state
  async getGameState(gameId) {
    const { data, error } = await supabase
      .from('game_state')
      .select('*')
      .eq('game_id', gameId)
      .single();

    if (error) throw error;
    return data;
  },

  // Update game state
  async updateGameState(gameId, updates) {
    const { data, error } = await supabase
      .from('game_state')
      .update(updates)
      .eq('game_id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Subscribe to game state changes
  subscribeToGameState(gameId, callback) {
    const channel = supabase
      .channel(`game_state:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_state',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // Subscribe to game changes
  subscribeToGame(gameId, callback) {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        (payload) => callback(payload.new || payload.old)
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  },

  // Presence tracking
  async trackPresence(gameId, userId, userName) {
    const channel = supabase.channel(`presence:${gameId}`, {
      config: {
        presence: {
          key: userId
        }
      }
    });

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await channel.track({
          user_id: userId,
          user_name: userName,
          online_at: new Date().toISOString()
        });
      }
    });

    return channel;
  }
};

export default realtimeService;
