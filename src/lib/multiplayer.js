// =====================================================
// MULTIPLAYER GAME FLOW - COMPLETE IMPLEMENTATION
// =====================================================

import { supabase } from '../config/supabase';
import { gameService, realtimeService, storageService } from '../services';
import { ImageProcessor, GameLogic } from './gameLogic';

// =====================================================
// 1. CREATE GAME (Host)
// =====================================================

export class MultiplayerGameHost {
  constructor() {
    this.gameId = null;
    this.gameLogic = null;
    this.realtimeChannel = null;
  }

  /**
   * Create a new multiplayer game
   * @param {File} imageFile - The puzzle image
   * @param {Object} settings - Game settings
   * @returns {Promise<Object>} Game data with code
   */
  async createGame(imageFile, settings = {}) {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const userId = user.data.user.id;
      const userName = user.data.user.user_metadata?.username || 'Player A';

      console.log('Step 1: Uploading image...');
      // 1. Upload image to Supabase Storage
      const { id: imageId, url: imageUrl } = await storageService.uploadPuzzleImage(
        userId,
        imageFile
      );

      console.log('Step 2: Processing image into pieces...');
      // 2. Process image into puzzle pieces
      const processor = new ImageProcessor(imageUrl, settings.gridSize || 10);
      await processor.loadImage();
      const { pieces, gridDimensions } = await processor.sliceImage();

      console.log('Step 3: Creating game record...');
      // 3. Create game record in database
      const game = await gameService.createGame(userId, {
        mode: 'multiplayer',
        gridSize: gridDimensions.totalPieces,
        timeLimit: settings.timeLimit || 600,
        imageId: imageId,
        playerAName: userName
      });

      this.gameId = game.id;

      console.log('Step 4: Initializing game logic...');
      // 4. Initialize game logic
      this.gameLogic = new GameLogic(gridDimensions.totalPieces, pieces);
      this.gameLogic.initialize();

      console.log('Step 5: Setting up realtime state...');
      // 5. Initialize game state in realtime table
      await realtimeService.initializeGameState(
        game.id,
        pieces,
        gridDimensions.totalPieces
      );

      console.log('Step 6: Setting up realtime channel...');
      // 6. Set up realtime channel for game updates
      this.realtimeChannel = await this.setupRealtimeChannel(game.id);

      console.log('Step 7: Setting up presence tracking...');
      // 7. Track host presence
      await realtimeService.trackPresence(game.id, userId, userName);

      console.log('✅ Game created successfully!');
      return {
        gameId: game.id,
        gameCode: game.game_code,
        game: game,
        pieces: pieces,
        gridDimensions: gridDimensions
      };

    } catch (error) {
      console.error('Error creating game:', error);
      throw error;
    }
  }

  /**
   * Setup realtime channel for game updates
   */
  setupRealtimeChannel(gameId) {
    return new Promise((resolve) => {
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
            console.log('Game state updated:', payload.new);
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
            this.handleGameUpdate(payload.new);
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
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Subscribed to game channel');
            resolve(channel);
          }
        });

      return channel;
    });
  }

  /**
   * Handle game state updates from other players
   */
  handleGameStateUpdate(newState) {
    if (!this.gameLogic) return;

    // Import updated state into game logic
    this.gameLogic.importFromFirebase(newState, newState.pieces);

    // Trigger UI update (implement callback)
    if (this.onStateUpdate) {
      this.onStateUpdate(this.gameLogic.getGameState());
    }
  }

  /**
   * Handle game metadata updates
   */
  handleGameUpdate(game) {
    if (this.onGameUpdate) {
      this.onGameUpdate(game);
    }

    // If player B joined, start the game
    if (game.status === 'active' && game.player_b_id) {
      console.log('Player B joined! Game starting...');
      if (this.onOpponentJoin) {
        this.onOpponentJoin(game.player_b_name);
      }
    }
  }

  /**
   * Handle presence synchronization
   */
  handlePresenceSync(state) {
    const players = Object.values(state).flat();
    if (this.onPresenceUpdate) {
      this.onPresenceUpdate(players);
    }
  }

  /**
   * Handle player joining
   */
  handlePlayerJoin(presences) {
    if (this.onPlayerJoin) {
      this.onPlayerJoin(presences);
    }
  }

  /**
   * Handle player leaving
   */
  handlePlayerLeave(presences) {
    if (this.onPlayerLeave) {
      this.onPlayerLeave(presences);
    }
  }

  /**
   * Make a move (place piece)
   */
  async makeMove(pieceId, gridIndex) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const currentPlayer = 'playerA'; // Host is always playerA

    // Validate move locally first
    const result = this.gameLogic.placePiece(currentPlayer, pieceId, gridIndex);

    if (!result.success) {
      throw new Error(result.message);
    }

    // Update server state
    await realtimeService.updateGameState(this.gameId, {
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
      move_history: this.gameLogic.moveHistory
    });

    // Update game metadata (scores)
    await gameService.updateGame(this.gameId, {
      player_a_score: this.gameLogic.scores.playerA.score,
      player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
      player_a_streak: this.gameLogic.scores.playerA.streak
    });

    return result;
  }

  /**
   * Respond to check decision
   */
  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerA', decision);

    // Update server state
    await realtimeService.updateGameState(this.gameId, {
      ...this.gameLogic.exportForFirebase(),
      awaiting_decision: result.awaitingPlacerDecision ? 'placer_check' : null
    });

    await gameService.updateGame(this.gameId, {
      player_a_score: this.gameLogic.scores.playerA.score,
      player_a_accuracy: this.gameLogic.scores.playerA.accuracy,
      player_a_streak: this.gameLogic.scores.playerA.streak
    });

    return result;
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect() {
    if (this.realtimeChannel) {
      await supabase.removeChannel(this.realtimeChannel);
    }
  }
}

