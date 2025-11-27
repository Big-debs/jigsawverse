// =====================================================
// MULTIPLAYER REACT COMPONENTS
// =====================================================

import React, { useState, useEffect, useCallback } from 'react';
import { MultiplayerGameHost, MultiplayerGameGuest } from '../lib/multiplayer';
import { supabase } from '../config/supabase';

// =====================================================
// CREATE GAME COMPONENT (Host)
// =====================================================

export const CreateGameScreen = ({ onGameCreated }) => {
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [gridSize, setGridSize] = useState(10);
  const [timeLimit, setTimeLimit] = useState(600);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  const handleCreateGame = async () => {
    if (!imageFile) {
      setError('Please select an image');
      return;
    }

    setCreating(true);
    setError(null);

    try {
      const host = new MultiplayerGameHost();
      
      const result = await host.createGame(imageFile, {
        gridSize,
        timeLimit
      });

      console.log('Game created:', result);
      
      // Pass the host instance and game data to parent
      onGameCreated({
        host,
        gameId: result.gameId,
        gameCode: result.gameCode,
        game: result.game
      });

    } catch (err) {
      console.error('Error creating game:', err);
      setError(err.message || 'Failed to create game');
      setCreating(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h2 className="text-3xl font-bold text-white mb-6">Create New Game</h2>

      {/* Image Upload */}
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10">
        <label className="block text-white font-semibold mb-3">
          Choose Puzzle Image
        </label>
        
        <input
          type="file"
          accept="image/*"
          onChange={handleImageSelect}
          disabled={creating}
          className="hidden"
          id="image-upload"
        />
        
        <label
          htmlFor="image-upload"
          className="block w-full cursor-pointer"
        >
          {imagePreview ? (
            <img
              src={imagePreview}
              alt="Preview"
              className="w-full h-64 object-cover rounded-lg border-2 border-white/20 hover:border-cyan-400 transition-colors"
            />
          ) : (
            <div className="w-full h-64 border-2 border-dashed border-white/20 rounded-lg flex items-center justify-center hover:border-cyan-400 transition-colors">
              <div className="text-center text-purple-300">
                <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p>Click to upload image</p>
                <p className="text-sm mt-1">Max 5MB</p>
              </div>
            </div>
          )}
        </label>
      </div>

      {/* Settings */}
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 mb-6 border border-white/10">
        <h3 className="text-white font-semibold mb-4">Game Settings</h3>
        
        <div className="space-y-4">
          {/* Grid Size */}
          <div>
            <label className="block text-purple-200 text-sm mb-2">
              Grid Size: {gridSize}×{gridSize} ({gridSize * gridSize} pieces)
            </label>
            <input
              type="range"
              min="5"
              max="20"
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              disabled={creating}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-purple-300 mt-1">
              <span>Easy (5×5)</span>
              <span>Medium (10×10)</span>
              <span>Hard (20×20)</span>
            </div>
          </div>

          {/* Time Limit */}
          <div>
            <label className="block text-purple-200 text-sm mb-2">
              Time Limit: {Math.floor(timeLimit / 60)} minutes
            </label>
            <select
              value={timeLimit}
              onChange={(e) => setTimeLimit(Number(e.target.value))}
              disabled={creating}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white"
            >
              <option value={300}>5 minutes</option>
              <option value={600}>10 minutes</option>
              <option value={900}>15 minutes</option>
              <option value={1200}>20 minutes</option>
              <option value={0}>No limit</option>
            </select>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/20 border border-red-500 rounded-lg p-4 mb-6 text-red-200">
          {error}
        </div>
      )}

      {/* Create Button */}
      <button
        onClick={handleCreateGame}
        disabled={!imageFile || creating}
        className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
          imageFile && !creating
            ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 text-white shadow-lg'
            : 'bg-white/10 text-white/40 cursor-not-allowed'
        }`}
      >
        {creating ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Creating Game...
          </span>
        ) : (
          'Create Game'
        )}
      </button>
    </div>
  );
};

// =====================================================
// WAITING ROOM (Showing game code)
// =====================================================

export const WaitingRoom = ({ gameCode, onCancel }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(gameCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-2xl mx-auto p-6 text-center">
      <div className="bg-white/5 backdrop-blur-md rounded-xl p-8 border border-white/10">
        <div className="mb-6">
          <div className="w-16 h-16 bg-cyan-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-cyan-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Waiting for Opponent...</h2>
          <p className="text-purple-200">Share this code with your friend to start playing</p>
        </div>

        {/* Game Code Display */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl p-6 mb-6">
          <p className="text-white/80 text-sm mb-2">Game Code</p>
          <p className="text-5xl font-bold text-white tracking-wider font-mono">
            {gameCode}
          </p>
        </div>

        {/* Copy Button */}
        <button
          onClick={handleCopy}
          className="w-full bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl py-3 text-white font-medium transition-all mb-4 flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Code
            </>
          )}
        </button>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="text-purple-400 hover:text-purple-300 text-sm transition-colors"
        >
          Cancel Game
        </button>
      </div>
    </div>
  );
};

// =====================================================
// JOIN GAME COMPONENT (Guest)
// =====================================================

export const JoinGameScreen = ({ onGameJoined }) => {
  const [gameCode, setGameCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState(null);

  const handleJoinGame = async () => {
    if (!gameCode || gameCode.length !== 6) {
      setError('Please enter a valid 6-character game code');
      return;
    }

    setJoining(true);
    setError(null);

    try {
      const guest = new MultiplayerGameGuest();
      
      const result = await guest.joinGame(gameCode.toUpperCase());

      console.log('Joined game:', result);
      
      // Pass the guest instance and game data to parent
      onGameJoined({
        guest,
        gameId: result.gameId,
        game: result.game,
        gameState: result.gameState
      });

    } catch (err) {
      console.error('Error joining game:', err);
      setError(err.message || 'Failed to join game');
      setJoining(false);
    }
  };

  const handleCodeChange = (e) => {
    const value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (value.length <= 6) {
      setGameCode(value);
      setError(null);
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">Join Game</h2>
        <p className="text-purple-200">Enter the 6-character game code</p>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10">
        {/* Code Input */}
        <div className="mb-6">
          <label className="block text-purple-200 text-sm mb-3">
            Game Code
          </label>
          <input
            type="text"
            value={gameCode}
            onChange={handleCodeChange}
            placeholder="ABC123"
            maxLength={6}
            disabled={joining}
            className="w-full bg-white/5 border-2 border-white/20 focus:border-cyan-400 rounded-xl px-6 py-4 text-white text-center text-3xl font-mono font-bold uppercase tracking-wider focus:outline-none transition-colors"
          />
          <p className="text-purple-300 text-xs mt-2 text-center">
            Ask your friend for the game code
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4 text-red-200 text-sm">
            {error}
          </div>
        )}

        {/* Join Button */}
        <button
          onClick={handleJoinGame}
          disabled={gameCode.length !== 6 || joining}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            gameCode.length === 6 && !joining
              ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-lg'
              : 'bg-white/10 text-white/40 cursor-not-allowed'
          }`}
        >
          {joining ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Joining...
            </span>
          ) : (
            'Join Game'
          )}
        </button>
      </div>
    </div>
  );
};

