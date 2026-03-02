import { useState, useEffect, useCallback, useRef } from 'react';
import { Trophy, Clock, Target, Zap, ArrowLeft } from 'lucide-react';
import { GameLogic } from '../lib/gameLogic';
import { MODE_SCORING } from '../lib/gameModes';
import { ACCESSIBILITY_DEFAULTS } from '../lib/gameConfig';
import PuzzleCanvas from './PuzzleCanvas';
import ZoomControls from './ZoomControls';
import HintsPanel from './HintsPanel';
import GameSettingsPanel from './GameSettingsPanel';

const SinglePlayerGame = ({
  imageUrl,
  gridSize = 10,
  pieces = [],
  settings = ACCESSIBILITY_DEFAULTS,
  onExit
}) => {
  const [gameLogic] = useState(() => {
    const totalPieces = gridSize * gridSize;
    const logic = new GameLogic(totalPieces, pieces, 'SINGLE_PLAYER');

    // Shuffle pieces manually using Fisher-Yates algorithm
    const shuffled = [...pieces];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // Put all shuffled pieces in player rack for single player
    logic.piecePool = shuffled;
    logic.playerARack = [];
    logic.fillRack('playerA');
    logic.gameState = 'active';
    return logic;
  });

  const [gameState, setGameState] = useState(gameLogic.getGameState());
  const [timeRemaining, setTimeRemaining] = useState(gridSize * 60); // gridSize minutes (5×5 = 5min)
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [, setCorrectPlacements] = useState(0);
  const [totalPlacements, setTotalPlacements] = useState(0);
  const [accuracy, setAccuracy] = useState(100);
  const [, setTotalAttempts] = useState(0);
  const [gameStatus, setGameStatus] = useState('playing'); // 'playing' | 'completed' | 'timeout'
  const [lastResult, setLastResult] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [draggedPiece, setDraggedPiece] = useState(null);
  const [dragPosition, setDragPosition] = useState(null);
  const [zoom, setZoom] = useState(1);
  const offset = { x: 0, y: 0 }; // No pan support for now (zoom only)
  const [gameSettings, setGameSettings] = useState(settings);
  const [activeHint, setActiveHint] = useState(null);

  const scoring = MODE_SCORING.SINGLE_PLAYER;
  const timerRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);

  // Timer countdown
  useEffect(() => {
    if (gameStatus !== 'playing') return;

    timerRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          setGameStatus('timeout');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [gameStatus]);

  // Check for completion
  useEffect(() => {
    if (gameStatus !== 'playing') return;

    const allPlaced = gameState.grid.every(cell => cell !== null);
    if (allPlaced) {
      setGameStatus('completed');
      if (timerRef.current) clearInterval(timerRef.current);

      // Award time bonus
      const timeBonus = timeRemaining;
      setScore(prev => prev + timeBonus);
    }
  }, [gameState.grid, gameStatus, timeRemaining]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  const handlePiecePlacement = useCallback((pieceId, gridIndex) => {
    if (gameStatus !== 'playing') return;

    const validation = gameLogic.isValidPlacement(pieceId, gridIndex);
    if (!validation.valid) return;

    setTotalAttempts(prev => prev + 1);

    // Place piece on grid regardless of correctness
    gameLogic.grid[gridIndex] = validation.piece;

    // Remove from rack
    const pieceIndex = gameLogic.playerARack.findIndex(p => p && p.id === pieceId);
    if (pieceIndex !== -1) {
      gameLogic.playerARack[pieceIndex] = null;
    }

    // Refill rack if empty
    const rackIsEmpty = gameLogic.playerARack.filter(p => p !== null).length === 0;
    if (rackIsEmpty && gameLogic.piecePool.length > 0) {
      gameLogic.fillRack('playerA');
    }

    // Update actual scores (hidden)
    if (validation.correct) {
      const newStreak = gameLogic.scores.playerA.streak + 1;
      let points = scoring.correctPiece;
      if (newStreak >= scoring.streakBonusThreshold) {
        const multiplier = 1 + (scoring.streakMultiplier * 0.2);
        points = Math.floor(points * multiplier);
      }
      gameLogic.scores.playerA.score += points;
      gameLogic.scores.playerA.streak = newStreak;
      gameLogic.scores.playerA.correctPlacements++;
    } else {
      gameLogic.scores.playerA.streak = 0;
      gameLogic.scores.playerA.score += scoring.wrongPiece; // negative points
    }
    gameLogic.scores.playerA.totalPlacements++;
    gameLogic.scores.playerA.accuracy = Math.round(
      (gameLogic.scores.playerA.correctPlacements / gameLogic.scores.playerA.totalPlacements) * 100
    );

    // Check if milestone reached
    const filledCells = gameLogic.grid.filter(cell => cell !== null && cell !== undefined).length;
    const progress = gameLogic.totalPieces > 0 ? filledCells / gameLogic.totalPieces : 0;
    const isMilestone = progress >= gameLogic.nextCheckRevealProgress;

    // Always update total placements for the UI
    setTotalPlacements(gameLogic.scores.playerA.totalPlacements);

    if (isMilestone) {
      // 1. Sync revealed scores
      setScore(gameLogic.scores.playerA.score);
      setStreak(gameLogic.scores.playerA.streak);
      setBestStreak(prev => Math.max(prev, gameLogic.scores.playerA.streak));
      setCorrectPlacements(gameLogic.scores.playerA.correctPlacements);
      setAccuracy(gameLogic.scores.playerA.accuracy);

      // 2. Remove incorrect pieces and return to rack
      let removedCount = 0;
      for (let i = 0; i < gameLogic.grid.length; i++) {
        const piece = gameLogic.grid[i];
        if (piece && piece.correctPosition !== i) {
          gameLogic.grid[i] = null;
          gameLogic.returnPieceToRack('playerA', piece);
          removedCount++;
        }
      }

      // 3. Update next milestone
      const bucket = Math.floor(progress / 0.2);
      gameLogic.nextCheckRevealProgress = Math.min((bucket + 1) * 0.2, 1);

      // 4. Show milestone feedback
      setLastResult({
        correct: true,
        message: `Milestone Reached! Scores updated. ${removedCount > 0 ? `${removedCount} incorrect piece(s) returned to rack.` : 'All placements correct!'}`
      });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 4000);
    } else {
      // Generic "Piece Placed" feedback
      setLastResult({
        correct: true,
        message: 'Piece placed'
      });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 1000);
    }

    // Update game state to re-render
    setGameState(gameLogic.getGameState());
    setSelectedPiece(null);
    setDraggedPiece(null);
    setDragPosition(null);
  }, [gameLogic, gameStatus, scoring]);

  const handleCellClick = useCallback((gridIndex) => {
    if (!selectedPiece || gameStatus !== 'playing') return;
    handlePiecePlacement(selectedPiece.id, gridIndex);
  }, [selectedPiece, gameStatus, handlePiecePlacement]);

  const handlePieceDrop = useCallback((pieceId, gridIndex) => {
    if (gameStatus !== 'playing') return;
    handlePiecePlacement(pieceId, gridIndex);
  }, [gameStatus, handlePiecePlacement]);

  const handlePieceSelect = (piece) => {
    if (gameStatus !== 'playing') return;
    setSelectedPiece(piece);
  };

  const handleDragStart = (piece, e) => {
    if (gameStatus !== 'playing') return;
    setDraggedPiece(piece);
    setDragPosition({ x: e.clientX, y: e.clientY });
  };

  const handleDragMove = useCallback((e) => {
    if (!draggedPiece) return;
    setDragPosition({ x: e.clientX, y: e.clientY });
  }, [draggedPiece]);

  const handleDragEnd = useCallback(() => {
    setDraggedPiece(null);
    setDragPosition(null);
  }, []);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 2.0));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoom(1);

  const handleUseHint = (hintType) => {
    const result = gameLogic.useHint('playerA', hintType);
    if (result.success) {
      setScore(gameLogic.scores.playerA.score);
      setActiveHint(result.hint);
      setTimeout(() => setActiveHint(null), 5000); // Clear hint after 5 seconds
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Mouse move listener
  useEffect(() => {
    if (!draggedPiece) return;

    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);

    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [draggedPiece, handleDragMove, handleDragEnd]);

  if (gameStatus !== 'playing') {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 backdrop-blur-md rounded-2xl p-5 sm:p-8 border border-purple-500/30">
          <div className="text-center">
            <div className="text-4xl sm:text-6xl mb-3 sm:mb-4">
              {gameStatus === 'completed' ? '🎉' : '⏰'}
            </div>
            <h2 className="text-2xl sm:text-4xl font-bold text-white mb-4 sm:mb-6">
              {gameStatus === 'completed' ? 'Puzzle Complete!' : 'Time\'s Up!'}
            </h2>

            <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6 sm:mb-8">
              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6">
                <Trophy className="w-6 h-6 sm:w-8 sm:h-8 text-yellow-400 mx-auto mb-1 sm:mb-2" />
                <div className="text-xl sm:text-3xl font-bold text-white mb-1">{score}</div>
                <div className="text-slate-400 text-xs sm:text-base">Final Score</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6">
                <Target className="w-6 h-6 sm:w-8 sm:h-8 text-green-400 mx-auto mb-1 sm:mb-2" />
                <div className="text-xl sm:text-3xl font-bold text-white mb-1">{accuracy}%</div>
                <div className="text-slate-400 text-xs sm:text-base">Accuracy</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6">
                <Zap className="w-6 h-6 sm:w-8 sm:h-8 text-orange-400 mx-auto mb-1 sm:mb-2" />
                <div className="text-xl sm:text-3xl font-bold text-white mb-1">{bestStreak}</div>
                <div className="text-slate-400 text-xs sm:text-base">Best Streak</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-3 sm:p-6">
                <Clock className="w-6 h-6 sm:w-8 sm:h-8 text-blue-400 mx-auto mb-1 sm:mb-2" />
                <div className="text-xl sm:text-3xl font-bold text-white mb-1">
                  {gameStatus === 'completed' ? `+${timeRemaining}` : '0'}
                </div>
                <div className="text-slate-400 text-xs sm:text-base">Time Bonus</div>
              </div>
            </div>

            <button
              onClick={onExit}
              className="px-6 sm:px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all active:scale-95 touch-target"
            >
              Back to Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-purple-300 hover:text-purple-200 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Exit</span>
        </button>

        <h2 className="text-2xl font-bold text-white">Single Player Mode</h2>

        <div className="w-20"></div>
      </div>

      {/* Stats Bar — scrollable row on mobile, 5-col on desktop */}
      <div className="flex gap-2 sm:grid sm:grid-cols-5 sm:gap-4 mb-4 sm:mb-6 overflow-x-auto hide-scrollbar pb-1 sm:pb-0">
        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-2.5 sm:p-4 border border-slate-700 min-w-[100px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-blue-400" />
            <span className="text-slate-400 text-[10px] sm:text-sm">Time</span>
          </div>
          <div className={`text-lg sm:text-2xl font-bold ${timeRemaining < 60 ? 'text-red-400' : 'text-white'}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-2.5 sm:p-4 border border-slate-700 min-w-[80px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <Trophy className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-yellow-400" />
            <span className="text-slate-400 text-[10px] sm:text-sm">Score</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-white">{score}</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-2.5 sm:p-4 border border-slate-700 min-w-[80px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <Zap className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-400" />
            <span className="text-slate-400 text-[10px] sm:text-sm">Streak</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-white">{streak}</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-2.5 sm:p-4 border border-slate-700 min-w-[80px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <Target className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-green-400" />
            <span className="text-slate-400 text-[10px] sm:text-sm">Accuracy</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-white">{accuracy}%</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-2.5 sm:p-4 border border-slate-700 min-w-[80px] sm:min-w-0 flex-shrink-0 sm:flex-shrink">
          <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1">
            <span className="text-slate-400 text-[10px] sm:text-sm">Placed</span>
          </div>
          <div className="text-lg sm:text-2xl font-bold text-white">
            {totalPlacements}/{gridSize * gridSize}
          </div>
        </div>
      </div>

      {/* Feedback */}
      {lastResult && (
        <div
          className={`mb-4 p-4 rounded-xl text-center font-semibold transition-all ${lastResult.correct
            ? 'bg-green-500/20 text-green-300 border border-green-500/30'
            : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}
        >
          {lastResult.correct ? '✓' : '✗'} {lastResult.correct ? 'Correct' : 'Wrong'}! {lastResult.points > 0 ? '+' : ''}{lastResult.points} points
        </div>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-12 gap-3 sm:gap-6">
        {/* Left Panel - Settings & Hints (hidden on mobile, shown at bottom) */}
        <div className="hidden lg:block lg:col-span-3 space-y-4">
          <GameSettingsPanel
            settings={gameSettings}
            onSettingsChange={setGameSettings}
          />

          <HintsPanel
            onUseHint={handleUseHint}
            hintsUsed={gameLogic.scores.playerA.hintsUsed}
            disabled={gameStatus !== 'playing'}
          />

          {activeHint && (
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-3 sm:p-4">
              <div className="text-yellow-300 font-semibold mb-1 sm:mb-2 text-sm">Active Hint:</div>
              <div className="text-white text-xs sm:text-sm">
                {activeHint.type === 'position' && `Piece ${activeHint.pieceId} goes to position ${activeHint.correctPosition}`}
                {activeHint.type === 'edge' && 'Edge pieces highlighted'}
                {activeHint.type === 'corner' && 'Corner pieces highlighted'}
                {activeHint.type === 'region' && `Piece ${activeHint.pieceId} is in region shown`}
              </div>
            </div>
          )}
        </div>

        {/* Center - Canvas */}
        <div className="lg:col-span-6">
          <div className="mb-2 sm:mb-4 flex justify-center">
            <ZoomControls
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
            />
          </div>

          <div className="flex justify-center game-board-container">
            <PuzzleCanvas
              grid={gameState.grid}
              gridSize={gridSize}
              ghostImage={imageUrl}
              settings={gameSettings}
              onCellClick={handleCellClick}
              onPieceDrop={handlePieceDrop}
              draggedPiece={draggedPiece}
              dragPosition={dragPosition}
              zoom={zoom}
              offset={offset}
            />
          </div>
        </div>

        {/* Right Panel - Piece Rack */}
        <div className="lg:col-span-3">
          <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-3 sm:p-4 border border-slate-700">
            <h3 className="text-white font-semibold mb-2 sm:mb-4 text-sm sm:text-base">Your Pieces</h3>
            <div className="grid grid-cols-5 lg:grid-cols-2 gap-1.5 sm:gap-2 max-h-[200px] lg:max-h-[600px] overflow-y-auto hide-scrollbar">
              {gameState.playerARack.filter(p => p !== null).map((piece) => (
                <button
                  key={piece.id}
                  onClick={() => handlePieceSelect(piece)}
                  onMouseDown={(e) => handleDragStart(piece, e)}
                  className={`relative rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing touch-target ${selectedPiece?.id === piece.id
                    ? 'border-purple-500 shadow-lg shadow-purple-500/50'
                    : 'border-slate-600 hover:border-slate-500'
                    }`}
                  draggable={false}
                >
                  <img
                    src={piece.imageData}
                    alt={`Piece ${piece.id}`}
                    className="w-full h-full object-cover rounded-lg"
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile-only Settings & Hints */}
        <div className="lg:hidden space-y-3">
          <GameSettingsPanel
            settings={gameSettings}
            onSettingsChange={setGameSettings}
          />
          <HintsPanel
            onUseHint={handleUseHint}
            hintsUsed={gameLogic.scores.playerA.hintsUsed}
            disabled={gameStatus !== 'playing'}
          />
        </div>
      </div>
    </div>
  );
};

export default SinglePlayerGame;
