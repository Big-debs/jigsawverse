const DEFAULT_THRESHOLD = 28;
const TAP_SLOP = 5;

export function evaluateRailGesture({
  axis,
  startX,
  startY,
  currentX,
  currentY,
  threshold = DEFAULT_THRESHOLD,
}) {
  const dx = currentX - startX;
  const dy = currentY - startY;
  const primaryDelta = axis === 'row' ? dx : dy;
  const crossDelta = axis === 'row' ? dy : dx;
  const primaryDistance = Math.abs(primaryDelta);
  const crossDistance = Math.abs(crossDelta);
  const moved = Math.hypot(dx, dy) >= TAP_SLOP;
  const aligned = primaryDistance >= crossDistance;
  const ready = aligned && primaryDistance >= threshold;
  const previewLimit = threshold * 0.72;

  return {
    aligned,
    moved,
    ready,
    direction: primaryDelta >= 0 ? 1 : -1,
    primaryDelta,
    progress: Math.min(1, primaryDistance / threshold),
    previewDelta: Math.max(-previewLimit, Math.min(previewLimit, primaryDelta)),
  };
}
