import { describe, expect, it } from 'vitest';
import {
  ALL_MOVES,
  applyMove,
  applyMoves,
  createScramble,
  createSolvedState,
  getFaceGrid,
  invertMove,
  isSolved,
  stateSignature,
  validateState,
} from './planarCubeEngine';

describe('planar cube engine', () => {
  it('creates a valid solved 54-sticker cube', () => {
    const state = createSolvedState();
    const validation = validateState(state);

    expect(validation.valid).toBe(true);
    expect(validation.stickerCount).toBe(54);
    expect(validation.uniqueStickerCount).toBe(54);
    expect(isSolved(state)).toBe(true);

    for (const face of ['U', 'L', 'F', 'R', 'B', 'D']) {
      expect(getFaceGrid(state, face).flat().filter(Boolean)).toHaveLength(9);
    }
  });

  it('every canonical move has an exact inverse', () => {
    const solved = createSolvedState();
    const signature = stateSignature(solved);

    for (const move of ALL_MOVES) {
      const moved = applyMove(solved, move);
      const restored = applyMove(moved, invertMove(move));
      expect(stateSignature(restored)).toBe(signature);
    }
  });

  it('four quarter turns restore the original state', () => {
    const solved = createSolvedState();
    const signature = stateSignature(solved);

    for (const move of ALL_MOVES) {
      let state = solved;
      for (let turn = 0; turn < 4; turn += 1) {
        state = applyMove(state, move);
      }
      expect(stateSignature(state)).toBe(signature);
    }
  });

  it('maps the horizontal middle row through L → F → R → B without reversal', () => {
    const moved = applyMove(createSolvedState(), {
      family: 'H',
      index: 1,
      direction: 'right',
    });

    expect(getFaceGrid(moved, 'F')[1].map((sticker) => sticker.id)).toEqual([
      'L-1-0',
      'L-1-1',
      'L-1-2',
    ]);
    expect(getFaceGrid(moved, 'R')[1].map((sticker) => sticker.id)).toEqual([
      'F-1-0',
      'F-1-1',
      'F-1-2',
    ]);
    expect(getFaceGrid(moved, 'B')[1].map((sticker) => sticker.id)).toEqual([
      'R-1-0',
      'R-1-1',
      'R-1-2',
    ]);
    expect(getFaceGrid(moved, 'L')[1].map((sticker) => sticker.id)).toEqual([
      'B-1-0',
      'B-1-1',
      'B-1-2',
    ]);
  });

  it('reverses orientation correctly when a vertical strip crosses the back face', () => {
    const moved = applyMove(createSolvedState(), {
      family: 'V',
      index: 1,
      direction: 'up',
    });

    expect(getFaceGrid(moved, 'U').map((row) => row[1].id)).toEqual([
      'F-0-1',
      'F-1-1',
      'F-2-1',
    ]);
    expect(getFaceGrid(moved, 'B').map((row) => row[1].id)).toEqual([
      'U-2-1',
      'U-1-1',
      'U-0-1',
    ]);
    expect(getFaceGrid(moved, 'D').map((row) => row[1].id)).toEqual([
      'B-2-1',
      'B-1-1',
      'B-0-1',
    ]);
  });

  it('rotates the front face clockwise for a clockwise front depth turn', () => {
    const moved = applyMove(createSolvedState(), {
      family: 'Z',
      index: 0,
      direction: 'cw',
    });

    expect(getFaceGrid(moved, 'F').map((row) => row.map((sticker) => sticker.id))).toEqual([
      ['F-2-0', 'F-1-0', 'F-0-0'],
      ['F-2-1', 'F-1-1', 'F-0-1'],
      ['F-2-2', 'F-1-2', 'F-0-2'],
    ]);
  });

  it('rotates outer faces with the intended orientation', () => {
    const top = applyMove(createSolvedState(), {
      family: 'H',
      index: 0,
      direction: 'right',
    });
    expect(getFaceGrid(top, 'U')[0].map((sticker) => sticker.id)).toEqual([
      'U-0-2',
      'U-1-2',
      'U-2-2',
    ]);

    const right = applyMove(createSolvedState(), {
      family: 'V',
      index: 2,
      direction: 'up',
    });
    expect(getFaceGrid(right, 'R')[0].map((sticker) => sticker.id)).toEqual([
      'R-2-0',
      'R-1-0',
      'R-0-0',
    ]);

    const back = applyMove(createSolvedState(), {
      family: 'Z',
      index: 2,
      direction: 'cw',
    });
    expect(getFaceGrid(back, 'B')[0].map((sticker) => sticker.id)).toEqual([
      'B-0-2',
      'B-1-2',
      'B-2-2',
    ]);
  });

  it('reversing a legal scramble always solves the cube', () => {
    const solved = createSolvedState();
    const { moves } = createScramble(30, 20260923);
    const scrambled = applyMoves(solved, moves);

    expect(validateState(scrambled).valid).toBe(true);
    expect(isSolved(scrambled)).toBe(false);

    const reverse = [...moves].reverse().map(invertMove);
    const restored = applyMoves(scrambled, reverse);

    expect(isSolved(restored)).toBe(true);
    expect(stateSignature(restored)).toBe(stateSignature(solved));
  });
});
