// =====================================================
// AUTHENTICATION SERVICE
// File: src/services/auth.service.js
// =====================================================

import { supabase } from '../config/supabase';

export const authService = {
  // Sign up with email/password
  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username
        }
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign in with email/password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  // Sign in with OAuth (Google, GitHub, etc.)
  async signInWithOAuth(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign in anonymously (Guest)
  async signInAnonymously() {
    const randomId = Math.random().toString(36).substring(7);
    const guestEmail = `guest_${randomId}@jigsawverse.temp`;
    const guestPassword = Math.random().toString(36);

    const { data, error } = await supabase.auth.signUp({
      email: guestEmail,
      password: guestPassword,
      options: {
        data: {
          username: `Guest_${randomId}`,
          display_name: `Guest Player`,
          is_anonymous: true
        }
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  // Get current user
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  // Update user profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  }
};

// =====================================================
// GAME SERVICE
// File: src/services/game.service.js
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
    // Get game
    const { data: game, error: fetchError } = await supabase
      .from('games')
      .select('*')
      .eq('game_code', gameCode)
      .eq('status', 'waiting')
      .single();

    if (fetchError) throw fetchError;
    if (!game) throw new Error('Game not found');

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
      .select()
      .single();

    if (error) throw error;
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
      .eq('game_code', gameCode)
      .single();

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
  }
};

// =====================================================
// GAME STATE SERVICE (Realtime)
// File: src/services/realtime.service.js
// =====================================================

import { supabase } from '../config/supabase';

export const realtimeService = {
  // Initialize game state
  async initializeGameState(gameId, pieces, gridSize) {
    const { data, error} = await supabase
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

// =====================================================
// STORAGE SERVICE
// File: src/services/storage.service.js
// =====================================================

import { supabase, STORAGE_BUCKETS } from '../config/supabase';

export const storageService = {
  // Upload puzzle image
  async uploadPuzzleImage(userId, file) {
    // Validate file
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size must be less than 5MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .getPublicUrl(filePath);

    // Save metadata to database
    const { data: imageData, error: dbError } = await supabase
      .from('images')
      .insert({
        uploaded_by: userId,
        file_name: file.name,
        storage_path: filePath,
        storage_url: publicUrl,
        category: 'custom',
        grid_size: 100,
        is_public: true
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return {
      id: imageData.id,
      url: publicUrl,
      path: filePath
    };
  },

  // Delete image
  async deleteImage(imageId, storagePath) {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .remove([storagePath]);

    if (storageError) throw storageError;

    // Delete from database
    const { error: dbError } = await supabase
      .from('images')
      .delete()
      .eq('id', imageId);

    if (dbError) throw dbError;
  },

  // Get user's uploaded images
  async getUserImages(userId) {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get public images
  async getPublicImages(category = null, limit = 20) {
    let query = supabase
      .from('images')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  }
};

export default {
  authService,
  gameService,
  realtimeService,
  storageService
};