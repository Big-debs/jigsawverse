// =====================================================
// MULTIPLAYER GAME FLOW - COMPLETE IMPLEMENTATION
// =====================================================

import { supabase, setupRealtimeAuth } from '../config/supabase';
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
  MAX_DELAY: 30000,
  MAX_ATTEMPTS: 5,
  CHANNEL_TIMEOUT: 30000
};

function calculateReconnectDelay(attempt) {
  return Math.min(
    RECONNECT_CONFIG.BASE_DELAY * Math.pow(2, attempt),
    RECONNECT_CONFIG.MAX_DELAY
  );
}

/**
 * Ensure user has a valid session before connecting to Realtime
 * This fixes the race condition where WebSocket connects before auth is ready
 */
async function ensureAuthenticated() {
  const { data: { session }, error } = await supabase.auth. getSession();
  
  if (error) {
    throw new Error('Failed to get session: ' + error.message);
  }
  
  if (!session) {
    console.log('No session found, signing in anonymously.. .');
    const { data, error: signInError } = await supabase.auth.signInAnonymously();
    
    if (signInError) {
      throw new Error('Anonymous sign-in failed: ' + signInError.message);
    }
    
    if (!data.session) {
      throw new Error('No session after anonymous sign-in');
    }
    
    // Update metadata
    await supabase.auth.updateUser({
      data: {
        username: `Guest_${Date.now() % 10000}`,
        display_name: 'Guest Player',
        is_anonymous: true
      }
    });
    
    // CRITICAL: Set the realtime auth token
    await setupRealtimeAuth();
    
    console.log('Anonymous sign-in successful');
    return data.user;
  }
  
  // CRITICAL: Ensure realtime has the token even for existing sessions
  await setupRealtimeAuth();
  
  return session.user;
}

// =====================================================
// 1. CREATE GAME (Host)
// =====================================================

export class MultiplayerGameHost {
  constructor() {
    this. gameId = null;
    this.userId = null;
    this.gameLogic = null;
    this. realtimeChannel = null;
    this.presenceChannel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = RECONNECT_CONFIG. MAX_ATTEMPTS;
    this.channelId = null;
  }

  async createGame(imageFile, settings = {}) {
    try {
      // CRITICAL: Ensure authenticated before any operations
      const user = await ensureAuthenticated();
      this.userId = user. id;
      const userName = user.user_metadata?.username || 'Player A';

      console.log('Authenticated as:', userName, '(ID:', this.userId, ')');

      console.log('Step 1: Uploading image.. .');
      const { id: imageId, url: imageUrl } = await storageService.uploadPuzzleImage(
        this.userId,
        imageFile
      );

      console.log('Step 2: Processing image into pieces...');
      const processor = new ImageProcessor(imageUrl, settings. gridSize || 10);
      await processor.loadImage();
      const { pieces, gridDimensions } = await processor.sliceImage();

      console.log('Step 3: Creating game record...');
      const game = await gameService.createGame(this.userId, {
        mode: 'multiplayer',
        gridSize: gridDimensions. totalPieces,
        timeLimit: settings.timeLimit || 600,
        imageId: imageId,
        playerAName: userName
      });

      this.gameId = game.id;

      console.log('Step 4: Initializing game logic...');
      this.gameLogic = new GameLogic(gridDimensions. totalPieces, pieces);
      this.gameLogic.initialize();

      console.log('Step 5: Setting up realtime state...');
      await realtimeService. initializeGameState(
        game.id,
        pieces,
        gridDimensions.totalPieces
      );

      console.log('Step 6: Setting up realtime channel...');
      this.realtimeChannel = await this.setupRealtimeChannel(game.id);

      console. log('Step 7: Setting up presence tracking...');
      this.presenceChannel = await realtimeService.trackPresence(game.id, this.userId, userName);

      console. log('✅ Game created successfully!');
      return {
        gameId: game.id,
        gameCode: game.game_code,
        game: game,
        pieces: pieces,
        gridDimensions: gridDimensions
      };

    } catch (error) {
      console.error('Error creating game:', error);
      await this.disconnect();
      throw error;
    }
  }

