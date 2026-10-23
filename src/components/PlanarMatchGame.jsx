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
import { evaluateRailGesture } from '../lib/planarMatchInteraction';
import './PlanarMatchGame.css';

const STARTING_MOVES = 18;
const TARGET_SCORE = 6000;
const SHIFT_DURATION = 280;
const CLEAR_DURATION = 340;
const DROP_DURATION = 300;

const TILE_META = Object.fromEntries(TILE_KINDS.map((tile) => [tile.id, tile]));

const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));

function lineTileIds(board, move) {
  return Array.from({ length: DEFAULT_BOARD_SIZE }, (_, offset) => {
    const index = move.axis === 'row'
      ? move.index * DEFAULT_BOARD_SIZE + offset
      : offset * DEFAULT_BOARD_SIZE + move.index;
    return board[index].id;
  });
}

function wrappingTileId(board, move) {
  const edge = move.direction > 0 ? DEFAULT_BOARD_SIZE - 1 : 0;
  const index = move.axis === 'row'
    ? move.index * DEFAULT_BOARD_SIZE + edge
    : edge * DEFAULT_BOARD_SIZE + move.index;
  return board[index].id;
}

function captureTileRects(container, tileIds) {
  if (!container) return new Map();
  const wanted = new Set(tileIds);
  return new Map(
    Array.from(container.querySelectorAll('[data-tile-id]'))
      .filter((element) => wanted.has(element.dataset.tileId))
      .map((element) => {
      const rect = element.getBoundingClientRect();
      return [element.dataset.tileId, {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }];
      }),
  );
}

function createGame(seed = Date.now() >>> 0) {
  const generated = createInitialBoard({ size: DEFAULT_BOARD_SIZE, seed });
  return { ...generated, score: 0, movesLeft: STARTING_MOVES };
}

