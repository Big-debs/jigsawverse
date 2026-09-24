import {
  applyMoves,
  createSolvedState,
  getFaceGrid,
  invertMove,
} from './planarCubeEngine';

function faceSolved(state, face) {
  return getFaceGrid(state, face)
    .flat()
    .every((sticker) => sticker?.homeFace === face);
}

function rowSolved(state, face, row) {
  return getFaceGrid(state, face)[row].every(
    (sticker) => sticker?.homeFace === face,
  );
}

function columnSolved(state, face, col) {
  return getFaceGrid(state, face).every(
    (row) => row[col]?.homeFace === face,
  );
}

function reverseSolution(scramble) {
  return [...scramble].reverse().map(invertMove);
}

const LEVELS = [
  {
    id: 'row-return',
    number: 1,
    title: 'Return a Row',
    kicker: 'HORIZONTAL BELT',
    objective: 'Restore the red middle row on FRONT.',
    lesson:
      'A horizontal swipe moves the entire strip around LEFT → FRONT → RIGHT → BACK.',
    target: { type: 'row', face: 'F', index: 1 },
    scramble: [{ family: 'H', index: 1, direction: 'right' }],
    goal: (state) => rowSolved(state, 'F', 1),
    tip: 'Swipe the middle FRONT row to the left.',
  },
  {
    id: 'column-return',
    number: 2,
    title: 'Return a Column',
    kicker: 'VERTICAL BELT',
    objective: 'Restore the red centre column on FRONT.',
    lesson:
      'Vertical movement passes through BOTTOM → FRONT → TOP → BACK, with the Back face visually reversed.',
    target: { type: 'column', face: 'F', index: 1 },
    scramble: [{ family: 'V', index: 1, direction: 'down' }],
    goal: (state) => columnSolved(state, 'F', 1),
    tip: 'Swipe the centre FRONT column upward.',
  },
  {
    id: 'front-face',
    number: 3,
    title: 'Restore a Face',
    kicker: 'COMBINE AXES',
    objective: 'Return all nine red tiles to FRONT.',
    lesson:
      'Now horizontal and vertical moves interact. Solve the most recent disturbance first, then work backward.',
    target: { type: 'face', face: 'F' },
    scramble: [
      { family: 'H', index: 0, direction: 'right' },
      { family: 'V', index: 1, direction: 'down' },
      { family: 'H', index: 2, direction: 'left' },
    ],
    goal: (state) => faceSolved(state, 'F'),
    tip: 'Think in reverse order: bottom row, centre column, top row.',
  },
  {
    id: 'preserve-row',
    number: 4,
    title: 'Preserve What Works',
    kicker: 'PROTECTED STRIP',
    objective: 'Restore FRONT without breaking its protected top row.',
    lesson:
      'Cube solving is not just placing pieces; it is moving unsolved pieces while preserving solved structure.',
    target: { type: 'face', face: 'F' },
    protected: { type: 'row', face: 'F', index: 0 },
    scramble: [
      { family: 'H', index: 1, direction: 'right' },
      { family: 'H', index: 2, direction: 'left' },
    ],
    goal: (state) => faceSolved(state, 'F'),
    protectedGoal: (state) => rowSolved(state, 'F', 0),
    tip: 'The top red row already works. Keep your moves away from H0 unless you can restore it.',
  },
  {
    id: 'adjacent-faces',
    number: 5,
    title: 'Two Faces Together',
    kicker: 'SPATIAL THINKING',
    objective: 'Restore both FRONT (red) and RIGHT (blue).',
    lesson:
      'A move that repairs one face can damage another. Start thinking in reversible sequences rather than isolated moves.',
    target: { type: 'faces', faces: ['F', 'R'] },
    scramble: [
      { family: 'H', index: 1, direction: 'right' },
      { family: 'V', index: 2, direction: 'down' },
      { family: 'Z', index: 0, direction: 'cw' },
      { family: 'H', index: 2, direction: 'left' },
    ],
    goal: (state) => faceSolved(state, 'F') && faceSolved(state, 'R'),
    tip: 'Depth turns are now part of the puzzle. If lost, restart and undo the scramble in reverse.',
  },
];

export const PLANAR_CUBE_TUTORIALS = LEVELS.map((level) => ({
  ...level,
  solution: reverseSolution(level.scramble),
}));

export function buildTutorialState(level) {
  return applyMoves(createSolvedState(), level.scramble);
}

export function isTargetCell(level, face, row, col) {
  const target = level?.target;
  if (!target) return false;

  if (target.type === 'face') return face === target.face;
  if (target.type === 'faces') return target.faces.includes(face);
  if (target.type === 'row') {
    return face === target.face && row === target.index;
  }
  if (target.type === 'column') {
    return face === target.face && col === target.index;
  }

  return false;
}

export function isProtectedCell(level, face, row, col) {
  const target = level?.protected;
  if (!target) return false;

  if (target.type === 'row') {
    return face === target.face && row === target.index;
  }

  if (target.type === 'column') {
    return face === target.face && col === target.index;
  }

  return false;
}

export function canonicalHint(level, history) {
  const expected = level?.solution ?? [];

  const stillOnPath = history.every((move, index) => {
    const canonical = expected[index];
    return (
      canonical &&
      canonical.family === move.family &&
      canonical.index === move.index &&
      canonical.direction === move.direction
    );
  });

  if (!stillOnPath) {
    return 'You have left the shortest teaching path. Undo your last moves or restart the level.';
  }

  const next = expected[history.length];
  if (!next) return level.tip;

  const directionNames = {
    left: 'left',
    right: 'right',
    up: 'up',
    down: 'down',
    cw: 'clockwise',
    ccw: 'counter-clockwise',
  };

  return `Teaching path: ${next.family}${next.index} ${directionNames[next.direction]}.`;
}