// =====================================================
// MULTIPLAYER GAME PLAY COMPONENT
// =====================================================

export const MultiplayerGamePlay = ({ player, gameId, isHost }) => {
  const [gameState, setGameState] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [awaitingDecision, setAwaitingDecision] = useState(null);
  const [opponentName, setOpponentName] = useState('Opponent');
  const [opponentOnline, setOpponentOnline] = useState(false);

  const currentPlayer = isHost ? 'playerA' : 'playerB';
  const myRack = isHost ? gameState?.playerARack : gameState?.playerBRack;
  const isMyTurn = gameState?.currentTurn === currentPlayer;

  useEffect(() => {
    // Set up callbacks
    player.onStateUpdate = (state) => {
      setGameState(state);
      
      // Check if we need to make a decision
      if (state.pendingCheck) {
        const isMyMove = state.pendingCheck.player === currentPlayer;
        if (!isMyMove && state.awaitingDecision === 'opponent_check') {
          setAwaitingDecision('check');
        } else if (isMyMove && state.awaitingDecision === 'placer_check') {
          setAwaitingDecision('self_check');
        } else {
          setAwaitingDecision(null);
        }
      } else {
        setAwaitingDecision(null);
      }
    };

    player.onPresenceUpdate = (players) => {
      const opponent = players.find(p => p.user_id !== player.userId);
      if (opponent) {
        setOpponentName(opponent.user_name);
        setOpponentOnline(true);
      } else {
        setOpponentOnline(false);
      }
    };

    // Get initial state
    setGameState(player.gameLogic?.getGameState());

  }, [player, currentPlayer]);

  const handlePlacePiece = async (gridIndex) => {
    if (!selectedPiece || !isMyTurn) return;

    try {
      await player.makeMove(selectedPiece.id, gridIndex);
      setSelectedPiece(null);
    } catch (error) {
      alert(error.message);
    }
  };

  const handleCheckDecision = async (decision) => {
    try {
      await player.respondToCheck(decision);
      setAwaitingDecision(null);
    } catch (error) {
      alert(error.message);
    }
  };

  if (!gameState) {
    return <div className="text-white text-center p-8">Loading game...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      {/* Header with player info */}
      <div className="max-w-7xl mx-auto mb-4">
        <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 flex items-center justify-between">
          <div className={`flex-1 ${isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
            <p className="text-white font-bold">You</p>
            <p className="text-purple-300 text-sm">
              Score: {isHost ? gameState.scores.playerA.score : gameState.scores.playerB.score}
            </p>
          </div>
          
          <div className="text-center">
            {isMyTurn ? (
              <p className="text-yellow-400 font-bold animate-pulse">Your Turn</p>
            ) : (
              <p className="text-cyan-400">{opponentName}'s Turn</p>
            )}
          </div>
          
          <div className={`flex-1 text-right ${!isMyTurn ? 'opacity-100' : 'opacity-50'}`}>
            <p className="text-white font-bold flex items-center justify-end gap-2">
              {opponentName}
              {opponentOnline && (
                <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              )}
            </p>
            <p className="text-purple-300 text-sm">
              Score: {isHost ? gameState.scores.playerB.score : gameState.scores.playerA.score}
            </p>
          </div>
        </div>
      </div>

      {/* Decision Panel */}
      {awaitingDecision && (
        <div className="max-w-2xl mx-auto mb-4 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl p-4 text-white">
          <h3 className="font-bold mb-3">
            {awaitingDecision === 'check' 
              ? 'Opponent placed a piece. Check or Pass?' 
              : 'You can check your own piece or Pass'}
          </h3>
          <div className="flex gap-3">
            <button
              onClick={() => handleCheckDecision('check')}
              className="flex-1 bg-white/20 hover:bg-white/30 rounded-lg py-3 font-bold transition-colors"
            >
              Check
            </button>
            <button
              onClick={() => handleCheckDecision('pass')}
              className="flex-1 bg-white/20 hover:bg-white/30 rounded-lg py-3 font-bold transition-colors"
            >
              Pass
            </button>
          </div>
        </div>
      )}

      {/* Game Board & Rack - similar to your existing gameplay screen */}
      {/* Implementation continues with board grid and piece rack */}
    </div>
  );
};

export default {
  CreateGameScreen,
  WaitingRoom,
  JoinGameScreen,
  MultiplayerGamePlay
};