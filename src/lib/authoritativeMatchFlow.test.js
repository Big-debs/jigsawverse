import { describe, expect, it, vi } from 'vitest';
import {
  AuthoritativeMatchFlowError,
  bootstrapAuthoritativeMatch,
  waitForAuthoritativeMatch
} from './authoritativeMatchFlow.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('authoritative match UI flow', () => {
  it('waits for both player assignment and trusted assets', async () => {
    const status = vi.fn()
      .mockResolvedValueOnce({ lobbyStatus: 'waiting', assetStatus: 'queued', ready: false })
      .mockResolvedValueOnce({ lobbyStatus: 'active', assetStatus: 'processing', ready: false })
      .mockResolvedValueOnce({ lobbyStatus: 'active', assetStatus: 'prepared', ready: true });
    const onStatus = vi.fn();
    const delay = vi.fn(async () => {});
    await expect(waitForAuthoritativeMatch({
      lobbyService: { status },
      gameId: GAME_ID,
      delay,
      onStatus
    })).resolves.toMatchObject({ ready: true });
    expect(status).toHaveBeenCalledTimes(3);
    expect(delay).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenCalledTimes(3);
  });

  it('fails closed when trusted preparation reports failure', async () => {
    await expect(waitForAuthoritativeMatch({
      lobbyService: { status: vi.fn(async () => ({ assetStatus: 'failed', ready: false })) },
      gameId: GAME_ID,
      delay: vi.fn()
    })).rejects.toMatchObject({ code: 'asset_preparation_failed' });
  });

  it('does not poll after cancellation', async () => {
    const controller = new AbortController();
    controller.abort();
    const status = vi.fn();
    await expect(waitForAuthoritativeMatch({
      lobbyService: { status },
      gameId: GAME_ID,
      signal: controller.signal
    })).rejects.toBeInstanceOf(AuthoritativeMatchFlowError);
    expect(status).not.toHaveBeenCalled();
  });

  it('bootstraps assets and connects the private projection session', async () => {
    const projection = {
      schemaVersion: 1,
      protocolVersion: 2,
      rulesetVersion: 1,
      revision: 0,
      match: {
        gameId: GAME_ID,
        mode: 'NEXUS',
        status: 'active',
        rows: 2,
        cols: 2,
        totalPieces: 4,
        rackCapacity: 1,
        startedAt: '2026-10-13T10:00:00.000Z',
        endsAt: '2026-10-13T10:10:00.000Z'
      },
      board: [null, null, null, null],
      rack: [1000000001],
      opponentRackCount: 1,
      piecePoolCount: 2,
      currentTurn: 'playerA',
      revealedScores: {
        playerA: { score: 0, accuracy: 100, streak: 0 },
        playerB: { score: 0, accuracy: 100, streak: 0 }
      },
      hintsUsed: 0,
      turnsRemaining: { playerA: null, playerB: null },
      checksRemaining: { playerA: 0, playerB: 0 },
      nextCheckRevealProgress: null,
      pendingDecision: null,
      nexus: { piecePlacedBy: {}, pieceMarks: {}, resolved: false },
      result: null
    };
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      single: vi.fn(async () => ({ data: { projection }, error: null }))
    };
    const channel = {
      on: vi.fn(() => channel),
      subscribe: vi.fn((callback) => { callback('SUBSCRIBED'); return channel; })
    };
    const supabase = {
      from: vi.fn(() => query),
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(async () => {}),
      functions: {
        invoke: vi.fn(async () => ({
          data: {
            status: 'ready',
            authorityModel: 'authoritative_v2',
            viewerRole: 'playerA',
            projection,
            pieceAssets: [{ id: 1000000001, imageData: 'https://signed.test/piece.png' }]
          },
          error: null
        }))
      }
    };
    const result = await bootstrapAuthoritativeMatch({ supabase, userId: USER_ID, gameId: GAME_ID });
    expect(result.client.isConnected).toBe(true);
    expect(result.gameData.gridDimensions).toEqual({ rows: 2, cols: 2, totalPieces: 4 });
    expect(result.gameData.gameState.playerARack[0]).toMatchObject({ id: 1000000001 });
    await result.client.disconnect();
  });
});
