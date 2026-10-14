/** Pass 08 deterministic visual fixtures. These are NOT Jigsawverse rules. */
export const ASSEMBLE_SIZE = 5;
export const ASSEMBLE_RACK = 10;
export const PLANAR_SIZE = 6;
export const KINDS = Object.freeze(['sun', 'river', 'seed', 'ember', 'indigo', 'clay']);
export const KIND_COLORS = Object.freeze(['#efc169', '#22799a', '#2d7758', '#b95a43', '#6252a0', '#e7bc86']);
// Coordinates agree with the Pass 06 Y-up / XZ-plane contract.
export const cellPosition = (row, col, count) => ({ x: col + 0.5 - count / 2, z: row + 0.5 - count / 2 });

export function initialAssemble() {
  return {
    family: 'assemble',
    count: ASSEMBLE_SIZE,
    board: Array.from({ length: 25 }, (_, i) => i < 15 ? i : null),
    rack: Array.from({ length: ASSEMBLE_RACK }, (_, i) => i + 15),
    selected: null,
    uvProof: false,
    demoMoves: 0,
  };
}

export function initialPlanar() {
  // Deterministic illustrative tile IDs; no match/cascade logic is executed.
  return {
    family: 'planar',
    count: PLANAR_SIZE,
    board: Array.from({ length: 36 }, (_, i) => ({ id: `tile-${i}`, kind: KINDS[(i * 11 + Math.floor(i / 6) * 3 + Math.floor(i / 6) * (i % 6)) % 6] })),
    demoMoves: 0,
  };
}

export function assemblePlace(state, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 25 || state.selected == null || state.board[cell] !== null) return state;
  const board = state.board.slice();
  board[cell] = state.selected;
  return { ...state, board, rack: state.rack.filter(x => x !== state.selected), selected: null, demoMoves: state.demoMoves + 1 };
}

export function planarShift(state, axis, index, direction) {
  if (!['row', 'column'].includes(axis) || !Number.isInteger(index) || index < 0 || index > 5 || ![-1, 1].includes(direction)) return state;
  const board = state.board.slice();
  for (let j = 0; j < 6; j++) {
    const from = axis === 'row' ? index * 6 + j : j * 6 + index;
    const toLine = (j + direction + 6) % 6;
    const to = axis === 'row' ? index * 6 + toLine : toLine * 6 + index;
    board[to] = state.board[from];
  }
  return { ...state, board, demoMoves: state.demoMoves + 1 };
}

export function isAssembleReferenceComplete(s) {
  return s.board.every((tile, index) => tile === index);
}
