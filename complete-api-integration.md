# 🔌 Complete API Integration Guide for JigsawVerse

## 📋 Table of Contents
1. [Supabase Configuration](#supabase-configuration)
2. [Service Layer (API Calls)](#service-layer)
3. [Authentication APIs](#authentication-apis)
4. [Game APIs](#game-apis)
5. [Storage APIs](#storage-apis)
6. [Realtime APIs](#realtime-apis)
7. [Complete Integration Flow](#complete-integration-flow)
8. [Deployment Configuration](#deployment-configuration)

---

## 1. Supabase Configuration

### `src/config/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  }
});

// Helper to check connection
export const checkConnection = async () => {
  try {
    const { data, error } = await supabase.from('games').select('count').limit(1);
    return !error;
  } catch (err) {
    console.error('Supabase connection failed:', err);
    return false;
  }
};
```

---

## 2. Service Layer (API Calls)

### `src/services/auth.service.js`

```javascript
import { supabase } from '../config/supabase';

export const authService = {
  /**
   * Sign up new user
   * API: POST /auth/v1/signup
   */
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

  /**
   * Login user
   * API: POST /auth/v1/token?grant_type=password
   */
  async login(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  /**
   * Login with OAuth (Google, GitHub)
   * API: GET /auth/v1/authorize
   */
  async loginWithOAuth(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) throw error;
    return data;
  },

  /**
   * Guest login (anonymous)
   * API: POST /auth/v1/signup?type=anonymous
   * Note: Anonymous Sign-Ins must be enabled in Supabase Dashboard
   * (Authentication → Sign In / Providers → Anonymous Sign-Ins)
   */
  async loginAsGuest() {
    // Use Supabase's built-in anonymous sign-in
    const { data, error } = await supabase.auth.signInAnonymously();
    
    if (error) throw error;
    
    // Update user metadata with guest name
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        username: `Guest_${Math.floor(Math.random() * 10000)}`,
        is_guest: true
      }
    });
    
    if (updateError) {
      console.warn('Failed to update guest metadata:', updateError);
    }
    
    return data;
  },

  /**
   * Logout
   * API: POST /auth/v1/logout
   */
  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  /**
   * Get current user
   * API: GET /auth/v1/user
   */
  async getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
  },

  /**
   * Update user profile
   * API: PUT /auth/v1/user
   */
  async updateProfile(updates) {
    const { data, error } = await supabase.auth.updateUser({
      data: updates
    });

    if (error) throw error;
    return data;
  },

  /**
   * Reset password
   * API: POST /auth/v1/recover
   */
  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) throw error;
    return data;
  }
};
```

### `src/services/game.service.js`

```javascript
import { supabase } from '../config/supabase';

