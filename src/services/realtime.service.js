// =====================================================
// GAME STATE SERVICE (Realtime)
// =====================================================

import { supabase } from '../config/supabase';

export const realtimeService = {
  // Initialize game state
  async initializeGameState(gameId, pieces, gridSize) {
    // Store only piece metadata, not the full imageData
    const piecesMetadata = pieces.map(p => ({
      id: p.id,
      correctPosition: p.correctPosition,
      row: p.row,
      col: p.col,
      isEdge: p.isEdge,
      edges: p.edges
      // imageData is NOT stored - it's reconstructed client-side
    }));

    // Ensure we're creating an array of null values, not undefined
    const emptyGrid = [];
    for (let i = 0; i < gridSize; i++) {
      emptyGrid.push(null);
    }
    
    const { data, error } = await supabase
      .from('game_state')
      .insert({
        game_id: gameId,
        grid: emptyGrid,  // Explicit null array
        player_a_rack: pieces.slice(0, 10).map(p => p.id),
        player_b_rack: pieces.slice(10, 20).map(p => p.id),
        piece_pool: pieces.slice(20).map(p => p.id),
        pieces: piecesMetadata,  // Smaller payload without imageData
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

  // Get presence state for a game (requires existing channel)
  getPresenceState(channel) {
    if (!channel) {
      console.warn('No channel provided to getPresenceState');
      return {};
    }
    return channel.presenceState();
  },

  // Broadcast a custom event to all players in the game
  async broadcastEvent(gameId, eventType, payload) {
    return new Promise((resolve, reject) => {
      const channel = supabase.channel(`broadcast:${gameId}`);
      
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          channel.send({
            type: 'broadcast',
            event: eventType,
            payload
          }).then(() => {
            // Cleanup after successful send with a small delay
            setTimeout(async () => {
              await supabase.removeChannel(channel);
              resolve();
            }, 500);
          }).catch((err) => {
            supabase.removeChannel(channel);
            reject(err);
          });
        }
      });
    });
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
