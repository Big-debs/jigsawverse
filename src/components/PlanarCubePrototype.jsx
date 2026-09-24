import { useEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Shuffle, Undo2 } from 'lucide-react';
import {
  FACE_META,
  applyMove,
  applyMoves,
  createScramble,
  createSolvedState,
  formatMove,
  getFaceGrid,
  invertMove,
  isSolved,
  validateState,
} from '../lib/planarCubeEngine';
import {
  PLANAR_CUBE_TUTORIALS,
  buildTutorialState,
  canonicalHint,
  isProtectedCell,
  isTargetCell,
} from '../lib/planarCubeTutorials';
import './PlanarCubePrototype.css';

const FACE_LAYOUT = {
  U: 'cube-face--u',
  L: 'cube-face--l',
  F: 'cube-face--f',
  R: 'cube-face--r',
  B: 'cube-face--b',
  D: 'cube-face--d',
};

function moveFromSwipe(face, row, col, dx, dy) {
  const horizontal = Math.abs(dx) > Math.abs(dy);
  const threshold = 22;

  if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) {
    return null;
  }

  if (face === 'F') {
    if (horizontal) {
      return {
        family: 'H',
        index: row,
        direction: dx > 0 ? 'right' : 'left',
      };
    }

    return {
      family: 'V',
      index: col,
      direction: dy < 0 ? 'up' : 'down',
    };
  }

  if (face === 'U' && horizontal) {
    return {
      family: 'Z',
      index: 2 - row,
      direction: dx > 0 ? 'cw' : 'ccw',
    };
  }

  return null;
}

function FaceGrid({ face, state, onMove, tutorial }) {
  const pointerStart = useRef(null);
  const grid = useMemo(() => getFaceGrid(state, face), [state, face]);
  const meta = FACE_META[face];
  const interactive = face === 'F' || face === 'U';

  const handlePointerDown = (event, row, col) => {
    if (!interactive) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerStart.current = {
      x: event.clientX,
      y: event.clientY,
      row,
      col,
      pointerId: event.pointerId,
    };
  };

  const handlePointerUp = (event) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!start) return;

    const move = moveFromSwipe(
      face,
      start.row,
      start.col,
      event.clientX - start.x,
      event.clientY - start.y,
    );

    if (move) onMove(move);
  };

  return (
    <section
      className={`cube-face ${FACE_LAYOUT[face]} ${interactive ? 'cube-face--interactive' : ''}`}
      aria-label={`${meta.label} face`}
    >
      <div className="cube-face__header">
        <span>{meta.label}</span>
        <strong>{face}</strong>
      </div>

      <div className="cube-face__grid">
        {grid.flatMap((line, row) =>
          line.map((sticker, col) => (
            <button
              type="button"
              className={`cube-sticker ${isTargetCell(tutorial, face, row, col) ? 'cube-sticker--target' : ''} ${isProtectedCell(tutorial, face, row, col) ? 'cube-sticker--protected' : ''}`}
              key={sticker?.id ?? `${face}-${row}-${col}`}
              onPointerDown={(event) => handlePointerDown(event, row, col)}
              onPointerUp={handlePointerUp}
              style={{ '--sticker-color': FACE_META[sticker?.homeFace ?? face].color }}
              aria-label={
                sticker
                  ? `${sticker.homeFace} tile, row ${row + 1}, column ${col + 1}`
                  : 'Empty tile'
              }
            >
              <span className="cube-sticker__face">{sticker?.homeFace}</span>
              <span className="cube-sticker__index">
                {sticker ? `${sticker.homeRow + 1}${sticker.homeCol + 1}` : ''}
              </span>
            </button>
          )),
        )}
      </div>

      {interactive && (
        <p className="cube-face__hint">
          {face === 'F'
            ? 'Swipe rows ↔ or columns ↕'
            : 'Swipe rows ↔ for depth turns'}
        </p>
      )}
    </section>
  );
}

