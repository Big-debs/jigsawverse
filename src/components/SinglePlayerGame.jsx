import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { Trophy, Clock, Target, Zap } from 'lucide-react';
import { GameLogic } from '../lib/gameLogic';
import { ACCESSIBILITY_DEFAULTS, HINT_CONFIG } from '../lib/gameConfig';
import HintsPanel from './HintsPanel';
import GameSettingsPanel from './GameSettingsPanel';
import GameControls from './GameControls';

const PhaserGame = lazy(() => import('./PhaserGame'));

const SinglePlayerGame = ({
  imageUrl,
  gridDimensions,
  gridSize = 10,
  pieces = [],
  settings = ACCESSIBILITY_DEFAULTS,
  onExit
}) => {
  const puzzleDimensions = gridDimensions || {
    rows: gridSize,
    cols: gridSize,
    totalPieces: gridSize * gridSize
  };

  const [gameLogic] = useState(() => {
    const logic = new GameLogic(puzzleDimensions, pieces, 'SINGLE_PLAYER');
    logic.initializeSinglePlayer();
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
  const [gameStatus, setGameStatus] = useState('playing');
  const [lastResult, setLastResult] = useState(null);
  const [selectedPiece, setSelectedPiece] = useState(null);
  const [gameSettings, setGameSettings] = useState(settings);
  const [activeHint, setActiveHint] = useState(null);
  const [gameplayEffect, setGameplayEffect] = useState(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [hintError, setHintError] = useState('');

  const timerRef = useRef(null);
  const feedbackTimeoutRef = useRef(null);
  const hintTimeoutRef = useRef(null);
  const gameplayEventSequenceRef = useRef(0);
  const completionPendingRef = useRef(false);
  const completionTimeoutRef = useRef(null);
  const lastVisibleScoreRef = useRef(0);

  useEffect(() => {
    window.localStorage.setItem('jigsawverse-settings', JSON.stringify(gameSettings));
  }, [gameSettings]);

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
    if (allPlaced && !completionPendingRef.current) {
      completionPendingRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);

      setGameplayEffect({
        id: `single-game-completed-${Date.now()}-${++gameplayEventSequenceRef.current}`,
        type: 'game_completed',
        timestamp: Date.now()
      });

      // Award time bonus, then leave enough time for the final board effect.
      const timeBonus = timeRemaining;
      setScore(prev => prev + timeBonus);
      completionTimeoutRef.current = setTimeout(
        () => setGameStatus('completed'),
        gameSettings.reducedMotion ? 50 : 650
      );
    }
  }, [gameSettings.reducedMotion, gameState.grid, gameStatus, timeRemaining]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      if (completionTimeoutRef.current) clearTimeout(completionTimeoutRef.current);
    };
  }, []);

  const emitGameplayEffect = useCallback((type, payload = {}) => {
    setGameplayEffect({
      id: `single-${type}-${Date.now()}-${++gameplayEventSequenceRef.current}`,
      type,
      timestamp: Date.now(),
      ...payload
    });
  }, []);

  const handlePiecePlacement = useCallback((pieceId, gridIndex) => {
    if (gameStatus !== 'playing') return;

    const result = gameLogic.placePiece('playerA', pieceId, gridIndex);
    if (!result.success) {
      emitGameplayEffect('placement_rejected', { gridIndex, pieceId });
      return;
    }

    emitGameplayEffect('piece_placed', {
      actor: 'playerA',
      gridIndex,
      pieceId
    });

    setTotalAttempts(prev => prev + 1);
    const milestone = gameLogic.reconcileSinglePlayerMilestone();

    setTotalPlacements(gameLogic.scores.playerA.totalPlacements);

    if (milestone.reached) {
      const revealedScore = gameLogic.revealedScores.playerA.score;
      const scoreDelta = revealedScore - lastVisibleScoreRef.current;
      lastVisibleScoreRef.current = revealedScore;
      setScore(revealedScore);
      setStreak(gameLogic.scores.playerA.streak);
      setBestStreak(prev => Math.max(prev, gameLogic.scores.playerA.streak));
      setCorrectPlacements(gameLogic.scores.playerA.correctPlacements);
      setAccuracy(gameLogic.scores.playerA.accuracy);
      emitGameplayEffect('milestone_reveal', {
        points: scoreDelta,
        anchorCell: gridIndex,
        correctCells: milestone.correctCells,
        removedCells: milestone.removedCells,
        streak: gameLogic.scores.playerA.streak
      });

      setLastResult({
        correct: true,
        message: `Milestone! ${milestone.removedCount > 0 ? `${milestone.removedCount} wrong piece(s) returned.` : 'All correct!'}`
      });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 4000);
    } else {
      // Before milestone: hide correctness — just show neutral placement feedback
      setLastResult({
        correct: null,  // null = neutral (no green/red reveal)
        message: 'Piece placed'
      });
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
      feedbackTimeoutRef.current = setTimeout(() => setLastResult(null), 800);
    }

    setGameState(gameLogic.getGameState());
    setSelectedPiece(null);
  }, [emitGameplayEffect, gameLogic, gameStatus]);

  const handleUseHint = async (hintType) => {
    if (hintBusy) return;
    setHintBusy(true);
    setHintError('');
    try {
      const result = gameLogic.useHint('playerA', hintType);
      if (!result.success) {
        setHintError(result.message);
        return;
      }

      setScore(gameLogic.revealedScores.playerA.score);
      lastVisibleScoreRef.current = gameLogic.revealedScores.playerA.score;
      setGameState(gameLogic.getGameState());
      setActiveHint(result.hint);
      emitGameplayEffect('hint_activated', { hintType, hintId: result.hint.id });

      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        setActiveHint(current => current?.id === result.hint.id ? null : current);
      }, result.hint.duration);
    } finally {
      setHintBusy(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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
    <div className="game-play-shell max-w-4xl mx-auto pb-20 lg:pb-4">
      <div className="game-compact-hud mb-3" aria-label="Game statistics">
        <div className="game-hud-title">
          <span>Solo</span>
          <span>{totalPlacements}/{puzzleDimensions.totalPieces} placed</span>
        </div>
        <div className="game-hud-stat">
          <Clock className="w-4 h-4 text-blue-400" />
          <span>Time</span>
          <strong className={timeRemaining < 60 ? 'text-red-400' : 'text-white'}>{formatTime(timeRemaining)}</strong>
        </div>
        <div className="game-hud-stat">
          <Trophy className="w-4 h-4 text-yellow-400" />
          <span>Score</span>
          <strong>{score}</strong>
        </div>
        <div className="game-hud-stat">
          <Zap className="w-4 h-4 text-orange-400" />
          <span>Streak</span>
          <strong>{streak}</strong>
        </div>
        <div className="game-hud-stat">
          <Target className="w-4 h-4 text-green-400" />
          <span>Accuracy</span>
          <strong>{accuracy}%</strong>
        </div>
      </div>

      {/* Feedback */}
      {lastResult && (
        <div
          className={`game-toast text-center font-semibold transition-all text-sm sm:text-base ${lastResult.correct === null
            ? 'bg-white/10 text-white/70 border border-white/10'
            : lastResult.correct
              ? 'bg-green-500/20 text-green-300 border border-green-500/30'
              : 'bg-red-500/20 text-red-300 border border-red-500/30'
            }`}
        >
          {lastResult.correct === null
            ? `◆ ${lastResult.message}`
            : lastResult.correct
              ? `✓ ${lastResult.message}`
              : `✗ ${lastResult.message}`}
        </div>
      )}

      <div>
        <div>
          <Suspense fallback={
            <div className="w-full bg-slate-900/50 rounded-xl flex items-center justify-center" style={{ minHeight: '400px' }}>
              <div className="text-purple-300 text-lg">Loading game...</div>
            </div>
          }>
            <PhaserGame
              gameState={gameState}
              gridDimensions={puzzleDimensions}
              ghostImage={imageUrl}
              settings={gameSettings}
              myRack={gameState.playerARack}
              myPlayer="playerA"
              selectedPiece={selectedPiece}
              activeHint={activeHint}
              gameplayEffect={gameplayEffect}
              onPieceSelected={(piece) => {
                setSelectedPiece(piece);
                emitGameplayEffect('piece_selected', { pieceId: piece?.id });
              }}
              onPiecePlaced={(pieceId, gridIndex) => {
                handlePiecePlacement(pieceId, gridIndex);
              }}
            />
          </Suspense>
        </div>

      </div>

      <GameControls
        activeHint={activeHint}
        hintsRemaining={Math.max(0, HINT_CONFIG.MAX_HINTS_PER_GAME - (gameState?.scores?.playerA?.hintsUsed || 0))}
        onExit={onExit}
        settingsPanel={(
          <GameSettingsPanel settings={gameSettings} onSettingsChange={setGameSettings} />
        )}
        hintsPanel={(
          <HintsPanel
            onUseHint={handleUseHint}
            hintsUsed={gameState?.scores?.playerA?.hintsUsed || 0}
            disabled={gameStatus !== 'playing'}
            busy={hintBusy}
            error={hintError}
            activeHint={activeHint}
          />
        )}
      />
    </div>
  );
};

export default SinglePlayerGame;
