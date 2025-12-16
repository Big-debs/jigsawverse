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
    // Put all pieces in player rack for single player - SHUFFLED
    logic.piecePool = logic.shufflePieces();
    logic.playerARack = [];
    logic.fillRack('playerA');
    logic.gameState = 'active';
    return logic;
  });

  const [gameState, setGameState] = useState(gameLogic.getGameState());
  const [timeRemaining, setTimeRemaining] = useState(300); // 5 minutes
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [correctPlacements, setCorrectPlacements] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
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

    const isCorrect = validation.correct;
    setTotalAttempts(prev => prev + 1);

    if (isCorrect) {
      // Correct placement
      gameLogic.grid[gridIndex] = validation.piece;
      
      // Remove from rack
      const pieceIndex = gameLogic.playerARack.findIndex(p => p && p.id === pieceId);
      if (pieceIndex !== -1) {
        gameLogic.playerARack[pieceIndex] = null;
      }

      // Update stats
      const newStreak = streak + 1;
      setStreak(newStreak);
      setBestStreak(prev => Math.max(prev, newStreak));
      setCorrectPlacements(prev => prev + 1);

      // Calculate points with streak bonus
      let points = scoring.correctPiece;
      if (newStreak >= scoring.streakBonusThreshold) {
        const multiplier = 1 + (scoring.streakMultiplier * 0.2);
        points = Math.floor(points * multiplier);
      }
      setScore(prev => prev + points);

      // Show feedback
      setLastResult({ correct: true, points });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 2000);

      // Refill rack if needed
      if (gameLogic.playerARack.filter(p => p !== null).length === 0 && gameLogic.piecePool.length > 0) {
        gameLogic.fillRack('playerA');
      }
    } else {
      // Wrong placement
      setStreak(0);

      const points = scoring.wrongPiece;
      setScore(prev => prev + points); // points is negative

      // Show feedback
      setLastResult({ correct: false, points });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 2000);

      // Piece stays in rack (don't remove)
    }

    // Update game state
    setGameState(gameLogic.getGameState());
    setSelectedPiece(null);
    setDraggedPiece(null);
    setDragPosition(null);
  }, [gameLogic, gameStatus, streak, scoring]);

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

  const accuracy = totalAttempts > 0 ? Math.round((correctPlacements / totalAttempts) * 100) : 100;

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
        <div className="bg-gradient-to-br from-purple-900/50 to-pink-900/50 backdrop-blur-md rounded-2xl p-8 border border-purple-500/30">
          <div className="text-center">
            <div className="text-6xl mb-4">
              {gameStatus === 'completed' ? '🎉' : '⏰'}
            </div>
            <h2 className="text-4xl font-bold text-white mb-6">
              {gameStatus === 'completed' ? 'Puzzle Complete!' : 'Time\'s Up!'}
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-800/50 rounded-xl p-6">
                <Trophy className="w-8 h-8 text-yellow-400 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">{score}</div>
                <div className="text-slate-400">Final Score</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6">
                <Target className="w-8 h-8 text-green-400 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">{accuracy}%</div>
                <div className="text-slate-400">Accuracy</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6">
                <Zap className="w-8 h-8 text-orange-400 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">{bestStreak}</div>
                <div className="text-slate-400">Best Streak</div>
              </div>

              <div className="bg-slate-800/50 rounded-xl p-6">
                <Clock className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                <div className="text-3xl font-bold text-white mb-1">
                  {gameStatus === 'completed' ? `+${timeRemaining}` : '0'}
                </div>
                <div className="text-slate-400">Time Bonus</div>
              </div>
            </div>

            <button
              onClick={onExit}
              className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-semibold rounded-xl transition-all"
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

      {/* Stats Bar */}
      <div className="grid grid-cols-5 gap-4 mb-6">
        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-blue-400" />
            <span className="text-slate-400 text-sm">Time</span>
          </div>
          <div className={`text-2xl font-bold ${timeRemaining < 60 ? 'text-red-400' : 'text-white'}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <span className="text-slate-400 text-sm">Score</span>
          </div>
          <div className="text-2xl font-bold text-white">{score}</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 text-orange-400" />
            <span className="text-slate-400 text-sm">Streak</span>
          </div>
          <div className="text-2xl font-bold text-white">{streak}</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-green-400" />
            <span className="text-slate-400 text-sm">Accuracy</span>
          </div>
          <div className="text-2xl font-bold text-white">{accuracy}%</div>
        </div>

        <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-slate-400 text-sm">Placed</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {correctPlacements}/{gridSize * gridSize}
          </div>
        </div>
      </div>

      {/* Feedback */}
      {lastResult && (
        <div
          className={`mb-4 p-4 rounded-xl text-center font-semibold transition-all ${
            lastResult.correct
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}
        >
          {lastResult.correct ? '✓' : '✗'} {lastResult.correct ? 'Correct' : 'Wrong'}! {lastResult.points > 0 ? '+' : ''}{lastResult.points} points
        </div>
      )}

      <div className="grid grid-cols-12 gap-6">
        {/* Left Panel - Settings & Hints */}
        <div className="col-span-3 space-y-4">
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
            <div className="bg-yellow-500/20 border border-yellow-500/30 rounded-xl p-4">
              <div className="text-yellow-300 font-semibold mb-2">Active Hint:</div>
              <div className="text-white text-sm">
                {activeHint.type === 'position' && `Piece ${activeHint.pieceId} goes to position ${activeHint.correctPosition}`}
                {activeHint.type === 'edge' && 'Edge pieces highlighted'}
                {activeHint.type === 'corner' && 'Corner pieces highlighted'}
                {activeHint.type === 'region' && `Piece ${activeHint.pieceId} is in region shown`}
              </div>
            </div>
          )}
        </div>

        {/* Center - Canvas */}
        <div className="col-span-6">
          <div className="mb-4 flex justify-center">
            <ZoomControls
              zoom={zoom}
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onZoomReset={handleZoomReset}
            />
          </div>

          <div className="flex justify-center">
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
        <div className="col-span-3">
          <div className="bg-slate-800/80 backdrop-blur-md rounded-xl p-4 border border-slate-700">
            <h3 className="text-white font-semibold mb-4">Your Pieces</h3>
            <div className="grid grid-cols-2 gap-2 max-h-[600px] overflow-y-auto">
              {gameState.playerARack.filter(p => p !== null).map((piece) => (
                <button
                  key={piece.id}
                  onClick={() => handlePieceSelect(piece)}
                  onMouseDown={(e) => handleDragStart(piece, e)}
                  className={`relative rounded-lg border-2 transition-all cursor-grab active:cursor-grabbing ${
                    selectedPiece?.id === piece.id
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
      </div>
    </div>
  );
};

export default SinglePlayerGame;
