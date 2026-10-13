import { AuthoritativeMatchSession } from './authoritativeMatchSession.js';
import { MATCH_COMMAND_TYPES } from './matchProtocol.js';
import { MULTIPLAYER_AUTHORITY } from '../config/featureFlags.js';

const PLAYER_ROLES = new Set(['playerA', 'playerB']);
const SAFE_ASSET_KEYS = ['id', 'imageData', 'isEdge'];

const safeAsset = (asset) => Object.fromEntries(
  SAFE_ASSET_KEYS
    .filter((key) => asset?.[key] !== undefined)
    .map((key) => [key, asset[key]])
);

export function createSafePieceAssetMap(pieceAssets = []) {
  if (!Array.isArray(pieceAssets)) throw new TypeError('pieceAssets must be an array');
  const entries = pieceAssets.map((asset) => {
    if (!Number.isInteger(asset?.id) || asset.id < 0) {
      throw new TypeError('Every piece asset must have a non-negative integer ID');
    }
    return [asset.id, Object.freeze(safeAsset(asset))];
  });
  const map = new Map(entries);
  if (map.size !== entries.length) throw new TypeError('Piece asset IDs must be unique');
  return map;
}

const pieceFor = (pieceId, assets) => {
  if (!Number.isInteger(pieceId)) return null;
  return assets.get(pieceId) ?? Object.freeze({ id: pieceId });
};

const secondsRemaining = (endsAt, now) => {
  if (!endsAt) return 0;
  const milliseconds = new Date(endsAt).getTime() - now().getTime();
  return Number.isFinite(milliseconds) ? Math.max(0, Math.ceil(milliseconds / 1000)) : 0;
};

/** Maps a secrecy-reviewed projection into the legacy renderer's read model. */
export function projectionToGameplayState(projection, {
  viewerRole,
  pieceAssets = new Map(),
  now = () => new Date()
} = {}) {
  if (!PLAYER_ROLES.has(viewerRole)) throw new TypeError('viewerRole must be playerA or playerB');
  if (!(pieceAssets instanceof Map)) throw new TypeError('pieceAssets must be a Map');

  const ownRack = projection.rack.map((pieceId) => pieceFor(pieceId, pieceAssets));
  const opponentRack = Array.from({ length: projection.opponentRackCount }, () => null);
  const playerARack = viewerRole === 'playerA' ? ownRack : opponentRack;
  const playerBRack = viewerRole === 'playerB' ? ownRack : opponentRack;
  const result = projection.result;

  return {
    revision: projection.revision,
    mode: projection.match.mode,
    gameState: projection.match.status,
    grid: projection.board.map((cell) => cell ? pieceFor(cell.pieceId, pieceAssets) : null),
    playerARack,
    playerBRack,
    opponentRackCount: projection.opponentRackCount,
    piecePoolCount: projection.piecePoolCount,
    currentTurn: projection.currentTurn,
    scores: projection.revealedScores,
    revealedScores: projection.revealedScores,
    hintsUsed: projection.hintsUsed,
    turnsRemaining: projection.turnsRemaining,
    checksRemaining: projection.checksRemaining,
    nextCheckRevealProgress: projection.nextCheckRevealProgress,
    pendingCheck: projection.pendingDecision,
    piecePlacedBy: projection.nexus.piecePlacedBy,
    pieceMarks: projection.nexus.pieceMarks,
    nexusResolved: projection.nexus.resolved,
    timerRemaining: secondsRemaining(projection.match.endsAt, now),
    isComplete: result?.status === 'finished',
    winner: result?.winner ?? null,
    result
  };
}

/**
 * UI-compatible command facade for an already initialized protocol-v2 match.
 * Match creation remains a separate trusted bootstrap responsibility.
 */
export class AuthoritativeMultiplayerClient {
  constructor({ gameId, userId, viewerRole, transport, pieceAssets = [], now, commandIdFactory }) {
    if (!PLAYER_ROLES.has(viewerRole)) throw new TypeError('viewerRole must be playerA or playerB');
    this.authorityModel = MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2;
    this.gameId = gameId;
    this.userId = userId;
    this.viewerRole = viewerRole;
    this.pieceAssets = createSafePieceAssetMap(pieceAssets);
    this.now = now ?? (() => new Date());
    this.gameState = null;
    this.isConnected = false;
    this.onStateUpdate = null;
    this.onConnectionChange = null;

    this.session = new AuthoritativeMatchSession({
      gameId,
      userId,
      transport,
      commandIdFactory,
      onProjection: (projection) => this.applyProjection(projection),
      onStatus: ({ status }) => {
        this.isConnected = ['connected', 'submitting', 'recovering'].includes(status);
        this.onConnectionChange?.(status);
      }
    });
  }

  applyProjection(projection) {
    this.gameState = projectionToGameplayState(projection, {
      viewerRole: this.viewerRole,
      pieceAssets: this.pieceAssets,
      now: this.now
    });
    this.onStateUpdate?.(this.gameState);
  }

  async connect() {
    await this.session.connect();
    return this.gameState;
  }

  async submit(type, payload) {
    const response = await this.session.submit(type, payload);
    if (response?.status === 'rejected') {
      const error = new Error(`Command rejected: ${response.errorCode}`);
      error.code = response.errorCode;
      throw error;
    }
    return response;
  }

  async makeMove(pieceId, gridIndex) {
    await this.submit(MATCH_COMMAND_TYPES.PLACE_PIECE, { pieceId, gridIndex });
    return { success: true, awaitingCheck: Boolean(this.gameState?.pendingCheck) };
  }

  async respondToCheck(decision) {
    await this.submit(MATCH_COMMAND_TYPES.RESPOND_TO_CHECK, { decision });
    return { success: true, message: 'Decision accepted' };
  }

  async markPiece(gridIndex, markType) {
    await this.submit(MATCH_COMMAND_TYPES.MARK_PIECE, { gridIndex, markType });
    return { success: true };
  }

  async resolveEndGame() {
    await this.submit(MATCH_COMMAND_TYPES.RESOLVE_NEXUS, {});
    return { success: true, winner: this.gameState?.winner ?? null };
  }

  disconnect() {
    return this.session.disconnect();
  }
}