export const gameService = {
  /**
   * Create new game
   * API: POST /rest/v1/games
   */
  async createGame(userId, settings) {
    const gameCode = Math.random().toString(36).substr(2, 6).toUpperCase();
    
    const { data, error } = await supabase
      .from('games')
      .insert({
        game_code: gameCode,
        player_a_id: userId,
        player_a_name: settings.playerAName || 'Player A',
        status: 'waiting',
        mode: settings.mode || 'multiplayer',
        grid_size: settings.gridSize || 100,
        time_limit: settings.timeLimit || 600,
        image_id: settings.imageId,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get game by code
   * API: GET /rest/v1/games?game_code=eq.{code}
   */
  async getGameByCode(gameCode) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('game_code', gameCode.toUpperCase())
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get game by ID
   * API: GET /rest/v1/games?id=eq.{id}
   */
  async getGameById(gameId) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Join game as player B
   * API: PATCH /rest/v1/games?game_code=eq.{code}
   */
  async joinGame(gameCode, userId, userName) {
    const { data, error } = await supabase
      .from('games')
      .update({
        player_b_id: userId,
        player_b_name: userName,
        status: 'active',
        started_at: new Date().toISOString()
      })
      .eq('game_code', gameCode.toUpperCase())
      .eq('status', 'waiting')
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update game metadata (scores, status)
   * API: PATCH /rest/v1/games?id=eq.{id}
   */
  async updateGame(gameId, updates) {
    const { data, error } = await supabase
      .from('games')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * End game
   * API: PATCH /rest/v1/games?id=eq.{id}
   */
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
  },

  /**
   * Get user's game history
   * API: GET /rest/v1/games?or=(player_a_id.eq.{userId},player_b_id.eq.{userId})
   */
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

  /**
   * Get active games (lobby)
   * API: GET /rest/v1/games?status=eq.waiting
   */
  async getActiveGames(limit = 20) {
    const { data, error } = await supabase
      .from('games')
      .select('*')
      .eq('status', 'waiting')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
};
```

### `src/services/realtime.service.js`

```javascript
import { supabase } from '../config/supabase';

export const realtimeService = {
  /**
   * Initialize game state in realtime table
   * API: POST /rest/v1/game_state
   */
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
        pending_check: null,
        move_history: [],
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get game state
   * API: GET /rest/v1/game_state?game_id=eq.{gameId}
   */
  async getGameState(gameId) {
    const { data, error } = await supabase
      .from('game_state')
      .select('*')
      .eq('game_id', gameId)
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update game state
   * API: PATCH /rest/v1/game_state?game_id=eq.{gameId}
   */
  async updateGameState(gameId, updates) {
    const { data, error } = await supabase
      .from('game_state')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('game_id', gameId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Subscribe to game state changes (Realtime)
   * API: WebSocket connection to /realtime/v1/websocket
   */
  subscribeToGameState(gameId, callback) {
    const channel = supabase
      .channel(`game:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'game_state',
          filter: `game_id=eq.${gameId}`
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Subscribe to game metadata changes
   * API: WebSocket connection to /realtime/v1/websocket
   */
  subscribeToGame(gameId, callback) {
    const channel = supabase
      .channel(`game_meta:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'games',
          filter: `id=eq.${gameId}`
        },
        (payload) => {
          callback(payload.new);
        }
      )
      .subscribe();

    return channel;
  },

  /**
   * Track player presence
   * API: WebSocket presence tracking
   */
  async trackPresence(gameId, userId, userName) {
    const channel = supabase.channel(`presence:${gameId}`);
    
    await channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('Presence sync:', state);
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('Player joined:', newPresences);
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('Player left:', leftPresences);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: userId,
            user_name: userName,
            online_at: new Date().toISOString()
          });
        }
      });

    return channel;
  },

  /**
   * Unsubscribe from channel
   */
  async unsubscribe(channel) {
    await supabase.removeChannel(channel);
  }
};
```

### `src/services/storage.service.js`

```javascript
import { supabase } from '../config/supabase';

export const storageService = {
  /**
   * Upload puzzle image
   * API: POST /storage/v1/object/puzzle-images/{path}
   */
  async uploadPuzzleImage(userId, file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/${Date.now()}.${fileExt}`;
    const filePath = `puzzle-images/${fileName}`;

    // Upload file
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('puzzle-images')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) throw uploadError;

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('puzzle-images')
      .getPublicUrl(filePath);

    return {
      id: uploadData.path,
      url: urlData.publicUrl,
      path: filePath
    };
  },

  /**
   * Get image URL
   * API: GET /storage/v1/object/public/puzzle-images/{path}
   */
  getImageUrl(path) {
    const { data } = supabase.storage
      .from('puzzle-images')
      .getPublicUrl(path);

    return data.publicUrl;
  },

  /**
   * Delete image
   * API: DELETE /storage/v1/object/puzzle-images/{path}
   */
  async deleteImage(path) {
    const { data, error } = await supabase.storage
      .from('puzzle-images')
      .remove([path]);

    if (error) throw error;
    return data;
  },

  /**
   * Upload avatar
   * API: POST /storage/v1/object/avatars/{path}
   */
  async uploadAvatar(userId, file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${userId}/avatar.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    const { data, error } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  },

  /**
   * List user's images
   * API: GET /storage/v1/object/list/puzzle-images/{userId}
   */
  async listUserImages(userId) {
    const { data, error } = await supabase.storage
      .from('puzzle-images')
      .list(`${userId}/`, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;
    return data;
  }
};
```

### `src/services/user.service.js`

```javascript
import { supabase } from '../config/supabase';

export const userService = {
  /**
   * Get user stats
   * API: GET /rest/v1/user_stats?user_id=eq.{userId}
   */
  async getUserStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      // Create stats if they don't exist
      return this.createUserStats(userId);
    }
    return data;
  },

  /**
   * Create user stats
   * API: POST /rest/v1/user_stats
   */
  async createUserStats(userId) {
    const { data, error } = await supabase
      .from('user_stats')
      .insert({
        user_id: userId,
        games_played: 0,
        games_won: 0,
        games_lost: 0,
        total_score: 0,
        best_streak: 0,
        average_accuracy: 100
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update user stats
   * API: PATCH /rest/v1/user_stats?user_id=eq.{userId}
   */
  async updateUserStats(userId, updates) {
    const { data, error } = await supabase
      .from('user_stats')
      .update(updates)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Get leaderboard
   * API: GET /rest/v1/user_stats?order=total_score.desc
   */
  async getLeaderboard(limit = 100) {
    const { data, error } = await supabase
      .from('user_stats')
      .select(`
        *,
        profiles:user_id (
          username,
          avatar_url
        )
      `)
      .order('total_score', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }
};
```

---

## 3. Complete Integration Flow

### Example: Creating and Joining a Game

```javascript
// HOST FLOW
import { authService, gameService, storageService, realtimeService } from './services';
import { MultiplayerGameHost } from './lib/multiplayer';

async function hostGame(imageFile, settings) {
  try {
    // 1. Authenticate
    const user = await authService.getCurrentUser();
    
    // 2. Upload image
    // API: POST /storage/v1/object/puzzle-images/...
    const { id: imageId, url: imageUrl } = await storageService.uploadPuzzleImage(
      user.id, 
      imageFile
    );
    
    // 3. Process image (client-side)
    const processor = new ImageProcessor(imageUrl, settings.gridSize);
    await processor.loadImage();
    const { pieces, gridDimensions } = await processor.sliceImage();
    
    // 4. Create game record
    // API: POST /rest/v1/games
    const game = await gameService.createGame(user.id, {
      ...settings,
      imageId,
      playerAName: user.user_metadata.username
    });
    
    // 5. Initialize game state
    // API: POST /rest/v1/game_state
    await realtimeService.initializeGameState(
      game.id,
      pieces,
      gridDimensions.totalPieces
    );
    
    // 6. Set up realtime subscriptions
    // API: WebSocket /realtime/v1/websocket
    const stateChannel = realtimeService.subscribeToGameState(game.id, (newState) => {
      console.log('Game state updated:', newState);
    });
    
    const gameChannel = realtimeService.subscribeToGame(game.id, (gameData) => {
      console.log('Game metadata updated:', gameData);
    });
    
    const presenceChannel = await realtimeService.trackPresence(
      game.id,
      user.id,
      user.user_metadata.username
    );
    
    return {
      game,
      gameCode: game.game_code,
      channels: { stateChannel, gameChannel, presenceChannel }
    };
    
  } catch (error) {
    console.error('Error creating game:', error);
    throw error;
  }
}

// GUEST FLOW
async function joinGame(gameCode) {
  try {
    // 1. Authenticate
    const user = await authService.getCurrentUser();
    
    // 2. Find game by code
    // API: GET /rest/v1/games?game_code=eq.{code}
    const game = await gameService.getGameByCode(gameCode);
    
    // 3. Join game
    // API: PATCH /rest/v1/games?game_code=eq.{code}
    await gameService.joinGame(
      gameCode,
      user.id,
      user.user_metadata.username
    );
    
    // 4. Get game state
    // API: GET /rest/v1/game_state?game_id=eq.{gameId}
    const gameState = await realtimeService.getGameState(game.id);
    
    // 5. Set up realtime subscriptions
    // API: WebSocket /realtime/v1/websocket
    const stateChannel = realtimeService.subscribeToGameState(game.id, (newState) => {
      console.log('Game state updated:', newState);
    });
    
    const presenceChannel = await realtimeService.trackPresence(
      game.id,
      user.id,
      user.user_metadata.username
    );
    
    return {
      game,
      gameState,
      channels: { stateChannel, presenceChannel }
    };
    
  } catch (error) {
    console.error('Error joining game:', error);
    throw error;
  }
}

// GAMEPLAY - Making a move
async function makeMove(gameId, pieceId, gridIndex) {
  try {
    const currentState = await realtimeService.getGameState(gameId);
    
    // Update grid locally
    const newGrid = [...currentState.grid];
    newGrid[gridIndex] = { id: pieceId, correctPosition: pieceId };
    
    // Update server
    // API: PATCH /rest/v1/game_state?game_id=eq.{gameId}
    await realtimeService.updateGameState(gameId, {
      grid: newGrid,
      current_turn: currentState.current_turn === 'playerA' ? 'playerB' : 'playerA',
      move_history: [
        ...currentState.move_history,
        {
          player: currentState.current_turn,
          pieceId,
          gridIndex,
          timestamp: Date.now()
        }
      ]
    });
    
    // Update game scores
    // API: PATCH /rest/v1/games?id=eq.{gameId}
    await gameService.updateGame(gameId, {
      player_a_score: currentState.current_turn === 'playerA' ? 
        currentState.player_a_score + 10 : currentState.player_a_score
    });
    
  } catch (error) {
    console.error('Error making move:', error);
    throw error;
  }
}
```

---

## 4. API Call Summary

### Authentication APIs
- `POST /auth/v1/signup` - Sign up
- `POST /auth/v1/token` - Login
- `GET /auth/v1/authorize` - OAuth login
- `POST /auth/v1/signup?type=anonymous` - Anonymous sign-in (Guest)
- `POST /auth/v1/logout` - Logout
- `GET /auth/v1/user` - Get current user
- `PUT /auth/v1/user` - Update profile

### Game APIs
- `POST /rest/v1/games` - Create game
- `GET /rest/v1/games?game_code=eq.{code}` - Get by code
- `GET /rest/v1/games?id=eq.{id}` - Get by ID
- `PATCH /rest/v1/games?game_code=eq.{code}` - Join game
- `PATCH /rest/v1/games?id=eq.{id}` - Update game

### Game State APIs
- `POST /rest/v1/game_state` - Initialize state
- `GET /rest/v1/game_state?game_id=eq.{id}` - Get state
- `PATCH /rest/v1/game_state?game_id=eq.{id}` - Update state

### Storage APIs
- `POST /storage/v1/object/puzzle-images/{path}` - Upload image
- `GET /storage/v1/object/public/puzzle-images/{path}` - Get image
- `DELETE /storage/v1/object/puzzle-images/{path}` - Delete image
- `GET /storage/v1/object/list/puzzle-images/{userId}` - List images

### Realtime APIs
- `WebSocket /realtime/v1/websocket` - All realtime connections
- Subscriptions use postgres_changes events
- Presence tracking uses presence channel events

---

## 5. Error Handling

```javascript
// Centralized error handler
export const handleApiError = (error) => {
  console.error('API Error:', error);
  
  if (error.code === 'PGRST116') {
    return 'Resource not found';
  }
  
  if (error.code === '23505') {
    return 'Duplicate entry';
  }
  
  if (error.message?.includes('JWT')) {
    return 'Session expired. Please login again.';
  }
  
  return error.message || 'An unexpected error occurred';
};
```

---

## 6. Deployment Configuration

### Supabase Dashboard Settings

**⚠️ Important: Anonymous Sign-Ins Configuration**

For guest authentication to work properly, **Anonymous Sign-Ins must be enabled in the Supabase Dashboard**:

1. Navigate to your Supabase project dashboard
2. Go to **Authentication** → **Providers**
3. Find **Anonymous Sign-Ins** in the list
4. Toggle it **ON** to enable anonymous authentication

Without this setting enabled, calls to `supabase.auth.signInAnonymously()` will fail with an error.

**Benefits of Anonymous Authentication:**
- No email confirmation required
- Provides proper authenticated sessions for WebSocket connections
- Enables realtime features (multiplayer game sync) for guest users
- Eliminates 401 Unauthorized errors on `/realtime/v1/websocket` endpoint
- Users can later convert their anonymous account to a permanent account

---

This comprehensive guide shows ALL API calls needed for your JigsawVerse multiplayer game! 🚀