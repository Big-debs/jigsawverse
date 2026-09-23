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
