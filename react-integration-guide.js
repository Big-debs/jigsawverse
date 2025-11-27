// =====================================================
// REACT COMPONENT INTEGRATION
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { ImageProcessor, GameLogic } from './utils/gameLogic';
import { realtimeService, storageService, databaseService } from './services';

// =====================================================
// GAME SETUP COMPONENT
// =====================================================

export const GameSetup = ({ onGameReady }) => {
  const [imageFile, setImageFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [gridSize, setGridSize] = useState(10);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFile(file);
  };

  const handleStartGame = async () => {
    if (!imageFile) return;

    setProcessing(true);

    try {
      // 1. Upload image to Firebase Storage
      const { url } = await storageService.uploadPuzzleImage(
        auth.currentUser.uid,
        imageFile,
        { gridSize }
      );

      // 2. Process image into pieces
      const processor = new ImageProcessor(url, gridSize);
      const { pieces, gridDimensions } = await processor.sliceImage();

      // 3. Create game in Firestore
      const gameId = await databaseService.createGame(
        auth.currentUser.uid,
        {
          gridSize: gridDimensions.totalPieces,
          imageUrl: url,
          mode: 'multiplayer',
          playerAName: auth.currentUser.displayName || 'Player A'
        }
      );

      // 4. Initialize game logic
      const gameLogic = new GameLogic(gridDimensions.totalPieces, pieces);
      gameLogic.initialize();

      // 5. Save to Realtime Database
      await realtimeService.initializeGame(gameId, gridDimensions.totalPieces);
      await realtimeService.updateGameState(gameId, {
        pieces: pieces.map(p => ({
          id: p.id,
          correctPosition: p.correctPosition,
          imageData: p.imageData,
          isEdge: p.isEdge
        })),
        ...gameLogic.exportForFirebase()
      });

      // 6. Navigate to game
      onGameReady(gameId, gameLogic);

    } catch (error) {
      console.error('Error starting game:', error);
      alert('Failed to start game. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="game-setup">
      <h2>Setup Your Puzzle</h2>
      
      <div className="image-upload">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          disabled={processing}
        />
        {imageFile && (
          <img 
            src={URL.createObjectURL(imageFile)} 
            alt="Preview" 
            style={{ maxWidth: '300px' }}
          />
        )}
      </div>

      <div className="grid-size-selector">
        <label>Grid Size:</label>
        <select value={gridSize} onChange={(e) => setGridSize(Number(e.target.value))}>
          <option value={5}>5x5 (25 pieces)</option>
          <option value={10}>10x10 (100 pieces)</option>
          <option value={15}>15x15 (225 pieces)</option>
        </select>
      </div>

      <button 
        onClick={handleStartGame}
        disabled={!imageFile || processing}
      >
        {processing ? 'Processing...' : 'Start Game'}
      </button>
    </div>
  );
};

// =====================================================
// GAMEPLAY COMPONENT
// =====================================================

export const GamePlay = ({ gameId, initialGameLogic }) => {
  const [gameLogic, setGameLogic] = useState(initialGameLogic);
  const [gameState, setGameState] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [awaitingDecision, setAwaitingDecision] = useState(null);
  const user = useAuth();

  // Determine current player
  const currentPlayer = user.uid === gameState?.hostId ? 'playerA' : 'playerB';
  const isMyTurn = gameState?.currentTurn === currentPlayer;

  // Listen to game updates from Firebase
  useEffect(() => {
    const unsubscribe = realtimeService.listenToGame(gameId, async (data) => {
      if (!data) return;

      // Update local game logic
      const pieces = data.pieces; // Full piece data stored in Firebase
      gameLogic.importFromFirebase(data, pieces);
      setGameState(gameLogic.getGameState());

      // Check if there's a pending decision
      if (data.pendingCheck && data.pendingCheck.player !== currentPlayer) {
        setAwaitingDecision('opponent_check');
      } else if (data.awaitingPlacerDecision && data.pendingCheck.player === currentPlayer) {
        setAwaitingDecision('placer_check');
      } else {
        setAwaitingDecision(null);
      }
    });

    return unsubscribe;
  }, [gameId, currentPlayer]);

  // Handle piece placement
  const handlePlacePiece = useCallback(async (gridIndex) => {
    if (!selectedPiece || !isMyTurn) return;

    const result = gameLogic.placePiece(currentPlayer, selectedPiece.id, gridIndex);

    if (result.success) {
      // Update Firebase
      await realtimeService.updateGameState(gameId, {
        ...gameLogic.exportForFirebase(),
        awaitingCheck: true
      });

      setSelectedPiece(null);
      setGameState(gameLogic.getGameState());
    } else {
      alert(result.message);
    }
  }, [selectedPiece, isMyTurn, currentPlayer, gameLogic, gameId]);

  // Handle opponent check decision
  const handleOpponentCheck = useCallback(async (decision) => {
    const result = gameLogic.handleOpponentCheck(currentPlayer, decision);

    if (result.success) {
      await realtimeService.updateGameState(gameId, {
        ...gameLogic.exportForFirebase(),
        awaitingCheck: false,
        awaitingPlacerDecision: result.awaitingPlacerDecision || false
      });

      setGameState(gameLogic.getGameState());
      setAwaitingDecision(result.awaitingPlacerDecision ? 'placer_check' : null);
    }
  }, [currentPlayer, gameLogic, gameId]);

  // Handle placer check decision
  const handlePlacerCheck = useCallback(async (decision) => {
    const result = gameLogic.handlePlacerCheck(currentPlayer, decision);

    if (result.success) {
      await realtimeService.updateGameState(gameId, {
        ...gameLogic.exportForFirebase(),
        awaitingCheck: false,
        awaitingPlacerDecision: false
      });

      setGameState(gameLogic.getGameState());
      setAwaitingDecision(null);
    }
  }, [currentPlayer, gameLogic, gameId]);

  // Handle hint request
  const handleHint = useCallback(() => {
    const hint = gameLogic.getHint(currentPlayer);
    if (hint) {
      alert(`Piece ${hint.pieceId} belongs at position ${hint.correctPosition}`);
    }
  }, [currentPlayer, gameLogic]);

  if (!gameState) return <div>Loading game...</div>;

  return (
    <div className="gameplay">
      {/* Player Stats */}
      <div className="player-stats">
        <div className={`player ${currentPlayer === 'playerA' ? 'active' : ''}`}>
          <h3>Player A</h3>
          <p>Score: {gameState.scores.playerA.score}</p>
          <p>Accuracy: {gameState.scores.playerA.accuracy}%</p>
          <p>Streak: {gameState.scores.playerA.streak}</p>
        </div>
        <div className={`player ${currentPlayer === 'playerB' ? 'active' : ''}`}>
          <h3>Player B</h3>
          <p>Score: {gameState.scores.playerB.score}</p>
          <p>Accuracy: {gameState.scores.playerB.accuracy}%</p>
          <p>Streak: {gameState.scores.playerB.streak}</p>
        </div>
      </div>

      {/* Game Board */}
      <div className="game-board">
        <div 
          className="grid" 
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(10, 1fr)`,
            gap: '2px'
          }}
        >
          {gameState.grid.map((piece, idx) => (
            <div
              key={idx}
              className={`grid-cell ${selectedPiece ? 'clickable' : ''}`}
              onClick={() => handlePlacePiece(idx)}
              style={{
                aspectRatio: '1',
                border: '1px solid #ccc',
                cursor: selectedPiece && !piece ? 'pointer' : 'default',
                backgroundImage: piece ? `url(${piece.imageData})` : 'none',
                backgroundSize: 'cover'
              }}
            >
              {!piece && <span className="grid-index">{idx}</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Player Rack */}
      <div className="player-rack">
        <h3>Your Pieces ({gameState[`${currentPlayer}Rack`].filter(p => p).length}/10)</h3>
        <div className="rack-pieces">
          {gameState[`${currentPlayer}Rack`].filter(p => p).map((piece) => (
            <div
              key={piece.id}
              className={`rack-piece ${selectedPiece?.id === piece.id ? 'selected' : ''}`}
              onClick={() => setSelectedPiece(piece)}
              style={{
                width: '80px',
                height: '80px',
                border: selectedPiece?.id === piece.id ? '3px solid yellow' : '1px solid #ccc',
                cursor: 'pointer',
                backgroundImage: `url(${piece.imageData})`,
                backgroundSize: 'cover'
              }}
            />
          ))}
        </div>
      </div>

      {/* Decision Panel */}
      {awaitingDecision === 'opponent_check' && (
        <div className="decision-panel">
          <h3>Opponent placed a piece. Check or Pass?</h3>
          <button onClick={() => handleOpponentCheck('check')}>Check</button>
          <button onClick={() => handleOpponentCheck('pass')}>Pass</button>
        </div>
      )}

      {awaitingDecision === 'placer_check' && (
        <div className="decision-panel">
          <h3>Opponent passed. Check your own piece or Pass?</h3>
          <button onClick={() => handlePlacerCheck('check')}>Check</button>
          <button onClick={() => handlePlacerCheck('pass')}>Pass</button>
        </div>
      )}

      {/* Actions */}
      <div className="game-actions">
        <button onClick={handleHint} disabled={!isMyTurn}>
          Get Hint
        </button>
        <button disabled={!isMyTurn}>
          Shuffle Rack
        </button>
      </div>

      {/* Game Over */}
      {gameState.isComplete && (
        <div className="game-over">
          <h2>Game Over!</h2>
          <p>Winner: {gameState.winner === 'tie' ? 'Tie!' : `Player ${gameState.winner === 'playerA' ? 'A' : 'B'}`}</p>
          <p>Final Score: A: {gameState.scores.playerA.score} - B: {gameState.scores.playerB.score}</p>
        </div>
      )}
    </div>
  );
};

// =====================================================
// EXAMPLE: Complete Flow
// =====================================================

export const GameFlow = () => {
  const [screen, setScreen] = useState('setup'); // setup, gameplay
  const [gameId, setGameId] = useState(null);
  const [gameLogic, setGameLogic] = useState(null);

  const handleGameReady = (id, logic) => {
    setGameId(id);
    setGameLogic(logic);
    setScreen('gameplay');
  };

  return (
    <div className="game-flow">
      {screen === 'setup' && (
        <GameSetup onGameReady={handleGameReady} />
      )}
      
      {screen === 'gameplay' && (
        <GamePlay gameId={gameId} initialGameLogic={gameLogic} />
      )}
    </div>
  );
};

// =====================================================
// FIREBASE REALTIME SYNC PATTERN
// =====================================================

/*
Flow:
1. Player A uploads image → Image sliced → Pieces created
2. Game initialized in both Firestore (metadata) and Realtime DB (live state)
3. Players connect and listen to Realtime DB for instant updates
4. On piece placement:
   - Validate locally with GameLogic
   - Update Realtime DB
   - All clients receive update instantly
   - GameLogic re-syncs from Firebase data
5. Pass/Check flow managed through Firebase flags
6. Game completion triggers Firestore update with final stats

Key Firebase Structure:
- Firestore: Game metadata, player profiles, final results
- Realtime DB: Live game state, piece positions, turn management
- Storage: Original images and piece image data URLs
*/