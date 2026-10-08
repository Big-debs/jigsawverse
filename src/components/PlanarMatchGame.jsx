import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Lightbulb,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  DEFAULT_BOARD_SIZE,
  TILE_KINDS,
  cascadeScore,
  collapseAndRefill,
  createInitialBoard,
  findMatches,
  moveLabel,
  scoringMoves,
  shiftLine,
} from '../lib/planarMatchEngine';
import './PlanarMatchGame.css';

const STARTING_MOVES = 18;
const TARGET_SCORE = 6000;
const SHIFT_DURATION = 280;
const CLEAR_DURATION = 340;
const DROP_DURATION = 300;

const TILE_META = Object.fromEntries(TILE_KINDS.map((tile) => [tile.id, tile]));

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

function captureTileRects(container) {
  if (!container) return new Map();
  return new Map(
    Array.from(container.querySelectorAll('[data-tile-id]')).map((element) => {
      const rect = element.getBoundingClientRect();
      return [element.dataset.tileId, { left: rect.left, top: rect.top }];
    }),
  );
}

function createGame(seed = Date.now() >>> 0) {
  const generated = createInitialBoard({ size: DEFAULT_BOARD_SIZE, seed });
  return { ...generated, score: 0, movesLeft: STARTING_MOVES };
}

function DirectionButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className="planar-match__direction"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function PlanarMatchGame({ onExit }) {
  const gameRef = useRef(null);
  if (!gameRef.current) gameRef.current = createGame();

  const boardRef = useRef(null);
  const pointerRef = useRef(null);
  const runIdRef = useRef(0);
  const [board, setBoard] = useState(gameRef.current.board);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(STARTING_MOVES);
  const [bestCascade, setBestCascade] = useState(0);
  const [matchedIndices, setMatchedIndices] = useState(new Set());
  const [newTileIds, setNewTileIds] = useState(new Set());
  const [movement, setMovement] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hintMove, setHintMove] = useState(null);
  const [status, setStatus] = useState('Shift a complete row or column to make a match.');
  const [lastGain, setLastGain] = useState(0);
  const [gameResult, setGameResult] = useState(null);

  const progress = Math.min(100, Math.round((score / TARGET_SCORE) * 100));
  const matched = matchedIndices;

  useEffect(() => () => {
    runIdRef.current += 1;
  }, []);

  const finishTurn = useCallback((workingBoard, remainingMoves, runId, finalScore) => {
    if (runIdRef.current !== runId) return;

    const availableMoves = scoringMoves(workingBoard, DEFAULT_BOARD_SIZE);
    const reshuffled = !availableMoves.length;
    if (reshuffled) {
      const replacement = createGame(Date.now() >>> 0);
      gameRef.current.random = replacement.random;
      gameRef.current.nextId = replacement.nextId;
      setBoard(replacement.board);
      setStatus('No scoring shifts remained, so the lattice reshuffled.');
    }

    setBusy(false);
    if (remainingMoves === 0) {
      setGameResult(finalScore >= TARGET_SCORE ? 'won' : 'lost');
    } else if (!reshuffled) {
      setStatus('Choose the next row or column. Matches can wrap across an edge.');
    }
  }, []);

  const resolveCascades = useCallback(async (startingBoard, remainingMoves, runId) => {
    let workingBoard = startingBoard;
    let cascade = 1;
    let totalGain = 0;

    while (runIdRef.current === runId) {
      const matches = findMatches(workingBoard, DEFAULT_BOARD_SIZE);
      if (!matches.indices.length) break;

      setMatchedIndices(new Set(matches.indices));
      setStatus(cascade === 1 ? 'Match found.' : `Cascade ×${cascade}!`);
      await wait(CLEAR_DURATION);
      if (runIdRef.current !== runId) return;

      const collapsed = collapseAndRefill(workingBoard, matches.indices, {
        size: DEFAULT_BOARD_SIZE,
        random: gameRef.current.random,
        nextId: gameRef.current.nextId,
      });
      const gain = cascadeScore(matches.indices.length, cascade);
      totalGain += gain;
      workingBoard = collapsed.board;
      setMatchedIndices(new Set());
      setNewTileIds(new Set(collapsed.createdIds));
      setBoard(workingBoard);
      setScore((current) => current + gain);
      setLastGain(totalGain);
      setBestCascade((current) => Math.max(current, cascade));
      await wait(DROP_DURATION);
      setNewTileIds(new Set());
      cascade += 1;
    }

    finishTurn(workingBoard, remainingMoves, runId, score + totalGain);
  }, [finishTurn, score]);

  useLayoutEffect(() => {
    if (!movement || !boardRef.current) return undefined;

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const animations = [];

    if (!reduceMotion) {
      boardRef.current.querySelectorAll('[data-tile-id]').forEach((element) => {
        const source = movement.sourceRects.get(element.dataset.tileId);
        if (!source || typeof element.animate !== 'function') return;
        const destination = element.getBoundingClientRect();
        animations.push(element.animate(
          [
            { transform: `translate(${source.left - destination.left}px, ${source.top - destination.top}px)`, zIndex: 3 },
            { transform: 'translate(0, 0)', zIndex: 3 },
          ],
          { duration: SHIFT_DURATION, easing: 'cubic-bezier(.22,.8,.22,1)' },
        ));
      });
    }

    let cancelled = false;
    const finish = () => {
      if (cancelled || runIdRef.current !== movement.runId) return;
      setMovement(null);
      resolveCascades(movement.board, movement.remainingMoves, movement.runId);
    };

    if (animations.length) {
      Promise.allSettled(animations.map((animation) => animation.finished)).then(finish);
    } else {
      window.requestAnimationFrame(finish);
    }

    const fallback = window.setTimeout(finish, SHIFT_DURATION + 120);
    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
      animations.forEach((animation) => animation.cancel());
    };
  }, [movement, resolveCascades]);

  const performMove = useCallback((move) => {
    if (busy || movesLeft <= 0 || gameResult) return;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;
    const sourceRects = captureTileRects(boardRef.current);
    const shiftedBoard = shiftLine(board, move, DEFAULT_BOARD_SIZE);
    const remainingMoves = movesLeft - 1;

    setBusy(true);
    setHintMove(null);
    setLastGain(0);
    setMovesLeft(remainingMoves);
    setStatus(moveLabel(move));
    setBoard(shiftedBoard);
    setMovement({
      runId,
      board: shiftedBoard,
      sourceRects,
      remainingMoves,
    });
  }, [board, busy, gameResult, movesLeft]);

  const resetGame = useCallback(() => {
    runIdRef.current += 1;
    const next = createGame();
    gameRef.current = next;
    setBoard(next.board);
    setScore(0);
    setMovesLeft(STARTING_MOVES);
    setBestCascade(0);
    setMatchedIndices(new Set());
    setNewTileIds(new Set());
    setMovement(null);
    setBusy(false);
    setHintMove(null);
    setLastGain(0);
    setGameResult(null);
    setStatus('New lattice ready. Shift a complete row or column.');
  }, []);

  const showHint = () => {
    if (busy || gameResult) return;
    const moves = scoringMoves(board, DEFAULT_BOARD_SIZE);
    const move = moves[0] ?? null;
    setHintMove(move);
    setStatus(move ? `Try ${moveLabel(move).toLowerCase()}.` : 'No scoring move found.');
  };

  const handlePointerDown = (event, index) => {
    if (busy || gameResult) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerRef.current = {
      x: event.clientX,
      y: event.clientY,
      row: Math.floor(index / DEFAULT_BOARD_SIZE),
      column: index % DEFAULT_BOARD_SIZE,
    };
  };

  const handlePointerUp = (event) => {
    const start = pointerRef.current;
    pointerRef.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      performMove({ axis: 'row', index: start.row, direction: dx > 0 ? 1 : -1 });
    } else {
      performMove({ axis: 'column', index: start.column, direction: dy > 0 ? 1 : -1 });
    }
  };

  const handleKeyDown = (event, index) => {
    const row = Math.floor(index / DEFAULT_BOARD_SIZE);
    const column = index % DEFAULT_BOARD_SIZE;
    const movesByKey = {
      ArrowLeft: { axis: 'row', index: row, direction: -1 },
      ArrowRight: { axis: 'row', index: row, direction: 1 },
      ArrowUp: { axis: 'column', index: column, direction: -1 },
      ArrowDown: { axis: 'column', index: column, direction: 1 },
    };
    if (!movesByKey[event.key]) return;
    event.preventDefault();
    performMove(movesByKey[event.key]);
  };

  const hintedIndices = useMemo(() => {
    if (!hintMove) return new Set();
    return new Set(Array.from({ length: DEFAULT_BOARD_SIZE }, (_, offset) =>
      hintMove.axis === 'row'
        ? hintMove.index * DEFAULT_BOARD_SIZE + offset
        : offset * DEFAULT_BOARD_SIZE + hintMove.index,
    ));
  }, [hintMove]);

  return (
    <div className="planar-match">
      <header className="planar-match__header">
        <button type="button" className="planar-match__back" onClick={onExit}>
          <ArrowLeft size={18} />
          JigsawVerse
        </button>
        <div className="planar-match__title">
          <p>PLANAR MATCH / MECHANICS PROTOTYPE</p>
          <h2>Shift the lattice. Build the chain.</h2>
          <span>Move full rows and columns. Three matching symbols clear; every cascade multiplies the score.</span>
        </div>
        <button type="button" className="planar-match__new" onClick={resetGame}>
          <RotateCcw size={17} />
          New game
        </button>
      </header>

      <section className="planar-match__hud" aria-label="Game status">
        <div><span>Score</span><strong>{score.toLocaleString()}</strong></div>
        <div><span>Target</span><strong>{TARGET_SCORE.toLocaleString()}</strong></div>
        <div><span>Moves</span><strong>{movesLeft}</strong></div>
        <div><span>Best chain</span><strong>×{bestCascade}</strong></div>
        <div className="planar-match__progress">
          <span style={{ width: `${progress}%` }} />
        </div>
      </section>

      <div className="planar-match__layout">
        <section className="planar-match__play-area">
          <div className="planar-match__column-controls planar-match__column-controls--top">
            <span />
            {Array.from({ length: DEFAULT_BOARD_SIZE }, (_, column) => (
              <DirectionButton
                key={`up-${column}`}
                label={`Shift column ${column + 1} up`}
                disabled={busy || Boolean(gameResult)}
                onClick={() => performMove({ axis: 'column', index: column, direction: -1 })}
              >
                <ArrowUp size={16} />
              </DirectionButton>
            ))}
            <span />
          </div>

          <div className="planar-match__board-row">
            <div className="planar-match__row-controls">
              {Array.from({ length: DEFAULT_BOARD_SIZE }, (_, row) => (
                <DirectionButton
                  key={`left-${row}`}
                  label={`Shift row ${row + 1} left`}
                  disabled={busy || Boolean(gameResult)}
                  onClick={() => performMove({ axis: 'row', index: row, direction: -1 })}
                >
                  <ArrowLeft size={16} />
                </DirectionButton>
              ))}
            </div>

            <div
              className={`planar-match__board ${busy ? 'is-busy' : ''}`}
              style={{ '--board-size': DEFAULT_BOARD_SIZE }}
              ref={boardRef}
              aria-label="Six by six planar match board"
            >
              {board.map((tile, index) => {
                const meta = TILE_META[tile.kind];
                return (
                  <button
                    type="button"
                    key={tile.id}
                    data-tile-id={tile.id}
                    className={`planar-match__tile ${matched.has(index) ? 'is-matched' : ''} ${newTileIds.has(tile.id) ? 'is-new' : ''} ${hintedIndices.has(index) ? 'is-hinted' : ''}`}
                    style={{ '--tile-color': meta.color }}
                    aria-label={`${meta.label}, row ${Math.floor(index / DEFAULT_BOARD_SIZE) + 1}, column ${(index % DEFAULT_BOARD_SIZE) + 1}`}
                    onPointerDown={(event) => handlePointerDown(event, index)}
                    onPointerUp={handlePointerUp}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    disabled={busy || Boolean(gameResult)}
                  >
                    <span aria-hidden="true">{meta.glyph}</span>
                  </button>
                );
              })}
            </div>

            <div className="planar-match__row-controls">
              {Array.from({ length: DEFAULT_BOARD_SIZE }, (_, row) => (
                <DirectionButton
                  key={`right-${row}`}
                  label={`Shift row ${row + 1} right`}
                  disabled={busy || Boolean(gameResult)}
                  onClick={() => performMove({ axis: 'row', index: row, direction: 1 })}
                >
                  <ArrowRight size={16} />
                </DirectionButton>
              ))}
            </div>
          </div>

          <div className="planar-match__column-controls planar-match__column-controls--bottom">
            <span />
            {Array.from({ length: DEFAULT_BOARD_SIZE }, (_, column) => (
              <DirectionButton
                key={`down-${column}`}
                label={`Shift column ${column + 1} down`}
                disabled={busy || Boolean(gameResult)}
                onClick={() => performMove({ axis: 'column', index: column, direction: 1 })}
              >
                <ArrowDown size={16} />
              </DirectionButton>
            ))}
            <span />
          </div>

          <div className="planar-match__status" aria-live="polite">
            {busy ? <RefreshCw size={17} className="planar-match__spin" /> : <Sparkles size={17} />}
            <span>{status}</span>
            {lastGain > 0 && <strong>+{lastGain.toLocaleString()}</strong>}
          </div>
        </section>

        <aside className="planar-match__guide">
          <p className="planar-match__kicker">HOW THIS VERSION PLAYS</p>
          <h3>Shift, cross, chain.</h3>
          <ol>
            <li><strong>Shift</strong><span>Swipe a tile or use the arrows to rotate its entire row or column.</span></li>
            <li><strong>Cross</strong><span>Build three or more identical symbols horizontally or vertically—even across an edge.</span></li>
            <li><strong>Chain</strong><span>Cleared spaces collapse downward. New symbols can trigger multiplied cascades.</span></li>
          </ol>
          <button type="button" onClick={showHint} disabled={busy || Boolean(gameResult)}>
            <Lightbulb size={17} />
            Highlight a scoring line
          </button>
          <p className="planar-match__note">This sprint validates the core loop. Locks, power tiles, rotations, gears, progression and multiplayer come after the movement feels right.</p>
        </aside>
      </div>

      {gameResult && (
        <div className="planar-match__result" role="dialog" aria-modal="true" aria-labelledby="planar-result-title">
          <div>
            <p>{gameResult === 'won' ? 'TARGET REACHED' : 'RUN COMPLETE'}</p>
            <h3 id="planar-result-title">
              {gameResult === 'won' ? 'The lattice is singing.' : 'The chain needs another pass.'}
            </h3>
            <span>Final score: {score.toLocaleString()} / {TARGET_SCORE.toLocaleString()}</span>
            <button type="button" onClick={resetGame}>Play again</button>
          </div>
        </div>
      )}
    </div>
  );
}
