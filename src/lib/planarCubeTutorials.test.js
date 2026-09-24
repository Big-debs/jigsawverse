import { describe, expect, it } from 'vitest';
import {
  PLANAR_CUBE_TUTORIALS,
  buildTutorialState,
} from './planarCubeTutorials';
import { applyMoves } from './planarCubeEngine';

describe('planar cube tutorials', () => {
  it('starts every tutorial incomplete', () => {
    for (const level of PLANAR_CUBE_TUTORIALS) {
      expect(level.goal(buildTutorialState(level))).toBe(false);
    }
  });

  it('solves every tutorial with its canonical teaching path', () => {
    for (const level of PLANAR_CUBE_TUTORIALS) {
      const start = buildTutorialState(level);
      const solved = applyMoves(start, level.solution);

      expect(level.goal(solved)).toBe(true);

      if (level.protectedGoal) {
        expect(level.protectedGoal(solved)).toBe(true);
      }
    }
  });

  it('starts protected tutorial with its protected strip intact', () => {
    const level = PLANAR_CUBE_TUTORIALS.find(
      (tutorial) => tutorial.id === 'preserve-row',
    );

    expect(level.protectedGoal(buildTutorialState(level))).toBe(true);
  });
});