function MoveControls({ onMove }) {
  const rows = [0, 1, 2];

  return (
    <div className="cube-move-controls">
      <div className="cube-move-group">
        <div>
          <strong>H</strong>
          <span>horizontal</span>
        </div>
        {rows.map((index) => (
          <div className="cube-move-pair" key={`h-${index}`}>
            <button onClick={() => onMove({ family: 'H', index, direction: 'left' })}>
              H{index} ←
            </button>
            <button onClick={() => onMove({ family: 'H', index, direction: 'right' })}>
              H{index} →
            </button>
          </div>
        ))}
      </div>

      <div className="cube-move-group">
        <div>
          <strong>V</strong>
          <span>vertical</span>
        </div>
        {rows.map((index) => (
          <div className="cube-move-pair" key={`v-${index}`}>
            <button onClick={() => onMove({ family: 'V', index, direction: 'up' })}>
              V{index} ↑
            </button>
            <button onClick={() => onMove({ family: 'V', index, direction: 'down' })}>
              V{index} ↓
            </button>
          </div>
        ))}
      </div>

      <div className="cube-move-group">
        <div>
          <strong>Z</strong>
          <span>depth</span>
        </div>
        {rows.map((index) => (
          <div className="cube-move-pair" key={`z-${index}`}>
            <button onClick={() => onMove({ family: 'Z', index, direction: 'ccw' })}>
              Z{index} ↺
            </button>
            <button onClick={() => onMove({ family: 'Z', index, direction: 'cw' })}>
              Z{index} ↻
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PlanarCubePrototype() {
  const solved = useMemo(() => createSolvedState(), []);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const tutorial = PLANAR_CUBE_TUTORIALS[tutorialIndex];
  const initialTutorialState = useMemo(() => buildTutorialState(tutorial), [tutorial]);
  const [state, setState] = useState(initialTutorialState);
  const [startState, setStartState] = useState(initialTutorialState);
  const [history, setHistory] = useState([]);
  const [seed, setSeed] = useState(null);
  const [status, setStatus] = useState(tutorial.objective);
  const [showHint, setShowHint] = useState(false);

  const validation = useMemo(() => validateState(state), [state]);
  const solvedNow = useMemo(() => isSolved(state), [state]);
  const tutorialSolved = useMemo(() => tutorial.goal(state), [state, tutorial]);
  const protectedOkay = tutorial.protectedGoal ? tutorial.protectedGoal(state) : true;

  const runMove = (move) => {
    setState((current) => applyMove(current, move));
    setHistory((current) => [...current, move]);
  };

  const undo = () => {
    const lastMove = history[history.length - 1];
    if (!lastMove) return;

    setState((current) => applyMove(current, invertMove(lastMove)));
    setHistory((current) => current.slice(0, -1));
  };

  const restart = () => {
    setState(startState);
    setHistory([]);
    setShowHint(false);
    setStatus(seed ? `Restarted scramble #${seed}.` : tutorial.objective);
  };

  const loadTutorial = (index) => {
    const next = PLANAR_CUBE_TUTORIALS[index];
    const nextState = buildTutorialState(next);
    setTutorialIndex(index);
    setState(nextState);
    setStartState(nextState);
    setHistory([]);
    setSeed(null);
    setShowHint(false);
    setStatus(next.objective);
  };

  const scramble = () => {
    const nextSeed = Date.now() >>> 0;
    const generated = createScramble(14, nextSeed);
    const scrambled = applyMoves(createSolvedState(), generated.moves);

    setState(scrambled);
    setStartState(scrambled);
    setHistory([]);
    setSeed(generated.seed);
    setStatus('Scrambled. Restore each colour family to its home face.');
  };

  useEffect(() => {
    if (!protectedOkay) {
      setStatus('Protected strip disturbed — restore it or restart.');
      return;
    }

    if (history.length > 0 && tutorialSolved) {
      setStatus(`Tutorial complete in ${history.length} move${history.length === 1 ? '' : 's'}.`);
    } else if (history.length > 0) {
      setStatus(`Last move: ${formatMove(history[history.length - 1])}`);
    }
  }, [history, tutorialSolved, protectedOkay]);

  return (
    <main className="planar-cube">
      <header className="planar-cube__hero">
        <div>
          <p className="planar-cube__eyebrow">JIGSAWVERSE LAB / PROTOTYPE 0.1</p>
          <h1>Planar Cube</h1>
          <p>
            Six connected 3×3 faces. Swipe the board, not individual tiles.
            This prototype is intentionally stripped back so we can validate the topology.
          </p>
        </div>

        <div className="planar-cube__stats">
          <div>
            <span>Moves</span>
            <strong>{history.length}</strong>
          </div>
          <div>
            <span>State</span>
            <strong>{tutorialSolved ? 'LEVEL ✓' : solvedNow ? 'SOLVED' : 'ACTIVE'}</strong>
          </div>
          <div>
            <span>Engine</span>
            <strong>{validation.valid ? 'VALID' : 'ERROR'}</strong>
          </div>
        </div>
      </header>

      <section className="planar-cube__tutorial">
        <div className="planar-cube__tutorial-head">
          <div>
            <p className="planar-cube__eyebrow">GUIDED LEARNING</p>
            <h2>Level {tutorial.number}: {tutorial.title}</h2>
            <p>{tutorial.lesson}</p>
          </div>
          <div className="planar-cube__tutorial-nav">
            {PLANAR_CUBE_TUTORIALS.map((level, index) => (
              <button
                type="button"
                key={level.id}
                className={index === tutorialIndex ? 'is-active' : ''}
                onClick={() => loadTutorial(index)}
                aria-label={`Open tutorial level ${level.number}`}
              >
                {level.number}
              </button>
            ))}
          </div>
        </div>
        <div className="planar-cube__objective">
          <span>{tutorial.kicker}</span>
          <strong>{tutorial.objective}</strong>
          <button type="button" onClick={() => setShowHint((value) => !value)}>
            {showHint ? 'Hide hint' : 'Show hint'}
          </button>
        </div>
        {showHint && (
          <div className="planar-cube__hint-card">{canonicalHint(tutorial, history)}</div>
        )}
        {tutorialSolved && (
          <div className="planar-cube__success">
            <strong>Level complete.</strong>
            {tutorialIndex < PLANAR_CUBE_TUTORIALS.length - 1 ? (
              <button type="button" onClick={() => loadTutorial(tutorialIndex + 1)}>
                Next level →
              </button>
            ) : (
              <span>You have completed the five-step foundation.</span>
            )}
          </div>
        )}
      </section>

      <section className="planar-cube__toolbar">
        <div className="planar-cube__actions">
          <button type="button" onClick={scramble}>
            <Shuffle size={17} />
            Scramble
          </button>
          <button type="button" onClick={undo} disabled={!history.length}>
            <Undo2 size={17} />
            Undo
          </button>
          <button type="button" onClick={restart}>
            <RotateCcw size={17} />
            Restart
          </button>
        </div>

        <div className="planar-cube__status" aria-live="polite">
          <span>{status}</span>
          {seed !== null && <small>seed {seed}</small>}
        </div>
      </section>

      <section className="planar-cube__workspace">
        <div className="planar-cube__net" aria-label="Unfolded six-face cube">
          {['U', 'L', 'F', 'R', 'B', 'D'].map((face) => (
            <FaceGrid key={face} face={face} state={state} onMove={runMove} tutorial={tutorial} />
          ))}
        </div>

        <aside className="planar-cube__guide">
          <p className="planar-cube__eyebrow">MOVEMENT GRAMMAR</p>
          <h2>Three axes, eighteen moves.</h2>
          <div className="planar-cube__guide-item">
            <strong>Front face ↔</strong>
            <span>moves an H row around Left → Front → Right → Back.</span>
          </div>
          <div className="planar-cube__guide-item">
            <strong>Front face ↕</strong>
            <span>moves a V column through Bottom → Front → Top → Back.</span>
          </div>
          <div className="planar-cube__guide-item">
            <strong>Top face ↔</strong>
            <span>turns a Z depth slice. The row determines the depth layer.</span>
          </div>
          <div className="planar-cube__guide-item">
            <strong>Grey-box rule</strong>
            <span>Colours identify home faces; tile numbers make orientation errors visible.</span>
          </div>
        </aside>
      </section>

      <section className="planar-cube__controls-section">
        <div className="planar-cube__controls-heading">
          <div>
            <p className="planar-cube__eyebrow">DEBUG CONTROLS</p>
            <h2>All 18 canonical moves</h2>
          </div>
          <p>
            These buttons remain during engine QA. The finished game can hide them and rely on direct gestures.
          </p>
        </div>
        <MoveControls onMove={runMove} />
      </section>
    </main>
  );
}