function DirectionButton({
  label,
  onClick,
  onPointerDown,
  onPointerUp,
  onPointerMove,
  onPointerCancel,
  active,
  ready,
  disabled,
  children,
}) {
  return (
    <button
      type="button"
      className={`planar-match__direction ${active ? 'is-gesture-active' : ''} ${ready ? 'is-gesture-ready' : ''}`}
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
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
  const railGestureRef = useRef(null);
  const suppressClickRef = useRef(false);
  const runIdRef = useRef(0);
  const [board, setBoard] = useState(gameRef.current.board);
  const [score, setScore] = useState(0);
  const [movesLeft, setMovesLeft] = useState(STARTING_MOVES);
  const [bestCascade, setBestCascade] = useState(0);
  const [matchedIndices, setMatchedIndices] = useState(new Set());
  const [newTileIds, setNewTileIds] = useState(new Set());
  const [movement, setMovement] = useState(null);
  const [railPreview, setRailPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hintMove, setHintMove] = useState(null);
  const [status, setStatus] = useState('Shift a complete row or column to make a match.');
  const [lastGain, setLastGain] = useState(0);
  const [gameResult, setGameResult] = useState(null);
  const [coachStep, setCoachStep] = useState(0);
  const [coachDismissed, setCoachDismissed] = useState(false);

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
      setCoachStep((current) => Math.max(current, 2));
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
      const styles = window.getComputedStyle(boardRef.current);
      const columnGap = Number.parseFloat(styles.columnGap) || 0;
      const rowGap = Number.parseFloat(styles.rowGap) || 0;

      boardRef.current.querySelectorAll('[data-tile-id]').forEach((element) => {
        const source = movement.sourceRects.get(element.dataset.tileId);
        if (!source || typeof element.animate !== 'function') return;
        const destination = element.getBoundingClientRect();
        const translateX = source.left - destination.left;
        const translateY = source.top - destination.top;
        const isWrappingTile = element.dataset.tileId === movement.wrappingTileId;
        const keyframes = isWrappingTile
          ? movement.move.axis === 'row'
            ? [
              { transform: `translate(${translateX}px, ${translateY}px)`, offset: 0, zIndex: 4 },
              { transform: `translate(${translateX + movement.move.direction * (destination.width + columnGap)}px, ${translateY}px)`, offset: 0.48, zIndex: 4 },
              { transform: `translate(${-movement.move.direction * (destination.width + columnGap)}px, 0)`, offset: 0.52, zIndex: 4 },
              { transform: 'translate(0, 0)', offset: 1, zIndex: 4 },
            ]
            : [
              { transform: `translate(${translateX}px, ${translateY}px)`, offset: 0, zIndex: 4 },
              { transform: `translate(${translateX}px, ${translateY + movement.move.direction * (destination.height + rowGap)}px)`, offset: 0.48, zIndex: 4 },
              { transform: `translate(0, ${-movement.move.direction * (destination.height + rowGap)}px)`, offset: 0.52, zIndex: 4 },
              { transform: 'translate(0, 0)', offset: 1, zIndex: 4 },
            ]
          : [
            { transform: `translate(${translateX}px, ${translateY}px)`, zIndex: 3 },
            { transform: 'translate(0, 0)', zIndex: 3 },
          ];
        animations.push(element.animate(
          keyframes,
          { duration: SHIFT_DURATION, easing: isWrappingTile ? 'linear' : 'cubic-bezier(.22,.8,.22,1)' },
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
    const movedTileIds = lineTileIds(board, move);
    const sourceRects = captureTileRects(boardRef.current, movedTileIds);
    const shiftedBoard = shiftLine(board, move, DEFAULT_BOARD_SIZE);
    const remainingMoves = movesLeft - 1;

    setBusy(true);
    setRailPreview(null);
    setCoachStep((current) => Math.max(current, 1));
    setHintMove(null);
    setLastGain(0);
    setMovesLeft(remainingMoves);
    setStatus(moveLabel(move));
    setBoard(shiftedBoard);
    setMovement({
      runId,
      board: shiftedBoard,
      move,
      movedTileIds,
      wrappingTileId: wrappingTileId(board, move),
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
    setRailPreview(null);
    setBusy(false);
    setHintMove(null);
    setLastGain(0);
    setGameResult(null);
    setCoachStep(0);
    setCoachDismissed(false);
    setStatus('New lattice ready. Shift a complete row or column.');
  }, []);

  const showHint = () => {
    if (busy || gameResult) return;
    const moves = scoringMoves(board, DEFAULT_BOARD_SIZE);
    const move = moves[0] ?? null;
    setHintMove(move);
    setStatus(move ? `Try ${moveLabel(move).toLowerCase()}.` : 'No scoring move found.');
  };

  const handleRailPointerDown = (event, axis, index) => {
    if (busy || gameResult) return;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    railGestureRef.current = {
      x: event.clientX,
      y: event.clientY,
      axis,
      index,
      threshold: Math.max(24, (boardRef.current?.getBoundingClientRect().width ?? 360) / DEFAULT_BOARD_SIZE * 0.42),
    };
    setRailPreview({ axis, index, delta: 0, ready: false });
    setStatus(`Drag ${axis === 'row' ? 'sideways' : 'vertically'}; release when the rail glows.`);
  };

  const handleRailPointerMove = (event) => {
    const start = railGestureRef.current;
    if (!start) return;

    const gesture = evaluateRailGesture({
      axis: start.axis,
      startX: start.x,
      startY: start.y,
      currentX: event.clientX,
      currentY: event.clientY,
      threshold: start.threshold,
    });
    const direction = gesture.direction > 0
      ? (start.axis === 'row' ? 'right' : 'down')
      : (start.axis === 'row' ? 'left' : 'up');

    setRailPreview({
      axis: start.axis,
      index: start.index,
      delta: gesture.aligned ? gesture.previewDelta : 0,
      ready: gesture.ready,
    });
    setStatus(
      gesture.aligned
        ? gesture.ready
          ? `Release to shift ${start.axis} ${start.index + 1} ${direction}.`
          : `Keep dragging ${direction} to engage the rail.`
        : `Follow the ${start.axis === 'row' ? 'horizontal' : 'vertical'} rail to shift it.`,
    );
  };

  const handleRailPointerUp = (event) => {
    const start = railGestureRef.current;
    railGestureRef.current = null;
    if (!start) return;
    const gesture = evaluateRailGesture({
      axis: start.axis,
      startX: start.x,
      startY: start.y,
      currentX: event.clientX,
      currentY: event.clientY,
      threshold: start.threshold,
    });

    setRailPreview(null);
    if (!gesture.moved) return;

    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (gesture.ready) {
      window.requestAnimationFrame(() => {
        performMove({ axis: start.axis, index: start.index, direction: gesture.direction });
      });
    } else {
      setStatus(gesture.aligned ? 'Shift cancelled. Drag past the glow point to move the line.' : 'Shift cancelled. Follow the rail direction.');
    }
  };

  const handleRailPointerCancel = () => {
    railGestureRef.current = null;
    setRailPreview(null);
    setStatus('Shift cancelled. Choose a row or column.');
  };

  const handleDirectionClick = (move) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    performMove(move);
  };

  const hintedIndices = useMemo(() => {
    if (!hintMove) return new Set();
    return new Set(Array.from({ length: DEFAULT_BOARD_SIZE }, (_, offset) =>
      hintMove.axis === 'row'
        ? hintMove.index * DEFAULT_BOARD_SIZE + offset
        : offset * DEFAULT_BOARD_SIZE + hintMove.index,
    ));
  }, [hintMove]);

  const previewIndices = useMemo(() => {
    if (!railPreview) return new Set();
    return new Set(Array.from({ length: DEFAULT_BOARD_SIZE }, (_, offset) =>
      railPreview.axis === 'row'
        ? railPreview.index * DEFAULT_BOARD_SIZE + offset
        : offset * DEFAULT_BOARD_SIZE + railPreview.index,
    ));
  }, [railPreview]);

  const railIsActive = (axis, index) => railPreview?.axis === axis && railPreview.index === index;

  const coachCopy = [
    ['Drag an outer rail', 'Pull sideways for a row or vertically for a column. The whole line moves together.'],
    ['Build a line of three', 'Shift complete lines until three identical symbols meet—even across an outer edge.'],
    ['Now build a chain', 'Cleared symbols fall and may trigger another match for a larger score.'],
  ][coachStep];

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
                label={`Column ${column + 1} rail: shift up`}
                disabled={busy || Boolean(gameResult)}
                onClick={() => handleDirectionClick({ axis: 'column', index: column, direction: -1 })}
                onPointerDown={(event) => handleRailPointerDown(event, 'column', column)}
                onPointerMove={handleRailPointerMove}
                onPointerUp={handleRailPointerUp}
                onPointerCancel={handleRailPointerCancel}
                active={railIsActive('column', column)}
                ready={railIsActive('column', column) && railPreview.ready}
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
                  label={`Row ${row + 1} rail: shift left`}
                  disabled={busy || Boolean(gameResult)}
                  onClick={() => handleDirectionClick({ axis: 'row', index: row, direction: -1 })}
                  onPointerDown={(event) => handleRailPointerDown(event, 'row', row)}
                  onPointerMove={handleRailPointerMove}
                  onPointerUp={handleRailPointerUp}
                  onPointerCancel={handleRailPointerCancel}
                  active={railIsActive('row', row)}
                  ready={railIsActive('row', row) && railPreview.ready}
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
                  <div
                    key={tile.id}
                    data-tile-id={tile.id}
                    className={`planar-match__tile ${matched.has(index) ? 'is-matched' : ''} ${newTileIds.has(tile.id) ? 'is-new' : ''} ${hintedIndices.has(index) ? 'is-hinted' : ''} ${previewIndices.has(index) ? 'is-gesture-line' : ''} ${previewIndices.has(index) && railPreview?.ready ? 'is-gesture-ready' : ''}`}
                    style={{
                      '--tile-color': meta.color,
                      '--gesture-x': railPreview?.axis === 'row' && previewIndices.has(index) ? `${railPreview.delta}px` : '0px',
                      '--gesture-y': railPreview?.axis === 'column' && previewIndices.has(index) ? `${railPreview.delta}px` : '0px',
                    }}
                    role="img"
                    aria-label={`${meta.label}, row ${Math.floor(index / DEFAULT_BOARD_SIZE) + 1}, column ${(index % DEFAULT_BOARD_SIZE) + 1}`}
                  >
                    <span aria-hidden="true">{meta.glyph}</span>
                  </div>
                );
              })}
            </div>

            <div className="planar-match__row-controls">
              {Array.from({ length: DEFAULT_BOARD_SIZE }, (_, row) => (
                <DirectionButton
                  key={`right-${row}`}
                  label={`Row ${row + 1} rail: shift right`}
                  disabled={busy || Boolean(gameResult)}
                  onClick={() => handleDirectionClick({ axis: 'row', index: row, direction: 1 })}
                  onPointerDown={(event) => handleRailPointerDown(event, 'row', row)}
                  onPointerMove={handleRailPointerMove}
                  onPointerUp={handleRailPointerUp}
                  onPointerCancel={handleRailPointerCancel}
                  active={railIsActive('row', row)}
                  ready={railIsActive('row', row) && railPreview.ready}
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
                label={`Column ${column + 1} rail: shift down`}
                disabled={busy || Boolean(gameResult)}
                onClick={() => handleDirectionClick({ axis: 'column', index: column, direction: 1 })}
                onPointerDown={(event) => handleRailPointerDown(event, 'column', column)}
                onPointerMove={handleRailPointerMove}
                onPointerUp={handleRailPointerUp}
                onPointerCancel={handleRailPointerCancel}
                active={railIsActive('column', column)}
                ready={railIsActive('column', column) && railPreview.ready}
              >
                <ArrowDown size={16} />
              </DirectionButton>
            ))}
            <span />
          </div>

          {!coachDismissed && (
            <div className={`planar-match__coach coach-step-${coachStep}`}>
              <span>{coachStep + 1}</span>
              <div>
                <strong>{coachCopy[0]}</strong>
                <p>{coachCopy[1]}</p>
              </div>
              <button type="button" onClick={() => setCoachDismissed(true)}>
                {coachStep === 2 ? 'Got it' : 'Skip'}
              </button>
            </div>
          )}

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
            <li><strong>Shift</strong><span>Drag an outer row or column rail, or tap its arrow. Tiles are never moved individually.</span></li>
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
