import { describe, expect, it } from 'vitest';
import { evaluateRailGesture } from './planarMatchInteraction';

describe('planar match rail gestures', () => {
  it('locks row gestures to horizontal movement', () => {
    const gesture = evaluateRailGesture({
      axis: 'row',
      startX: 10,
      startY: 10,
      currentX: 48,
      currentY: 16,
      threshold: 30,
    });

    expect(gesture).toMatchObject({ aligned: true, moved: true, ready: true, direction: 1 });
  });

  it('locks column gestures to vertical movement', () => {
    const gesture = evaluateRailGesture({
      axis: 'column',
      startX: 40,
      startY: 50,
      currentX: 34,
      currentY: 12,
      threshold: 30,
    });

    expect(gesture).toMatchObject({ aligned: true, moved: true, ready: true, direction: -1 });
  });

  it('keeps short drags inside the cancel zone', () => {
    const gesture = evaluateRailGesture({
      axis: 'row',
      startX: 0,
      startY: 0,
      currentX: 16,
      currentY: 2,
      threshold: 30,
    });

    expect(gesture.ready).toBe(false);
    expect(gesture.progress).toBeCloseTo(16 / 30);
  });

  it('rejects movement across the selected rail', () => {
    const gesture = evaluateRailGesture({
      axis: 'column',
      startX: 0,
      startY: 0,
      currentX: 42,
      currentY: 20,
      threshold: 18,
    });

    expect(gesture).toMatchObject({ aligned: false, moved: true, ready: false });
  });
});
