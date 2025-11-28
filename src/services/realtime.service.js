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

  // Subscribe to game state changes with reconnection support
  subscribeToGameState(gameId, callback, onStatusChange = null) {
    const channel = supabase
      .channel(`game_state:${gameId}`, {
        config: {
          broadcast: {
            self: false
          }
        }
      })
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
      .subscribe((status) => {
        if (onStatusChange) {
          onStatusChange(status);
        }
      });

    return () => supabase.removeChannel(channel);
  },

  // Subscribe to game changes with reconnection support
  subscribeToGame(gameId, callback, onStatusChange = null) {
    const channel = supabase
      .channel(`game:${gameId}`, {
        config: {
          broadcast: {
            self: false
          }
        }
      })
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
      .subscribe((status) => {
        if (onStatusChange) {
          onStatusChange(status);
        }
      });

    return () => supabase.removeChannel(channel);
  },

  // Enhanced presence tracking with heartbeat
  async trackPresence(gameId, userId, userName) {
    const channel = supabase.channel(`presence:${gameId}`, {
      config: {
        presence: {
          key: userId
        }
      }
    });

    let heartbeatInterval = null;

    await channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Initial presence track
        await channel.track({
          user_id: userId,
          user_name: userName,
          online_at: new Date().toISOString(),
          last_heartbeat: new Date().toISOString()
        });

        // Setup heartbeat to keep presence alive
        heartbeatInterval = setInterval(async () => {
          try {
            await channel.track({
              user_id: userId,
              user_name: userName,
              online_at: new Date().toISOString(),
              last_heartbeat: new Date().toISOString()
            });
          } catch (err) {
            console.error('Presence heartbeat error:', err);
          }
        }, 30000); // Every 30 seconds
      }
    });

    // Return channel with cleanup function
    const cleanup = async () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
      await channel.untrack();
      await supabase.removeChannel(channel);
    };

    channel.cleanup = cleanup;
    return channel;
  },

  // Get presence state for a game
  async getPresenceState(gameId) {
    const channel = supabase.channel(`presence:${gameId}`);
    return channel.presenceState();
  },

  // Broadcast a custom event to all players in the game
  async broadcastEvent(gameId, eventType, payload) {
    const channel = supabase.channel(`broadcast:${gameId}`);
    
    await channel.subscribe();
    
    channel.send({
      type: 'broadcast',
      event: eventType,
      payload
    });

    // Cleanup after sending
    setTimeout(() => {
      supabase.removeChannel(channel);
    }, 1000);
  },

  // Listen for custom broadcast events
  subscribeToEvents(gameId, eventType, callback) {
    const channel = supabase
      .channel(`broadcast:${gameId}`)
      .on('broadcast', { event: eventType }, (payload) => {
        callback(payload.payload);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }
};

export default realtimeService;
