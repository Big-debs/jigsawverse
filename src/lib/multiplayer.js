// =====================================================
// MULTIPLAYER GAME FLOW - USING BROADCAST
// =====================================================

import { supabase } from '../config/supabase';
import { gameService, realtimeService, storageService } from '../services';
import { ImageProcessor, GameLogic } from './gameLogic';

// =====================================================
// CONNECTION STATE CONSTANTS
// =====================================================

const CHANNEL_STATUS = {
  SUBSCRIBED: 'SUBSCRIBED',
  CLOSED: 'CLOSED',
  CHANNEL_ERROR: 'CHANNEL_ERROR',
  TIMED_OUT: 'TIMED_OUT'
};

const RECONNECT_CONFIG = {
  BASE_DELAY: 1000,
  MAX_DELAY: 15000,      // Reduced from 30000
  MAX_ATTEMPTS: 3,        // Reduced from 5
  CHANNEL_TIMEOUT: 10000  // Reduced from 30000
};

// Cache the authenticated user at module level
let cachedUser = null;
let cachedUserId = null;

/**
 * Ensure user has a valid session and realtime is authenticated
 */
async function ensureAuthenticated() {
  // Return cached user if available and session is valid
  if (cachedUser && cachedUserId) {
    // Quick session check without network call
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id === cachedUserId) {
      return cachedUser;
    }
  }

  // Full authentication flow only when needed
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error) {
    throw new Error('Failed to get session: ' + error.message);
  }
  
  if (!session) {
    console.log('No session found, signing in anonymously...');
    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    
    if (signInError) {
      throw new Error('Anonymous sign-in failed: ' + signInError.message);
    }
    
    if (!data.session) {
      throw new Error('No session after anonymous sign-in');
    }
    
    await supabase.auth.updateUser({
      data: {
        username: `Guest_${Date.now() % 10000}`,
        display_name: 'Guest Player',
        is_anonymous: true
      }
    });
    
    if (data.session?.access_token) {
      supabase.realtime.setAuth(data.session.access_token);
      console.log('Realtime auth token set for new session');
    }
    
    console.log('Anonymous sign-in successful');
    cachedUser = data.user;
    cachedUserId = data.user.id;
    return data.user;
  }
  
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
    console.log('Realtime auth token set for existing session');
  }
  
  cachedUser = session.user;
  cachedUserId = session.user.id;
  return session.user;
}

// =====================================================
// 1. CREATE GAME (Host)
// =====================================================

export class MultiplayerGameHost {
  constructor() {
    this.gameId = null;
    this.userId = null;
    this.userName = null;
    this.gameLogic = null;
    this.realtimeChannel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = RECONNECT_CONFIG.MAX_ATTEMPTS;
  }