  setupRealtimeChannel(gameId) {
    return new Promise((resolve, reject) => {
      // Use a simpler channel name - timestamp not needed, gameId is unique
      this.channelId = `host:${gameId}`;
      
      let channel = null;
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.error('Channel subscription timeout - cleaning up');
          if (channel) {
            supabase.removeChannel(channel). catch(console.error);
          }
          reject(new Error('Channel subscription timeout'));
        }
      }, RECONNECT_CONFIG. CHANNEL_TIMEOUT);

      console.log('Creating channel:', this.channelId);

      channel = supabase
        .channel(this.channelId, {
          config: {
            broadcast: { self: false },
            presence: { key: this.userId }
          }
        })
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'game_state',
            filter: `game_id=eq. ${gameId}`
          },
          (payload) => {
            console.log('Game state updated:', payload. new);
            this.handleGameStateUpdate(payload.new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
          },
          (payload) => {
            console.log('Game metadata updated:', payload.new);
            this. handleGameUpdate(payload.new);
          }
        )
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          console.log('Presence sync:', state);
          this.handlePresenceSync(state);
        })
        .on('presence', { event: 'join' }, ({ newPresences }) => {
          console.log('Player joined:', newPresences);
          this.handlePlayerJoin(newPresences);
        })
        .on('presence', { event: 'leave' }, ({ leftPresences }) => {
          console.log('Player left:', leftPresences);
          this.handlePlayerLeave(leftPresences);
        })
        .subscribe(async (status, err) => {
          console.log('Channel status:', status, err ?  `Error: ${err. message}` : '');
          
          if (isResolved) return;
          
          if (status === CHANNEL_STATUS. SUBSCRIBED) {
            isResolved = true;
            clearTimeout(timeoutId);
            this.isConnected = true;
            this.reconnectAttempts = 0;
            console.log('✅ Subscribed to game channel');
            
            // Track presence
            try {
              await channel.track({
                user_id: this.userId,
                online_at: new Date().toISOString()
              });
            } catch (trackErr) {
              console.warn('Failed to track presence:', trackErr);
            }
            
            if (this.onConnectionChange) {
              this.onConnectionChange('connected');
            }
            
            resolve(channel);
          } else if (status === CHANNEL_STATUS. CHANNEL_ERROR || status === CHANNEL_STATUS.TIMED_OUT) {
            console.error('Channel error:', status, err);
            this.isConnected = false;
            
            if (this. onConnectionChange) {
              this.onConnectionChange('error');
            }
            
            if (! isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              supabase.removeChannel(channel).catch(console.error);
              
              // Don't reject immediately - try to reconnect
              this.attemptReconnect(). then(() => {
                if (this.realtimeChannel) {
                  resolve(this.realtimeChannel);
                } else {
                  reject(new Error('Failed to connect after retries'));
                }
              }).catch(reject);
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

  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (this.onConnectionChange) {
        this.onConnectionChange('failed');
      }
      throw new Error('Max reconnection attempts reached');
    }

    this.reconnectAttempts++;
    const delay = calculateReconnectDelay(this.reconnectAttempts);
    
    console.log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    if (this.onConnectionChange) {
      this.onConnectionChange('reconnecting');
    }

    await new Promise(resolve => setTimeout(resolve, delay));

    // Re-verify authentication before reconnecting
    try {
      await ensureAuthenticated();
    } catch (authErr) {
      console.error('Auth check failed during reconnect:', authErr);
      throw authErr;
    }

    try {
      if (this.realtimeChannel) {
        try {
          await supabase.removeChannel(this.realtimeChannel);
        } catch (err) {
          console.warn('Error removing old channel:', err);
        }
        this.realtimeChannel = null;
      }
      
      this. realtimeChannel = await this.setupRealtimeChannel(this. gameId);
      console.log('Reconnection successful');
    } catch (err) {
      console.error('Reconnection failed:', err);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        return this.attemptReconnect();
      }
      throw err;
    }
  }

  handleGameStateUpdate(newState) {
    if (! this.gameLogic) return;
    this.gameLogic. importFromFirebase(newState, newState.pieces);
    if (this.onStateUpdate) {
      this.onStateUpdate(this.gameLogic. getGameState());
    }
  }

  handleGameUpdate(game) {
    if (this.onGameUpdate) {
      this.onGameUpdate(game);
    }

    if (game.status === 'active' && game.player_b_id) {
      console.log('Player B joined!  Game starting.. .');
      if (this.onOpponentJoin) {
        this.onOpponentJoin(game.player_b_name);
      }
    }
  }

  handlePresenceSync(state) {
    const players = Object.values(state). flat();
    if (this.onPresenceUpdate) {
      this.onPresenceUpdate(players);
    }
  }

  handlePlayerJoin(presences) {
    if (this.onPlayerJoin) {
      this.onPlayerJoin(presences);
    }
  }

  handlePlayerLeave(presences) {
    if (this. onPlayerLeave) {
      this. onPlayerLeave(presences);
    }
  }

  async makeMove(pieceId, gridIndex) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const currentPlayer = 'playerA';
    const result = this.gameLogic. placePiece(currentPlayer, pieceId, gridIndex);

    if (! result. success) {
      throw new Error(result.message);
    }

    await realtimeService.updateGameState(this.gameId, {
      grid: this.gameLogic.grid. map(p => p ?  { 
        id: p.id, 
        correctPosition: p.correctPosition 
      } : null),
      player_a_rack: this.gameLogic.playerARack. map(p => p ? p.id : null),
      player_b_rack: this.gameLogic.playerBRack.map(p => p ? p. id : null),
      piece_pool: this.gameLogic.piecePool.map(p => p. id),
      current_turn: this.gameLogic.currentTurn,
      pending_check: this.gameLogic.pendingCheck,
      awaiting_decision: result.awaitingCheck ?  'opponent_check' : null,
      move_history: this. gameLogic.moveHistory
    });

    await gameService.updateGame(this.gameId, {
      player_a_score: this.gameLogic.scores.playerA. score,
      player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
      player_a_streak: this.gameLogic.scores.playerA.streak
    });

    return result;
  }

  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerA', decision);

    await realtimeService. updateGameState(this.gameId, {
      ... this.gameLogic. exportForFirebase(),
      awaiting_decision: result.awaitingPlacerDecision ? 'placer_check' : null
    });

    await gameService.updateGame(this.gameId, {
      player_a_score: this. gameLogic.scores.playerA.score,
      player_a_accuracy: this.gameLogic. scores.playerA. accuracy,
      player_a_streak: this.gameLogic.scores.playerA.streak
    });

    return result;
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this. presenceChannel) {
      try {
        if (this.presenceChannel.cleanup) {
          await this.presenceChannel.cleanup();
        } else {
          await supabase.removeChannel(this.presenceChannel);
        }
      } catch (err) {
        console.error('Error cleaning up presence channel:', err);
      }
      this.presenceChannel = null;
    }

    if (this.realtimeChannel) {
      try {
        await supabase.removeChannel(this.realtimeChannel);
      } catch (err) {
        console.error('Error cleaning up realtime channel:', err);
      }
      this.realtimeChannel = null;
    }

    this.onStateUpdate = null;
    this.onGameUpdate = null;
    this.onPresenceUpdate = null;
    this.onPlayerJoin = null;
    this. onPlayerLeave = null;
    this.onOpponentJoin = null;
    this.onConnectionChange = null;
    this.channelId = null;

    console.log('Disconnected from game');
  }
}

