/**
 * Living Atlas Pass 13 — a deliberately narrow visual projection boundary.
 * No production engine imports, Supabase access, score calculation or answer checks.
 * Only explicitly vetted display fields may reach a renderer.
 */
export const PROJECTION_PROTOCOL = 'jigsawverse.visual.v1';
export const PROJECTION_VERSION = 1;
export const PLANAR_KINDS = Object.freeze(['sun', 'river', 'seed', 'ember', 'indigo', 'clay']);
const KINDS = new Set(PLANAR_KINDS);
const TOKEN = /^viz_[A-Za-z0-9_-]{8,64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const PHASES = new Set(['active', 'complete', 'paused']);

function fail(message) { throw new TypeError('Visual projection rejected: ' + message); }
function plain(value, where) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) fail(where + ' must be a plain object');
}
function keysOnly(value, permitted, where) {
  plain(value, where);
  for (const key of Object.keys(value)) if (!permitted.includes(key)) fail(where + ' contains unapproved field ' + key);
}
function dimension(n, where) {
  if (!Number.isSafeInteger(n) || n < 1 || n > 15) fail(where + ' dimension out of range');
}
function visualToken(token, where) {
  if (typeof token !== 'string' || !TOKEN.test(token)) fail(where + ' has invalid opaque renderToken');
  return token;
}
function sessionId(id) {
  if (typeof id !== 'string' || !ID.test(id)) fail('invalid sessionId');
}
function boardPosition(n, total, where) {
  if (!Number.isSafeInteger(n) || n < 0 || n >= total) fail(where + ' index out of range');
}
function phase(value) { if (!PHASES.has(value)) fail('invalid phase'); }
function tokenFor(piece, tokenOf) {
  const token = visualToken(tokenOf(piece), 'piece');
  // Catch accidental identity mappings where original piece ID is exposed as a visual token.
  if (String(piece?.id) === token) fail('renderToken cannot equal the engine piece id');
  return token;
}
function uniqueToken(set, token) {
  if (set.has(token)) fail('duplicate renderToken in viewer-visible board/rack');
  set.add(token);
}
/**
 * A frame is untrusted until validateProjection has accepted it.
 * No score, answer, correctPosition, opponent rack, hint secrets, raw game state,
 * move history or game engine objects are valid fields.
 */
export function validateProjection(frame) {
  keysOnly(frame, ['protocol','version','sessionId','revision','family','origin','phase','board','rack'], 'frame');
  if (frame.protocol !== PROJECTION_PROTOCOL || frame.version !== PROJECTION_VERSION) fail('protocol version mismatch');
  sessionId(frame.sessionId);
  if (!Number.isSafeInteger(frame.revision) || frame.revision < 0) fail('invalid revision');
  if (!['assemble','planar'].includes(frame.family)) fail('unknown game family');
  if (!['solo-local','planar-local','server-viewer'].includes(frame.origin)) fail('invalid projection origin');
  if (frame.family === 'assemble' && frame.origin === 'planar-local') fail('invalid Assemble origin');
  if (frame.family === 'planar' && frame.origin === 'solo-local') fail('invalid Planar origin');
  phase(frame.phase);
  keysOnly(frame.board, ['rows','cols','cells'], 'board');
  dimension(frame.board.rows, 'board rows');
  dimension(frame.board.cols, 'board columns');
  const total = frame.board.rows * frame.board.cols;
  if (frame.family === 'planar' && (frame.board.rows !== 6 || frame.board.cols !== 6)) fail('Planar requires 6x6');
  if (!Array.isArray(frame.board.cells) || frame.board.cells.length !== total) fail('board cell count mismatch');
  const seen = new Set();
  for (const [index, cell] of frame.board.cells.entries()) {
    if (cell === null) { if (frame.family === 'planar') fail('Planar cells may not be empty'); continue; }
    const allowed = frame.family === 'assemble' ? ['renderToken'] : ['renderToken', 'kind'];
    keysOnly(cell, allowed, 'board cell ' + index);
    const token = visualToken(cell.renderToken, 'board cell ' + index);
    uniqueToken(seen, token);
    if (frame.family === 'planar' && !KINDS.has(cell.kind)) fail('unknown Planar tile kind');
  }
  if (frame.family === 'assemble') {
    if (!Array.isArray(frame.rack) || frame.rack.length > 225) fail('viewer rack required');
    for (const [index, token] of frame.rack.entries()) {
      if (token === null) continue;
      uniqueToken(seen, visualToken(token, 'rack ' + index));
    }
  } else if (Object.hasOwn(frame, 'rack')) fail('Planar has no rack');
  return true;
}
export function freezeProjection(frame) {
  validateProjection(frame);
  const cells = frame.board.cells.map(cell => cell === null ? null : Object.freeze({ ...cell }));
  const board = Object.freeze({ rows: frame.board.rows, cols: frame.board.cols, cells: Object.freeze(cells) });
  const projected = {
    protocol: PROJECTION_PROTOCOL, version: PROJECTION_VERSION,
    sessionId: frame.sessionId, revision: frame.revision, family: frame.family,
    origin: frame.origin, phase: frame.phase, board,
  };
  if (frame.family === 'assemble') projected.rack = Object.freeze([...frame.rack]);
  return Object.freeze(projected);
}
/** A deliberate SOLO ONLY projector for existing GameLogic.getGameState() output.
 * The caller supplies viewer-opaque render tokens through a stable mapping.
 * Multiplayer must use server-built, authenticated viewer projections instead.
 */