// =====================================================
// 2. JOIN GAME (Guest)
// =====================================================

export class MultiplayerGameGuest {
  constructor() {
    this.gameId = null;
    this.gameLogic = null;
    this.realtimeChannel = null;
  }

  /**
   * Join an existing game by code
   * @param {string} gameCode - 6-digit game code
   * @returns {Promise<Object>} Game data
   */
  async joinGame(gameCode) {
    try {
      const user = await supabase.auth.getUser();
      if (!user.data.user) throw new Error('User not authenticated');

      const userId = user.data.user.id;
      const userName = user.data.user.user_metadata?.username || 'Player B';

      console.log('Step 1: Finding game by code...');
      // 1. Get game by code
      const game = await gameService.getGameByCode(gameCode);
      
      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'waiting') {
        throw new Error('Game is not accepting players');
      }

      this.gameId = game.id;

      console.log('Step 2: Joining game as Player B...');
      // 2. Join game as Player B
      await gameService.joinGame(gameCode, userId, userName);

      console.log('Step 3: Loading game state...');
      // 3. Get current game state
      const gameState = await realtimeService.getGameState(game.id);

      console.log('Step 4: Initializing game logic...');
      // 4. Initialize game logic with existing state
      this.gameLogic = new GameLogic(game.grid_size, gameState.pieces);
      this.gameLogic.importFromFirebase(gameState, gameState.pieces);

      console.log('Step 5: Setting up realtime channel...');
      // 5. Set up realtime channel
      this.realtimeChannel = await this.setupRealtimeChannel(game.id);

      console.log('Step 6: Tracking presence...');
      // 6. Track presence
      await realtimeService.trackPresence(game.id, userId, userName);

      console.log('✅ Successfully joined game!');
      return {
        gameId: game.id,
        game: game,
        gameState: this.gameLogic.getGameState()
      };

    } catch (error) {
      console.error('Error joining game:', error);
      throw error;
    }
  }

  /**
   * Setup realtime channel (same as host)
   */
  setupRealtimeChannel(gameId) {
    return new Promise((resolve) => {
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
            console.log('Game state updated:', payload.new);
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
            this.handleGameUpdate(payload.new);
          }
        )
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          console.log('Presence sync:', state);
          this.handlePresenceSync(state);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('Subscribed to game channel');
            resolve(channel);
          }
        });

      return channel;
    });
  }

  /**
   * Handle updates (same as host)
   */
  handleGameStateUpdate(newState) {
    if (!this.gameLogic) return;
    this.gameLogic.importFromFirebase(newState, newState.pieces);
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

  /**
   * Make a move (place piece)
   */
  async makeMove(pieceId, gridIndex) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const currentPlayer = 'playerB'; // Guest is always playerB

    // Validate move locally
    const result = this.gameLogic.placePiece(currentPlayer, pieceId, gridIndex);

    if (!result.success) {
      throw new Error(result.message);
    }

    // Update server state
    await realtimeService.updateGameState(this.gameId, {
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
      move_history: this.gameLogic.moveHistory
    });

    // Update game metadata (scores)
    await gameService.updateGame(this.gameId, {
      player_b_score: this.gameLogic.scores.playerB.score,
      player_b_accuracy: this.gameLogic.scores.playerB.accuracy,
      player_b_streak: this.gameLogic.scores.playerB.streak
    });

    return result;
  }

  /**
   * Respond to check decision
   */
  async respondToCheck(decision) {
    if (!this.gameLogic) throw new Error('Game not initialized');

    const result = this.gameLogic.handleOpponentCheck('playerB', decision);

    await realtimeService.updateGameState(this.gameId, {
      ...this.gameLogic.exportForFirebase(),
      awaiting_decision: result.awaitingPlacerDecision ? 'placer_check' : null
    });

    await gameService.updateGame(this.gameId, {
      player_b_score: this.gameLogic.scores.playerB.score,
      player_b_accuracy: this.gameLogic.scores.playerB.accuracy,
      player_b_streak: this.gameLogic.scores.playerB.streak
    });

    return result;
  }

  /**
   * Cleanup
   */
  async disconnect() {
    if (this.realtimeChannel) {
      await supabase.removeChannel(this.realtimeChannel);
    }
  }
}

export default {
  MultiplayerGameHost,
  MultiplayerGameGuest
};
