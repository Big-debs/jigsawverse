/**
 * Pass 12 presentation-event contract.
 *
 * Derived exclusively from accepted local demo fixture state transitions.
 * This module does NOT validate real moves, calculate scores, or reveal answers.
 * Ranked gameplay must supply its own authoritative, viewer-safe projection.
 */
export const MOTION_TYPES = Object.freeze({
  SELECT: 'assemble.select',
  PLACE: 'assemble.place',
  SHIFT: 'planar.shift',
  CLEAR: 'planar.clear.preview',
  DROP: 'planar.drop.preview',
  REFILL: 'planar.refill.preview',
});
export const CUE_DURATIONS_MS = Object.freeze({
  [MOTION_TYPES.SELECT]: 120,
  [MOTION_TYPES.PLACE]: 240,
  [MOTION_TYPES.SHIFT]: 300,
  [MOTION_TYPES.CLEAR]: 260,
  [MOTION_TYPES.DROP]: 300,
  [MOTION_TYPES.REFILL]: 250,
});

/** Return only public visual facts. Never include correctness, hidden scores or target mappings. */
export function cueForTransition(previous, next, action) {
  if (!previous || !next || !action || previous.family !== next.family) return null;
  if (previous.family === 'assemble') {
    if (action.type === 'select' &&
      previous.rack.includes(action.pieceId) &&
      next.selected === action.pieceId &&
      previous.board === next.board) {
      return Object.freeze({ type: MOTION_TYPES.SELECT, pieceId: action.pieceId });
    }
    if (action.type === 'place' &&
      Number.isInteger(action.cell) && action.cell >= 0 &&
      previous.selected != null &&
      next.demoMoves === previous.demoMoves + 1 &&
      next.board[action.cell] === previous.selected &&
      previous.board[action.cell] == null) {
      return Object.freeze({ type: MOTION_TYPES.PLACE, pieceId: previous.selected, cell: action.cell });
    }
  }
  if (previous.family === 'planar' && action.type === 'shift' &&
      (action.axis === 'row' || action.axis === 'column') &&
      Number.isInteger(action.index) && action.index >= 0 && action.index < 6 &&
      (action.direction === -1 || action.direction === 1) &&
      next.demoMoves === previous.demoMoves + 1) {
    return Object.freeze({
      type: MOTION_TYPES.SHIFT,
      axis: action.axis,
      index: action.index,
      direction: action.direction,
    });
  }
  return null;
}
export const PLANAR_PREVIEW = Object.freeze([
  Object.freeze({ type: MOTION_TYPES.CLEAR, durationMs: 260 }),
  Object.freeze({ type: MOTION_TYPES.DROP, durationMs: 300 }),
  Object.freeze({ type: MOTION_TYPES.REFILL, durationMs: 250 }),
]);
export const PLANAR_PREVIEW_MS = PLANAR_PREVIEW.reduce((total,stage)=>total + stage.durationMs,0);

/** Storyboard-only clear/drop/refill. Never modifies board state. */
export function previewFrame(timeMs, reducedMotion = false) {
  if (reducedMotion) return Object.freeze({ type: 'complete', progress: 1, done: true });
  const time = Number.isFinite(timeMs) ? Math.max(0, timeMs) : 0;
  let elapsed = 0;
  for (const stage of PLANAR_PREVIEW) {
    const end = elapsed + stage.durationMs;
    if (time < end) return Object.freeze({
      type: stage.type,
      progress: Math.min(1, Math.max(0, (time - elapsed)/stage.durationMs)),
      done: false,
    });
    elapsed = end;
  }
  return Object.freeze({ type: 'complete', progress: 1, done: true });
}
export function motionDuration(type, reducedMotion = false) {
  if (reducedMotion) return 0;
  if (!Object.hasOwn(CUE_DURATIONS_MS,type)) throw new RangeError('Unknown presentation event');
  return CUE_DURATIONS_MS[type];
}