export function projectSoloAssembleState(raw, { sessionId: sid, revision, rows, cols, tokenOf }) {
  plain(raw, 'solo game state');
  if (raw.mode !== 'SINGLE_PLAYER') fail('raw multiplayer GameLogic state cannot enter renderer');
  if (typeof tokenOf !== 'function') fail('tokenOf mapping required');
  dimension(rows, 'Assemble rows');
  dimension(cols, 'Assemble columns');
  if (!Array.isArray(raw.grid) || raw.grid.length !== rows * cols ||
      !Array.isArray(raw.playerARack)) fail('invalid solo engine arrays');
  const frame = {
    protocol: PROJECTION_PROTOCOL, version: PROJECTION_VERSION, sessionId: sid, revision,
    family:'assemble', origin:'solo-local',
    phase: raw.isComplete ? 'complete' : 'active',
    board: { rows, cols, cells: raw.grid.map(piece => piece == null ? null : {renderToken:tokenFor(piece,tokenOf)}) },
    rack: raw.playerARack.map(piece => piece == null ? null : tokenFor(piece,tokenOf)),
  };
  return freezeProjection(frame);
}
/** Adapts the Planar Match PR #50 [{id,kind}] board shape without importing
 * its currently unmerged rule engine or re-running match/cascade detection.
 * The external move/clear/drop/refill events must come from its actual engine.
 */
export function projectPlanarEngineBoard(rawBoard, {sessionId: sid, revision, tokenOf, phase: statePhase = 'active'}) {
  if (!Array.isArray(rawBoard) || rawBoard.length !== 36 || typeof tokenOf !== 'function')
    fail('Planar 6x6 engine board and token mapper required');
  const frame = {
    protocol: PROJECTION_PROTOCOL, version: PROJECTION_VERSION, sessionId: sid, revision,
    family:'planar', origin:'planar-local', phase:statePhase,
    board: { rows:6, cols:6, cells:rawBoard.map(tile => {
      if (!tile || !KINDS.has(tile.kind)) fail('invalid Planar engine tile');
      return {renderToken:tokenFor(tile,tokenOf),kind:tile.kind};
    }) },
  };
  return freezeProjection(frame);
}
/** A structure check is NOT server authentication.
 * Server must construct per-viewer allowed fields and authenticate delivery.
 */
export function acceptServerViewerProjection(raw) {
  if (raw?.origin !== 'server-viewer') fail('server-viewer origin required');
  return freezeProjection(raw);
}
