/**
 * Production Integration Sprint 1 — SOLO Assemble local-only visual bridge.
 * Never use with multiplayer, ranked games, or an unknown image fragment registry.
 * The renderer receives fragment indices and does not receive GameLogic, scores,
 * moveHistory, opponent state, correctPosition or piece imageData objects.
 */
import { projectSoloAssembleState } from '../../tools/renderer-lab/src/engineProjection.js';
import { soloAssembleToLabState } from '../../tools/renderer-lab/src/projectionLabAdapter.js';

export const SOLO_ATLAS_FLAG = 'VITE_ENABLE_LIVING_ATLAS_SOLO_3D';

export function isSoloAtlasEnabled(env = import.meta.env) {
  return env?.VITE_ENABLE_LIVING_ATLAS_SOLO_3D === 'true';
}

export function createEnabledSoloAtlasSession(pieces, dimensions, env = import.meta.env, createNonce) {
  if (!isSoloAtlasEnabled(env)) return null;
  return createSoloAtlasSession(pieces, dimensions, createNonce);
}

export function createSoloAtlasSession(pieces, dimensions, createNonce = () => Math.random().toString(36).slice(2)) {
  if (dimensions?.rows !== 5 || dimensions?.cols !== 5 ||
      dimensions?.totalPieces !== 25 ||
      !Array.isArray(pieces) || pieces.length !== 25) return null;
  const fragmentMap = new Map();
  const idToToken = new Map();
  const tokenToFragment = new Map();
  const ids = new Set();
  const nonce = String(createNonce()).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 18);
  if (nonce.length < 6) return null;

  for (const [index, piece] of pieces.entries()) {
    if (!piece || (typeof piece.id !== 'string' && !Number.isSafeInteger(piece.id)) ||
        !Number.isSafeInteger(piece.correctPosition) ||
        piece.correctPosition < 0 || piece.correctPosition >= 25 ||
        ids.has(piece.id) || fragmentMap.has(piece.correctPosition)) return null;
    ids.add(piece.id);
    fragmentMap.set(piece.correctPosition, piece);
    const token = `viz_${nonce}_${index.toString(36).padStart(4, '0')}`;
    idToToken.set(piece.id, token);
    tokenToFragment.set(token, piece.correctPosition);
  }
  if (fragmentMap.size !== 25) return null;
  const sessionId = `soloatlas_${nonce}`;
  return Object.freeze({
    sessionId,
    pieceForFragment(fragment) {
      return fragmentMap.get(fragment) ?? null;
    },
    hasFragmentInRack(state, fragment) {
      return Array.isArray(state?.playerARack) &&
        state.playerARack.some(piece => piece && fragmentMap.get(fragment)?.id === piece.id);
    },
    project(state, selectedPiece, revision = 0) {
      const frame = projectSoloAssembleState(state, {
        sessionId, revision, rows: 5, cols: 5,
        tokenOf: piece => {
          const token = idToToken.get(piece?.id);
          if (!token) throw new TypeError('Unknown solo Assemble piece');
          return token;
        },
      });
      const view = soloAssembleToLabState(frame, {
        allowLocalImageSlices: true,
        fragmentForToken: token => {
          if (!tokenToFragment.has(token)) throw new TypeError('Unknown solo fragment token');
          return tokenToFragment.get(token);
        },
      });
      const selected = selectedPiece == null ? null : fragmentMap.has(selectedPiece.correctPosition) &&
        fragmentMap.get(selectedPiece.correctPosition)?.id === selectedPiece.id ?
        selectedPiece.correctPosition : null;
      return Object.freeze({ ...view, selected });
    },
  });
}