  async createGame(imageFile, settings = {}) {
    try {
      const user = await ensureAuthenticated();
      this.userId = user.id;
      this.userName = user.user_metadata?.username || 'Player A';

      console.log('Authenticated as:', this.userName, '(ID:', this.userId, ')');

      console.log('Step 1: Uploading image...');
      const { id: imageId, url: imageUrl } = await storageService.uploadPuzzleImage(
        this.userId,
        imageFile
      );

      // Store image URL for preview
      this.imageUrl = imageUrl;

      console.log('Step 2: Processing image into pieces...');
      const processor = new ImageProcessor(imageUrl, settings.gridSize || 10);
      await processor.loadImage();
      const { pieces, gridDimensions } = await processor.sliceImage();

      console.log('Step 3: Creating game record...');
      const game = await gameService.createGame(this.userId, {
        mode: 'multiplayer',
        gridSize: gridDimensions.totalPieces,
        timeLimit: settings.timeLimit || 600,
        imageId: imageId,
        playerAName: this.userName
      });

      this.gameId = game.id;

      console.log('Step 4: Initializing game logic...');
      this.gameLogic = new GameLogic(gridDimensions.totalPieces, pieces, settings.mode || 'CLASSIC');
      this.gameLogic.initialize();

      console.log('Step 5: Setting up realtime state...');
      await realtimeService.initializeGameState(
        game.id,
        pieces,
        gridDimensions.totalPieces,
        settings.mode || 'CLASSIC'
      );

      console.log('Step 6: Setting up realtime channel (broadcast)...');
      this.realtimeChannel = await this.setupBroadcastChannel(game.id);

      console.log('✅ Game created successfully!');
      return {
        gameId: game.id,
        gameCode: game.game_code,
        game: game,
        pieces: pieces,
        gridDimensions: gridDimensions,
        gameState: this.gameLogic.getGameState()
      };

    } catch (error) {
      console.error('Error creating game:', error);
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Setup broadcast channel for real-time game updates
   * Uses Broadcast instead of postgres_changes for reliability
   */
  setupBroadcastChannel(gameId) {
    return new Promise((resolve, reject) => {
      let channel = null;
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.error('Channel subscription timeout');
          if (channel) {
            supabase.removeChannel(channel). catch(console.error);
          }
          reject(new Error('Channel subscription timeout'));
        }
      }, RECONNECT_CONFIG. CHANNEL_TIMEOUT);

      console.log('Creating broadcast channel for game:', gameId);

      channel = supabase. channel(`game:${gameId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: this.userId }
        }
      });

      // Listen for game state updates via broadcast
      channel.on('broadcast', { event: 'game_state' }, (payload) => {
        console.log('Received game state broadcast:', payload);
        if (payload.payload) {
          this.handleGameStateUpdate(payload.payload);
        }
      });

      // Listen for game metadata updates via broadcast
      channel.on('broadcast', { event: 'game_meta' }, (payload) => {
        console.log('Received game meta broadcast:', payload);
        if (payload.payload) {
          this.handleGameUpdate(payload.payload);
        }
      });

      // Listen for player join notifications
      channel.on('broadcast', { event: 'player_joined' }, (payload) => {
        console.log('Player joined via broadcast:', payload);
        if (payload.payload && this.onOpponentJoin) {
          this.onOpponentJoin(payload.payload. playerName);
        }
      });

      // Presence events
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('Presence sync:', state);
        this.handlePresenceSync(state);
      });

      channel.on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log('Presence join:', newPresences);
        this.handlePlayerJoin(newPresences);
      });

      channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log('Presence leave:', leftPresences);
        this.handlePlayerLeave(leftPresences);
      });

      // Subscribe to the channel
      channel.subscribe(async (status, err) => {
        console.log('Channel status:', status, err ? `Error: ${err.message}` : '');
        
        if (isResolved) return;
        
        if (status === CHANNEL_STATUS.SUBSCRIBED) {
          isResolved = true;
          clearTimeout(timeoutId);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Subscribed to broadcast channel');
          
          // Track presence
          try {
            await channel.track({
              user_id: this.userId,
              user_name: this.userName,
              role: 'host',
              online_at: new Date().toISOString()
            });
            console.log('Presence tracked successfully');
          } catch (trackErr) {
            console.warn('Failed to track presence:', trackErr);
          }
          
          if (this.onConnectionChange) {
            this.onConnectionChange('connected');
          }
          
          resolve(channel);
        } else if (status === CHANNEL_STATUS.CHANNEL_ERROR || status === CHANNEL_STATUS.TIMED_OUT) {
          console.error('Channel error:', status, err);
          this.isConnected = false;
          
          if (this.onConnectionChange) {
            this.onConnectionChange('error');
          }
          
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            supabase.removeChannel(channel).catch(console.error);
            reject(new Error(`Channel failed: ${status}`));
          }
        } else if (status === CHANNEL_STATUS.CLOSED) {
          this.isConnected = false;
          if (this.onConnectionChange) {
            this.onConnectionChange('disconnected');
          }
        }
      });
    });
  }

  /**
   * Broadcast game state to all connected players
   */
  async broadcastGameState() {
    if (! this.realtimeChannel || !this.gameLogic) return;

    const state = this.gameLogic.getGameState();
    
    try {
      await this.realtimeChannel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: state
      });
      console.log('Game state broadcasted');
    } catch (err) {
      console.error('Failed to broadcast game state:', err);
    }
  }

  /**
   * Broadcast game metadata update
   */
  async broadcastGameMeta(game) {
    if (!this.realtimeChannel) return;

    try {
      await this.realtimeChannel.send({
        type: 'broadcast',
        event: 'game_meta',
        payload: game
      });
      console.log('Game meta broadcasted');
    } catch (err) {
      console.error('Failed to broadcast game meta:', err);
    }
  }

  handleGameStateUpdate(newState) {
    if (!this.gameLogic) return;
    console.log('📥 Host received state with pendingCheck:', newState.pendingCheck);
    // Use existing pieces array from gameLogic, not from newState (which doesn't include pieces)
    this.gameLogic.importGameState(newState, this.gameLogic.pieces);
    if (this.onStateUpdate) {
      this.onStateUpdate(this.gameLogic.getGameState());
    }
  }

  handleGameUpdate(game) {
    if (this.onGameUpdate) {
      this.onGameUpdate(game);
    }

    if (game.status === 'active' && game.player_b_id) {
      console.log('Player B joined!  Game starting...');
      if (this.onOpponentJoin) {
        this.onOpponentJoin(game.player_b_name);
      }
    }
  }

  handlePresenceSync(state) {
    const players = Object.values(state). flat();
    console.log('Players in game:', players);
    
    // Check if opponent joined via presence
    const opponent = players.find(p => p.user_id !== this.userId);
    if (opponent && this.onOpponentJoin) {
      this.onOpponentJoin(opponent.user_name || 'Opponent');
    }
    
    if (this.onPresenceUpdate) {
      this.onPresenceUpdate(players);
    }
  }

  handlePlayerJoin(presences) {
    console.log('Player joined:', presences);
    if (this.onPlayerJoin) {
      this.onPlayerJoin(presences);
    }
    
    // Notify about opponent joining
    const opponent = presences. find(p => p.user_id !== this.userId);
    if (opponent && this.onOpponentJoin) {
      this.onOpponentJoin(opponent.user_name || 'Opponent');
    }
  }

  handlePlayerLeave(presences) {
    if (this.onPlayerLeave) {
      this.onPlayerLeave(presences);
    }
  }

  async makeMove(pieceId, gridIndex) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const currentPlayer = 'playerA';
    const result = this.gameLogic.placePiece(currentPlayer, pieceId, gridIndex);

    if (!result.success) {
      throw new Error(result.message);
    }

    // Run database updates in PARALLEL instead of sequential
    await Promise.all([
      realtimeService.updateGameState(this.gameId, {
        grid: this.gameLogic.grid.map(p => p ? { 
          id: p.id, 
          correctPosition: p.correctPosition 
        } : null),
        player_a_rack: this.gameLogic.playerARack.map(p => p ? p.id : null),
        player_b_rack: this.gameLogic.playerBRack.map(p => p ? p.id : null),
        piece_pool: this.gameLogic.piecePool.map(p => p.id),
        current_turn: this.gameLogic.currentTurn,
        pending_check: this.gameLogic.pendingCheck,
        awaiting_decision: result.awaitingCheck ? 'opponent_check' : null,
        move_history: this.gameLogic.moveHistory,
        timer_remaining: this.gameLogic.timerRemaining
      }),
      gameService.updateGame(this.gameId, {
        player_a_score: this.gameLogic.scores.playerA.score,
        player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
        player_a_streak: this.gameLogic.scores.playerA.streak
      })
    ]);

    // Broadcast state to opponent after DB updates complete
    console.log('📤 Host broadcasting state with pendingCheck:', this.gameLogic.pendingCheck);
    await this.broadcastGameState();

    return result;
  }

  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerA', decision);

    // Persist updated game state including current_turn and scores
    await Promise.all([
      realtimeService.updateGameState(this.gameId, {
        ...this.gameLogic.exportForDatabase(),
        awaiting_decision: null // Clear awaiting_decision after resolution
      }),
      gameService.updateGame(this.gameId, {
        player_a_score: this.gameLogic.scores.playerA.score,
        player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
        player_a_streak: this.gameLogic.scores.playerA.streak,
        player_b_score: this.gameLogic.scores.playerB.score,
        player_b_accuracy: this.gameLogic.scores.playerB.accuracy,
        player_b_streak: this.gameLogic.scores.playerB.streak
      })
    ]);

    // Broadcast state to opponent
    await this.broadcastGameState();

    return result;
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this.realtimeChannel) {
      try {
        await supabase.removeChannel(this.realtimeChannel);
      } catch (err) {
        console.error('Error cleaning up channel:', err);
      }
      this.realtimeChannel = null;
    }

    this.onStateUpdate = null;
    this.onGameUpdate = null;
    this.onPresenceUpdate = null;
    this.onPlayerJoin = null;
    this.onPlayerLeave = null;
    this.onOpponentJoin = null;
    this.onConnectionChange = null;

    console.log('Disconnected from game');
  }
}

// =====================================================
// 2.  JOIN GAME (Guest)
// =====================================================

export class MultiplayerGameGuest {
  constructor() {
    this.gameId = null;
    this.userId = null;
    this.userName = null;
    this.gameLogic = null;
    this.realtimeChannel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = RECONNECT_CONFIG.MAX_ATTEMPTS;
  }

  async joinGame(gameCode) {
    try {
      const user = await ensureAuthenticated();
      this.userId = user.id;
      this.userName = user.user_metadata?.username || 'Player B';

      console.log('Authenticated as:', this.userName, '(ID:', this.userId, ')');

      console.log('Step 1: Finding game by code...');
      const game = await gameService.getGameByCode(gameCode);
      
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Game is not accepting players');
      }

      this.gameId = game.id;

      // Store image URL for preview
      this.imageUrl = game.images?.storage_url || null;

      if (!this.imageUrl) {
        throw new Error('Game image URL not found');
      }

      console.log('Step 2: Joining game as Player B...');
      await gameService.joinGame(gameCode, this.userId, this.userName);

      console.log('Step 3: Loading game state...');
      const gameState = await realtimeService.getGameState(game.id);

      console.log('Step 4: Regenerating pieces with imageData from image URL...');
      // Guest needs to reconstruct pieces with imageData since it's not stored in DB
      const processor = new ImageProcessor(this.imageUrl, Math.round(Math.sqrt(game.grid_size)));
      await processor.loadImage();
      const { pieces } = await processor.sliceImage();

      console.log('Step 5: Initializing game logic with full pieces...');
      this.gameLogic = new GameLogic(game.grid_size, pieces, gameState?.gameplay_mode || 'CLASSIC');
      this.gameLogic.importGameState(gameState, pieces);

      console.log('Step 6: Setting up realtime channel (broadcast)...');
      this.realtimeChannel = await this.setupBroadcastChannel(game.id);

      // Notify host that we joined
      await this.notifyPlayerJoined();

      console.log('✅ Successfully joined game!');
      return {
        gameId: game.id,
        game: game,
        gameState: this.gameLogic.getGameState()
      };

    } catch (error) {
      console.error('Error joining game:', error);
      await this.disconnect();
      throw error;
    }
  }

  /**
   * Setup broadcast channel for real-time game updates
   */
  setupBroadcastChannel(gameId) {
    return new Promise((resolve, reject) => {
      let channel = null;
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.error('Channel subscription timeout');
          if (channel) {
            supabase.removeChannel(channel).catch(console.error);
          }
          reject(new Error('Channel subscription timeout'));
        }
      }, RECONNECT_CONFIG.CHANNEL_TIMEOUT);

      console.log('Creating broadcast channel for game:', gameId);

      channel = supabase.channel(`game:${gameId}`, {
        config: {
          broadcast: { self: false },
          presence: { key: this.userId }
        }
      });

      // Listen for game state updates via broadcast
      channel.on('broadcast', { event: 'game_state' }, (payload) => {
        console.log('Received game state broadcast:', payload);
        if (payload.payload) {
          this.handleGameStateUpdate(payload.payload);
        }
      });

      // Listen for game metadata updates via broadcast
      channel.on('broadcast', { event: 'game_meta' }, (payload) => {
        console.log('Received game meta broadcast:', payload);
        if (payload.payload) {
          this.handleGameUpdate(payload.payload);
        }
      });

      // Presence events
      channel.on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        console.log('Presence sync:', state);
        this.handlePresenceSync(state);
      });

      // Subscribe to the channel
      channel.subscribe(async (status, err) => {
        console.log('Channel status:', status, err ? `Error: ${err.message}` : '');
        
        if (isResolved) return;
        
        if (status === CHANNEL_STATUS.SUBSCRIBED) {
          isResolved = true;
          clearTimeout(timeoutId);
          this.isConnected = true;
          this.reconnectAttempts = 0;
          console.log('✅ Subscribed to broadcast channel');
          
          // Track presence
          try {
            await channel.track({
              user_id: this.userId,
              user_name: this.userName,
              role: 'guest',
              online_at: new Date(). toISOString()
            });
            console.log('Presence tracked successfully');
          } catch (trackErr) {
            console.warn('Failed to track presence:', trackErr);
          }
          
          if (this.onConnectionChange) {
            this.onConnectionChange('connected');
          }
          
          resolve(channel);
        } else if (status === CHANNEL_STATUS.CHANNEL_ERROR || status === CHANNEL_STATUS.TIMED_OUT) {
          console.error('Channel error:', status, err);
          this.isConnected = false;
          
          if (this.onConnectionChange) {
            this.onConnectionChange('error');
          }
          
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            supabase.removeChannel(channel).catch(console.error);
            reject(new Error(`Channel failed: ${status}`));
          }
        } else if (status === CHANNEL_STATUS.CLOSED) {
          this.isConnected = false;
          if (this.onConnectionChange) {
            this.onConnectionChange('disconnected');
          }
        }
      });
    });
  }

  /**
   * Notify host that this player joined
   */
  async notifyPlayerJoined() {
    if (! this.realtimeChannel) return;

    try {
      await this.realtimeChannel.send({
        type: 'broadcast',
        event: 'player_joined',
        payload: {
          playerId: this.userId,
          playerName: this.userName
        }
      });
      console.log('Notified host of join');
    } catch (err) {
      console.error('Failed to notify host:', err);
    }
  }

  /**
   * Broadcast game state to all connected players
   */
  async broadcastGameState() {
    if (!this.realtimeChannel || !this.gameLogic) return;

    const state = this.gameLogic.getGameState();
    
    try {
      await this.realtimeChannel.send({
        type: 'broadcast',
        event: 'game_state',
        payload: state
      });
      console.log('Game state broadcasted');
    } catch (err) {
      console.error('Failed to broadcast game state:', err);
    }
  }

  handleGameStateUpdate(newState) {
    if (!this.gameLogic) return;
    console.log('📥 Guest received state with pendingCheck:', newState.pendingCheck);
    // Use existing pieces array from gameLogic, not from newState (which doesn't include pieces)
    this.gameLogic.importGameState(newState, this.gameLogic.pieces);
    if (this.onStateUpdate) {
      this.onStateUpdate(this.gameLogic.getGameState());
    }
  }

  handleGameUpdate(game) {
    if (this.onGameUpdate) {
      this.onGameUpdate(game);
    }
  }

  handlePresenceSync(state) {
    const players = Object.values(state).flat();
    if (this.onPresenceUpdate) {
      this.onPresenceUpdate(players);
    }
  }

  async makeMove(pieceId, gridIndex) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const currentPlayer = 'playerB';
    const result = this.gameLogic.placePiece(currentPlayer, pieceId, gridIndex);

    if (!result.success) {
      throw new Error(result.message);
    }

    // Run database updates in PARALLEL instead of sequential
    await Promise.all([
      realtimeService.updateGameState(this.gameId, {
        grid: this.gameLogic.grid.map(p => p ? { 
          id: p.id, 
          correctPosition: p.correctPosition 
        } : null),
        player_a_rack: this.gameLogic.playerARack.map(p => p ? p.id : null),
        player_b_rack: this.gameLogic.playerBRack.map(p => p ? p.id : null),
        piece_pool: this.gameLogic.piecePool.map(p => p.id),
        current_turn: this.gameLogic.currentTurn,
        pending_check: this.gameLogic.pendingCheck,
        awaiting_decision: result.awaitingCheck ? 'opponent_check' : null,
        move_history: this.gameLogic.moveHistory,
        timer_remaining: this.gameLogic.timerRemaining
      }),
      gameService.updateGame(this.gameId, {
        player_b_score: this.gameLogic.scores.playerB.score,
        player_b_accuracy: this.gameLogic.scores.playerB.accuracy,
        player_b_streak: this.gameLogic.scores.playerB.streak
      })
    ]);

    // Broadcast state to host after DB updates complete
    console.log('📤 Guest broadcasting state with pendingCheck:', this.gameLogic.pendingCheck);
    await this.broadcastGameState();

    return result;
  }

  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerB', decision);

    // Persist updated game state including current_turn and scores
    await Promise.all([
      realtimeService.updateGameState(this.gameId, {
        ...this.gameLogic.exportForDatabase(),
        awaiting_decision: null // Clear awaiting_decision after resolution
      }),
      gameService.updateGame(this.gameId, {
        player_a_score: this.gameLogic.scores.playerA.score,
        player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
        player_a_streak: this.gameLogic.scores.playerA.streak,
        player_b_score: this.gameLogic.scores.playerB.score,
        player_b_accuracy: this.gameLogic.scores.playerB.accuracy,
        player_b_streak: this.gameLogic.scores.playerB.streak
      })
    ]);

    // Broadcast state to host
    await this.broadcastGameState();

    return result;
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this.realtimeChannel) {
      try {
        await supabase.removeChannel(this.realtimeChannel);
      } catch (err) {
        console.error('Error cleaning up channel:', err);
      }
      this.realtimeChannel = null;
    }

    this.onStateUpdate = null;
    this.onGameUpdate = null;
    this.onPresenceUpdate = null;
    this.onConnectionChange = null;

    console.log('Disconnected from game');
  }
}

export default {
  MultiplayerGameHost,
  MultiplayerGameGuest
};
