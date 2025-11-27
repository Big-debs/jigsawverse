// =====================================================
// MULTIPLAYER GAME FLOW - COMPLETE IMPLEMENTATION
// =====================================================

import { supabase } from '../config/supabase';
import { gameService, realtimeService, storageService } from '../services';
import { ImageProcessor, GameLogic } from '../lib/gameLogic';

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
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          console.log('Player joined:', newPresences);
          this.handlePlayerJoin(newPresences);
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
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

    const user = await supabase.auth.getUser();
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

// =====================================================
// 3. SERVER-SIDE VALIDATION (Supabase Edge Function)
// File: supabase/functions/validate-move/index.ts
// =====================================================

/*
// This runs on Supabase Edge (server-side)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const { gameId, playerId, pieceId, gridIndex } = await req.json()

    // Create Supabase client with service role key (server-side)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // 1. Get current game state
    const { data: gameState, error: stateError } = await supabaseAdmin
      .from('game_state')
      .select('*')
      .eq('game_id', gameId)
      .single()

    if (stateError) throw stateError

    // 2. Validate it's player's turn
    const game = await supabaseAdmin
      .from('games')
      .select('*')
      .eq('id', gameId)
      .single()

    const isPlayerA = game.data.player_a_id === playerId
    const currentTurn = gameState.current_turn
    
    if ((isPlayerA && currentTurn !== 'playerA') || 
        (!isPlayerA && currentTurn !== 'playerB')) {
      return new Response(
        JSON.stringify({ error: 'Not your turn' }),
        { status: 400 }
      )
    }

    // 3. Validate piece placement
    const piece = gameState.pieces.find(p => p.id === pieceId)
    if (!piece) {
      return new Response(
        JSON.stringify({ error: 'Invalid piece' }),
        { status: 400 }
      )
    }

    const isCorrect = piece.correctPosition === gridIndex

    // 4. Calculate score changes
    let scoreChange = isCorrect ? 10 : 0
    let newStreak = isCorrect ? (isPlayerA ? gameState.player_a_streak + 1 : gameState.player_b_streak + 1) : 0

    // Streak bonus
    if (newStreak >= 3) {
      scoreChange += Math.floor(newStreak / 3) * 2
    }

    // 5. Return validation result
    return new Response(
      JSON.stringify({
        valid: true,
        correct: isCorrect,
        scoreChange,
        newStreak
      }),
      { headers: { "Content-Type": "application/json" } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500 }
    )
  }
})
*/

// =====================================================
// 4. REACT COMPONENT USAGE
// =====================================================

export const MultiplayerGameExample = () => {
  const [gameHost, setGameHost] = useState(null);
  const [gameGuest, setGameGuest] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [mode, setMode] = useState(null); // 'host' or 'guest'

  // HOST: Create game
  const handleCreateGame = async (imageFile, settings) => {
    const host = new MultiplayerGameHost();
    
    // Set up callbacks
    host.onStateUpdate = (state) => setGameState(state);
    host.onOpponentJoin = (name) => alert(`${name} joined the game!`);
    host.onPlayerLeave = () => alert('Opponent disconnected');
    
    const result = await host.createGame(imageFile, settings);
    
    setGameHost(host);
    setMode('host');
    setGameState(host.gameLogic.getGameState());
    
    // Show game code to share
    alert(`Share this code with your opponent: ${result.gameCode}`);
    
    return result;
  };

  // GUEST: Join game
  const handleJoinGame = async (gameCode) => {
    const guest = new MultiplayerGameGuest();
    
    // Set up callbacks
    guest.onStateUpdate = (state) => setGameState(state);
    guest.onGameUpdate = (game) => {
      if (game.status === 'active') {
        alert('Game started!');
      }
    };
    
    const result = await guest.joinGame(gameCode);
    
    setGameGuest(guest);
    setMode('guest');
    setGameState(result.gameState);
    
    return result;
  };

  // Make a move
  const handlePlacePiece = async (pieceId, gridIndex) => {
    try {
      const player = mode === 'host' ? gameHost : gameGuest;
      const result = await player.makeMove(pieceId, gridIndex);
      
      if (result.awaitingCheck) {
        // UI shows check/pass buttons
      }
    } catch (error) {
      alert(error.message);
    }
  };

  // Respond to check
  const handleCheckResponse = async (decision) => {
    const player = mode === 'host' ? gameHost : gameGuest;
    const result = await player.respondToCheck(decision);
    // Handle result
  };

  return (
    <div>
      {/* UI implementation here */}
    </div>
  );
};

// =====================================================
// 5. COMPLETE FLOW DIAGRAM
// =====================================================

/*
MULTIPLAYER FLOW:

1. HOST CREATES GAME:
   [Host] -> Upload Image
   [Host] -> Process Image into Pieces
   [Supabase] <- Create game record (gets game_code)
   [Supabase] <- Create game_state record
   [Host] <- Receives game_code (e.g., "A4B7C2")
   [Host] -> Subscribe to realtime channel
   [Host] -> Track presence

2. GUEST JOINS:
   [Guest] -> Enter game_code
   [Supabase] <- Query game by code
   [Supabase] -> Return game data
   [Supabase] <- Update game.player_b_id
   [Supabase] <- Set game.status = 'active'
   [Guest] -> Subscribe to realtime channel
   [Guest] -> Track presence
   [Host] <- Receives "player joined" event

3. GAMEPLAY LOOP:
   [Player A] -> Place piece
   [Supabase] <- Update game_state (grid, racks, turn)
   [Player B] <- Receives state update via realtime
   [Player B] -> UI updates automatically
   
   [Player B] -> Check or Pass
   [Supabase] <- Update game_state (pending_check handled)
   [Player A] <- Receives decision
   
   [Repeat until game complete]

4. GAME END:
   [Supabase] <- Update game.status = 'completed'
   [Supabase] <- Update user_stats for both players
   [Both Players] <- Show game over screen

5. DISCONNECT HANDLING:
   [Player] -> Closes browser/disconnects
   [Supabase] <- Presence "leave" event
   [Other Player] <- Receives disconnect notification
   [Supabase] <- Game.status = 'abandoned' (after timeout)
*/

export default {
  MultiplayerGameHost,
  MultiplayerGameGuest
};