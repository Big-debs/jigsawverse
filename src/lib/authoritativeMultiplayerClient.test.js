import { describe, expect, it, vi } from 'vitest';
import {
  AuthoritativeMultiplayerClient,
  createSafePieceAssetMap,
  projectionToGameplayState
} from './authoritativeMultiplayerClient.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';

const projection = (revision = 0) => ({
  schemaVersion: 1,
  protocolVersion: 2,
  rulesetVersion: 1,
  revision,
  match: {
    gameId: GAME_ID,
    mode: 'NEXUS',
    status: 'active',
    rows: 1,
    cols: 2,
    totalPieces: 2,
    rackCapacity: 1,
    startedAt: '2026-10-13T11:00:00.000Z',
    endsAt: '2026-10-13T11:02:00.000Z'
  },
  board: [{ pieceId: 1 }, null],
  rack: [0],
  opponentRackCount: 1,
  piecePoolCount: 0,
  currentTurn: 'playerA',
  revealedScores: {
    playerA: { score: 4, accuracy: 100, streak: 1 },
    playerB: { score: 0, accuracy: 100, streak: 0 }
  },
  hintsUsed: 0,
  turnsRemaining: { playerA: 1, playerB: 1 },
  checksRemaining: { playerA: 1, playerB: 1 },
  nextCheckRevealProgress: 20,
  pendingDecision: null,
  nexus: {
    piecePlacedBy: { 0: 'playerB' },
    pieceMarks: { 0: { marker: 'playerA', type: 'suspect' } },
    resolved: false
  },
  result: null
});

const assets = [
  { id: 0, imageData: 'data:image/png;base64,AA', correctPosition: 1, row: 9 },
  { id: 1, imageData: 'data:image/png;base64,BB', correctPosition: 0, edges: { top: true } }
];

describe('authoritative multiplayer client adapter', () => {
  it('retains only render-safe asset fields', () => {
    const safe = createSafePieceAssetMap(assets);
    expect(safe.get(0)).toEqual({ id: 0, imageData: 'data:image/png;base64,AA' });
    expect(JSON.stringify([...safe.values()])).not.toContain('correctPosition');
    expect(JSON.stringify([...safe.values()])).not.toContain('row');
    expect(JSON.stringify([...safe.values()])).not.toContain('edges');
  });

  it('maps only the viewer rack and revealed score into the UI read model', () => {
    const state = projectionToGameplayState(projection(), {
      viewerRole: 'playerA',
      pieceAssets: createSafePieceAssetMap(assets),
      now: () => new Date('2026-10-13T11:01:00.000Z')
    });

    expect(state.playerARack).toEqual([{ id: 0, imageData: 'data:image/png;base64,AA' }]);
    expect(state.playerBRack).toEqual([null]);
    expect(state.grid[0]).toEqual({ id: 1, imageData: 'data:image/png;base64,BB' });
    expect(state.scores.playerA.score).toBe(4);
    expect(state.timerRemaining).toBe(60);
    expect(JSON.stringify(state)).not.toContain('correctPosition');
  });

  it('connects an initialized match and submits semantic commands', async () => {
    let listener;
    const transport = {
      fetchProjection: vi.fn(async () => projection()),
      subscribeProjection: vi.fn(async ({ onProjection }) => {
        listener = onProjection;
        return { unsubscribe: vi.fn() };
      }),
      submitCommand: vi.fn(async (command) => ({
        status: 'accepted',
        revision: 1,
        projection: {
          ...projection(1),
          board: [{ pieceId: 1 }, { pieceId: command.payload.pieceId }],
          rack: []
        }
      }))
    };
    const client = new AuthoritativeMultiplayerClient({
      gameId: GAME_ID,
      userId: USER_ID,
      viewerRole: 'playerA',
      transport,
      pieceAssets: assets,
      commandIdFactory: () => COMMAND_ID
    });
    const updates = [];
    client.onStateUpdate = (state) => updates.push(state.revision);

    await client.connect();
    const result = await client.makeMove(0, 1);

    expect(result).toEqual({ success: true, awaitingCheck: false });
    expect(transport.submitCommand).toHaveBeenCalledWith(expect.objectContaining({
      commandId: COMMAND_ID,
      expectedRevision: 0,
      type: 'place_piece',
      payload: { pieceId: 0, gridIndex: 1 }
    }));
    expect(updates).toEqual([0, 1]);
    expect(listener).toBeTypeOf('function');
    expect(client.gameState.playerBRack).toEqual([null]);
  });
});
