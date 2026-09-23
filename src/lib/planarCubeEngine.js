export const FACE_ORDER = ['U', 'L', 'F', 'R', 'B', 'D'];

export const FACE_META = {
  U: { label: 'TOP', color: '#eab308' },
  L: { label: 'LEFT', color: '#16a34a' },
  F: { label: 'FRONT', color: '#dc2626' },
  R: { label: 'RIGHT', color: '#2563eb' },
  B: { label: 'BACK', color: '#9333ea' },
  D: { label: 'BOTTOM', color: '#ea580c' },
};

const FACE_NORMALS = {
  U: [0, 1, 0],
  D: [0, -1, 0],
  F: [0, 0, 1],
  B: [0, 0, -1],
  R: [1, 0, 0],
  L: [-1, 0, 0],
};

function stickerPosition(face, row, col) {
  switch (face) {
    case 'F':
      return [col - 1, 1 - row, 1];
    case 'B':
      return [1 - col, 1 - row, -1];
    case 'R':
      return [1, 1 - row, 1 - col];
    case 'L':
      return [-1, 1 - row, col - 1];
    case 'U':
      return [col - 1, 1, row - 1];
    case 'D':
      return [col - 1, -1, 1 - row];
    default:
      throw new Error(`Unknown face: ${face}`);
  }
}

function cloneSticker(sticker) {
  return {
    ...sticker,
    position: [...sticker.position],
    normal: [...sticker.normal],
  };
}

function sameVector(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

function rotateVector(vector, axis, quarter) {
  const [x, y, z] = vector;

  if (axis === 'x') {
    return quarter === 1 ? [x, -z, y] : [x, z, -y];
  }

  if (axis === 'y') {
    return quarter === 1 ? [z, y, -x] : [-z, y, x];
  }

  if (axis === 'z') {
    return quarter === 1 ? [-y, x, z] : [y, -x, z];
  }

  throw new Error(`Unknown axis: ${axis}`);
}

function moveToRotation(move) {
  const { family, index, direction } = move;

  if (!Number.isInteger(index) || index < 0 || index > 2) {
    throw new Error(`Move index must be 0, 1, or 2. Received: ${index}`);
  }

  if (family === 'H') {
    if (!['left', 'right'].includes(direction)) {
      throw new Error(`Invalid horizontal direction: ${direction}`);
    }
    return {
      axis: 'y',
      layer: 1 - index,
      quarter: direction === 'right' ? 1 : -1,
    };
  }

  if (family === 'V') {
    if (!['up', 'down'].includes(direction)) {
      throw new Error(`Invalid vertical direction: ${direction}`);
    }
    return {
      axis: 'x',
      layer: index - 1,
      quarter: direction === 'up' ? -1 : 1,
    };
  }

  if (family === 'Z') {
    if (!['cw', 'ccw'].includes(direction)) {
      throw new Error(`Invalid depth direction: ${direction}`);
    }
    return {
      axis: 'z',
      layer: 1 - index,
      quarter: direction === 'cw' ? -1 : 1,
    };
  }

  throw new Error(`Unknown move family: ${family}`);
}

function coordinateForAxis(position, axis) {
  if (axis === 'x') return position[0];
  if (axis === 'y') return position[1];
  return position[2];
}

function faceCellFromSticker(sticker, face) {
  const [x, y, z] = sticker.position;

  switch (face) {
    case 'F':
      return [1 - y, x + 1];
    case 'B':
      return [1 - y, 1 - x];
    case 'R':
      return [1 - y, 1 - z];
    case 'L':
      return [1 - y, z + 1];
    case 'U':
      return [z + 1, x + 1];
    case 'D':
      return [1 - z, x + 1];
    default:
      throw new Error(`Unknown face: ${face}`);
  }
}

export function createSolvedState() {
  const stickers = [];

  FACE_ORDER.forEach((face) => {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        stickers.push({
          id: `${face}-${row}-${col}`,
          homeFace: face,
          homeRow: row,
          homeCol: col,
          position: stickerPosition(face, row, col),
          normal: [...FACE_NORMALS[face]],
        });
      }
    }
  });

  return stickers;
}