// =====================================================
// 2. JOIN GAME (Guest)
// =====================================================

export class MultiplayerGameGuest {
  constructor() {
    this.gameId = null;
    this. userId = null;
    this.gameLogic = null;
    this.realtimeChannel = null;
    this.presenceChannel = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = RECONNECT_CONFIG.MAX_ATTEMPTS;
    this. channelId = null;
  }

  async joinGame(gameCode) {
    try {
      // CRITICAL: Ensure authenticated before any operations
      const user = await ensureAuthenticated();
      this.userId = user.id;
      const userName = user. user_metadata?.username || 'Player B';

      console. log('Authenticated as:', userName, '(ID:', this. userId, ')');

      console.log('Step 1: Finding game by code...');
      const game = await gameService.getGameByCode(gameCode);
      
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Game is not accepting players');
      }

      this.gameId = game.id;

      console.log('Step 2: Joining game as Player B...');
      await gameService.joinGame(gameCode, this.userId, userName);

      console.log('Step 3: Loading game state...');
      const gameState = await realtimeService.getGameState(game.id);

      console.log('Step 4: Initializing game logic.. .');
      this. gameLogic = new GameLogic(game.grid_size, gameState.pieces);
      this.gameLogic.importFromFirebase(gameState, gameState. pieces);

      console.log('Step 5: Setting up realtime channel...');
      this.realtimeChannel = await this.setupRealtimeChannel(game.id);

      console.log('Step 6: Tracking presence...');
      this.presenceChannel = await realtimeService.trackPresence(game.id, this.userId, userName);

      console. log('✅ Successfully joined game! ');
      return {
        gameId: game.id,
        game: game,
        gameState: this.gameLogic. getGameState()
      };

    } catch (error) {
      console. error('Error joining game:', error);
      await this.disconnect();
      throw error;
    }
  }

  setupRealtimeChannel(gameId) {
    return new Promise((resolve, reject) => {
      this.channelId = `guest:${gameId}`;
      
      let channel = null;
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.error('Channel subscription timeout - cleaning up');
          if (channel) {
            supabase.removeChannel(channel).catch(console.error);
          }
          reject(new Error('Channel subscription timeout'));
        }
      }, RECONNECT_CONFIG. CHANNEL_TIMEOUT);

      console. log('Creating channel:', this.channelId);

      channel = supabase
        .channel(this. channelId, {
          config: {
            broadcast: { self: false },
            presence: { key: this.userId }
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
          (payload) => {
            console.log('Game state updated:', payload.new);
            this.handleGameStateUpdate(payload. new);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${gameId}`
          },
          (payload) => {
            console.log('Game metadata updated:', payload.new);
            this.handleGameUpdate(payload.new);
          }
        )
        . on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          console. log('Presence sync:', state);
          this.handlePresenceSync(state);
        })
        . subscribe(async (status, err) => {
          console.log('Channel status:', status, err ? `Error: ${err.message}` : '');
          
          if (isResolved) return;
          
          if (status === CHANNEL_STATUS. SUBSCRIBED) {
            isResolved = true;
            clearTimeout(timeoutId);
            this. isConnected = true;
            this. reconnectAttempts = 0;
            console.log('✅ Subscribed to game channel');
            
            try {
              await channel.track({
                user_id: this.userId,
                online_at: new Date().toISOString()
              });
            } catch (trackErr) {
              console.warn('Failed to track presence:', trackErr);
            }
            
            if (this.onConnectionChange) {
              this.onConnectionChange('connected');
            }
            
            resolve(channel);
          } else if (status === CHANNEL_STATUS.CHANNEL_ERROR || status === CHANNEL_STATUS. TIMED_OUT) {
            console.error('Channel error:', status, err);
            this.isConnected = false;
            
            if (this.onConnectionChange) {
              this.onConnectionChange('error');
            }
            
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              supabase. removeChannel(channel). catch(console.error);
              
              this.attemptReconnect(). then(() => {
                if (this. realtimeChannel) {
                  resolve(this.realtimeChannel);
                } else {
                  reject(new Error('Failed to connect after retries'));
                }
              }).catch(reject);
            }
          } else if (status === CHANNEL_STATUS. CLOSED) {
            this.isConnected = false;
            if (this.onConnectionChange) {
              this.onConnectionChange('disconnected');
            }
          }
        });
    });
  }

  async attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      if (this.onConnectionChange) {
        this. onConnectionChange('failed');
      }
      throw new Error('Max reconnection attempts reached');
    }

    this.reconnectAttempts++;
    const delay = calculateReconnectDelay(this.reconnectAttempts);
    
    console. log(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    if (this.onConnectionChange) {
      this. onConnectionChange('reconnecting');
    }

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await ensureAuthenticated();
    } catch (authErr) {
      console.error('Auth check failed during reconnect:', authErr);
      throw authErr;
    }

    try {
      if (this.realtimeChannel) {
        try {
          await supabase. removeChannel(this. realtimeChannel);
        } catch (err) {
          console.warn('Error removing old channel:', err);
        }
        this.realtimeChannel = null;
      }
      
      this.realtimeChannel = await this.setupRealtimeChannel(this. gameId);
      console.log('Reconnection successful');
    } catch (err) {
      console.error('Reconnection failed:', err);
      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        return this.attemptReconnect();
      }
      throw err;
    }
  }

  handleGameStateUpdate(newState) {
    if (!this. gameLogic) return;
    this. gameLogic.importFromFirebase(newState, newState. pieces);
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

    await realtimeService.updateGameState(this.gameId, {
      grid: this.gameLogic.grid.map(p => p ?  { 
        id: p.id, 
        correctPosition: p.correctPosition 
      } : null),
      player_a_rack: this.gameLogic.playerARack.map(p => p ? p.id : null),
      player_b_rack: this.gameLogic.playerBRack.map(p => p ? p. id : null),
      piece_pool: this.gameLogic.piecePool. map(p => p.id),
      current_turn: this.gameLogic. currentTurn,
      pending_check: this.gameLogic.pendingCheck,
      awaiting_decision: result.awaitingCheck ? 'opponent_check' : null,
      move_history: this.gameLogic. moveHistory
    });

    await gameService.updateGame(this.gameId, {
      player_b_score: this. gameLogic.scores.playerB.score,
      player_b_accuracy: this. gameLogic.scores.playerB.accuracy,
      player_b_streak: this.gameLogic. scores.playerB. streak
    });

    return result;
  }

  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerB', decision);

    await realtimeService.updateGameState(this. gameId, {
      ...this.gameLogic.exportForFirebase(),
      awaiting_decision: result.awaitingPlacerDecision ? 'placer_check' : null
    });

    await gameService.updateGame(this.gameId, {
      player_b_score: this.gameLogic.scores.playerB.score,
      player_b_accuracy: this.gameLogic.scores. playerB.accuracy,
      player_b_streak: this. gameLogic.scores.playerB.streak
    });

    return result;
  }

  async disconnect() {
    this.isConnected = false;
    
    if (this. presenceChannel) {
      try {
        if (this. presenceChannel.cleanup) {
          await this.presenceChannel.cleanup();
        } else {
          await supabase. removeChannel(this. presenceChannel);
        }
      } catch (err) {
        console.error('Error cleaning up presence channel:', err);
      }
      this.presenceChannel = null;
    }

    if (this.realtimeChannel) {
      try {
        await supabase.removeChannel(this.realtimeChannel);
      } catch (err) {
        console. error('Error cleaning up realtime channel:', err);
      }
      this.realtimeChannel = null;
    }

    this.onStateUpdate = null;
    this.onGameUpdate = null;
    this.onPresenceUpdate = null;
    this.onConnectionChange = null;
    this.channelId = null;

    console.log('Disconnected from game');
  }
}

export default {
  MultiplayerGameHost,
  MultiplayerGameGuest
};
