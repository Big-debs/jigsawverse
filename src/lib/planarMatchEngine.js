export const DEFAULT_BOARD_SIZE = 6;

export const TILE_KINDS = [
  { id: 'sun', label: 'Sun', glyph: '◉', color: '#f7b955' },
  { id: 'river', label: 'River', glyph: '≈', color: '#55c7e8' },
  { id: 'seed', label: 'Seed', glyph: '◆', color: '#76d39b' },
  { id: 'ember', label: 'Ember', glyph: '✦', color: '#f47767' },
  { id: 'indigo', label: 'Indigo', glyph: '▣', color: '#9d8cff' },
  { id: 'clay', label: 'Clay', glyph: '●', color: '#d9976b' },
];

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

export function createTile(kind, id) {
  return { id, kind };
}

function randomTile(random, nextId) {
  const kind = TILE_KINDS[Math.floor(random() * TILE_KINDS.length)].id;
  return createTile(kind, nextId());
}

function lineRuns(line) {
  if (!line.length) return [];

  const firstBreak = line.findIndex(
    (tile, index) => tile.kind !== line[(index - 1 + line.length) % line.length].kind,
  );

  if (firstBreak === -1) return [line.map((_, index) => index)];

  const runs = [];
  let current = [];
  let currentKind = null;

  for (let offset = 0; offset < line.length; offset += 1) {
    const index = (firstBreak + offset) % line.length;
    const kind = line[index].kind;

    if (kind !== currentKind) {
      if (current.length) runs.push(current);
      current = [index];
      currentKind = kind;
    } else {
      current.push(index);
    }
  }

  if (current.length) runs.push(current);
  return runs;
}

export function findMatches(board, size = DEFAULT_BOARD_SIZE) {
  const matched = new Set();
  const groups = [];

  for (let row = 0; row < size; row += 1) {
    const line = board.slice(row * size, row * size + size);
    lineRuns(line).forEach((run) => {
      if (run.length < 3) return;
      const indices = run.map((column) => row * size + column);
      indices.forEach((index) => matched.add(index));
      groups.push({ axis: 'row', line: row, indices });
    });
  }

  for (let column = 0; column < size; column += 1) {
    const line = Array.from({ length: size }, (_, row) => board[row * size + column]);
    lineRuns(line).forEach((run) => {
      if (run.length < 3) return;
      const indices = run.map((row) => row * size + column);
      indices.forEach((index) => matched.add(index));
      groups.push({ axis: 'column', line: column, indices });
    });
  }

  return { indices: [...matched], groups };
}

export function shiftLine(board, move, size = DEFAULT_BOARD_SIZE) {
  const next = [...board];
  const amount = move.direction === -1 ? -1 : 1;

  if (move.axis === 'row') {
    for (let column = 0; column < size; column += 1) {
      const sourceColumn = (column - amount + size) % size;
      next[move.index * size + column] = board[move.index * size + sourceColumn];
    }
    return next;
  }

  if (move.axis === 'column') {
    for (let row = 0; row < size; row += 1) {
      const sourceRow = (row - amount + size) % size;
      next[row * size + move.index] = board[sourceRow * size + move.index];
    }
    return next;
  }

  throw new Error(`Unknown move axis: ${move.axis}`);
}

export function collapseAndRefill(
  board,
  matchedIndices,
  { size = DEFAULT_BOARD_SIZE, random = Math.random, nextId = () => crypto.randomUUID() } = {},
) {
  const matched = new Set(matchedIndices);
  const next = [...board];
  const createdIds = [];

  for (let column = 0; column < size; column += 1) {
    const survivors = [];
    for (let row = size - 1; row >= 0; row -= 1) {
      const index = row * size + column;
      if (!matched.has(index)) survivors.push(board[index]);
    }

    let survivorIndex = 0;
    for (let row = size - 1; row >= 0; row -= 1) {
      const index = row * size + column;
      if (survivorIndex < survivors.length) {
        next[index] = survivors[survivorIndex];
        survivorIndex += 1;
      } else {
        const tile = randomTile(random, nextId);
        next[index] = tile;
        createdIds.push(tile.id);
      }
    }
  }

  return { board: next, createdIds };
}

export function scoringMoves(board, size = DEFAULT_BOARD_SIZE) {
  const moves = [];
  ['row', 'column'].forEach((axis) => {
    for (let index = 0; index < size; index += 1) {
      [-1, 1].forEach((direction) => {
        const move = { axis, index, direction };
        if (findMatches(shiftLine(board, move, size), size).indices.length) {
          moves.push(move);
        }
      });
    }
  });
  return moves;
}

export function createInitialBoard({
  size = DEFAULT_BOARD_SIZE,
  seed = Date.now(),
} = {}) {
  const random = mulberry32(seed);
  let serial = 0;
  const nextId = () => `tile-${seed}-${serial++}`;

  for (let attempt = 0; attempt < 500; attempt += 1) {
    const board = Array.from({ length: size * size }, () => randomTile(random, nextId));
    if (!findMatches(board, size).indices.length && scoringMoves(board, size).length) {
      return { board, random, nextId, seed };
    }
  }

  throw new Error('Unable to create a playable planar match board.');
}

export function cascadeScore(clearedCount, cascade) {
  return clearedCount * 100 * cascade;
}

export function moveLabel(move) {
  const number = move.index + 1;
  if (move.axis === 'row') {
    return `Row ${number} ${move.direction > 0 ? 'right' : 'left'}`;
  }
  return `Column ${number} ${move.direction > 0 ? 'down' : 'up'}`;
}