export function applyMove(state, move) {
  const { axis, layer, quarter } = moveToRotation(move);

  return state.map((sticker) => {
    if (coordinateForAxis(sticker.position, axis) !== layer) {
      return cloneSticker(sticker);
    }

    return {
      ...sticker,
      position: rotateVector(sticker.position, axis, quarter),
      normal: rotateVector(sticker.normal, axis, quarter),
    };
  });
}

export function applyMoves(state, moves) {
  return moves.reduce((current, move) => applyMove(current, move), state);
}

export function invertMove(move) {
  const inverseDirection = {
    left: 'right',
    right: 'left',
    up: 'down',
    down: 'up',
    cw: 'ccw',
    ccw: 'cw',
  };

  return {
    ...move,
    direction: inverseDirection[move.direction],
  };
}

export function getFaceGrid(state, face) {
  const grid = Array.from({ length: 3 }, () => Array(3).fill(null));
  const normal = FACE_NORMALS[face];

  state.forEach((sticker) => {
    if (!sameVector(sticker.normal, normal)) return;
    const [row, col] = faceCellFromSticker(sticker, face);
    grid[row][col] = sticker;
  });

  return grid;
}

export function isSolved(state) {
  return state.every((sticker) => {
    const face = FACE_ORDER.find((candidate) =>
      sameVector(sticker.normal, FACE_NORMALS[candidate]),
    );
    return face === sticker.homeFace;
  });
}

export function stateSignature(state) {
  return state
    .map(
      (sticker) =>
        `${sticker.id}:${sticker.position.join(',')}:${sticker.normal.join(',')}`,
    )
    .sort()
    .join('|');
}

export function validateState(state) {
  const ids = new Set(state.map((sticker) => sticker.id));
  const validCoordinates = state.every((sticker) =>
    [...sticker.position, ...sticker.normal].every((value) =>
      [-1, 0, 1].includes(value),
    ),
  );

  const surfaceNormals = state.every(
    (sticker) =>
      Math.abs(sticker.normal[0]) +
        Math.abs(sticker.normal[1]) +
        Math.abs(sticker.normal[2]) ===
      1,
  );

  const completeFaces = FACE_ORDER.every(
    (face) => getFaceGrid(state, face).flat().filter(Boolean).length === 9,
  );

  return {
    valid:
      state.length === 54 &&
      ids.size === 54 &&
      validCoordinates &&
      surfaceNormals &&
      completeFaces,
    stickerCount: state.length,
    uniqueStickerCount: ids.size,
    completeFaces,
  };
}

export const ALL_MOVES = [
  ...[0, 1, 2].flatMap((index) => [
    { family: 'H', index, direction: 'left' },
    { family: 'H', index, direction: 'right' },
  ]),
  ...[0, 1, 2].flatMap((index) => [
    { family: 'V', index, direction: 'up' },
    { family: 'V', index, direction: 'down' },
  ]),
  ...[0, 1, 2].flatMap((index) => [
    { family: 'Z', index, direction: 'cw' },
    { family: 'Z', index, direction: 'ccw' },
  ]),
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createScramble(length = 12, seed = Date.now()) {
  const safeSeed = Number(seed) >>> 0;
  const random = mulberry32(safeSeed);
  const moves = [];
  let previous = null;

  while (moves.length < length) {
    const move = ALL_MOVES[Math.floor(random() * ALL_MOVES.length)];

    if (
      previous &&
      previous.family === move.family &&
      previous.index === move.index
    ) {
      continue;
    }

    moves.push({ ...move });
    previous = move;
  }

  return { seed: safeSeed, moves };
}

export function formatMove(move) {
  const arrows = {
    left: '←',
    right: '→',
    up: '↑',
    down: '↓',
    cw: '↻',
    ccw: '↺',
  };

  return `${move.family}${move.index}${arrows[move.direction]}`;
}
