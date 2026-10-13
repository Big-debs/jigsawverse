import { describe, expect, it, vi } from 'vitest';
import { createMatchCommand, MATCH_COMMAND_TYPES } from '../../../src/lib/matchProtocol.js';
import { processRankedCommand } from './rankedCommandWorker.js';
import { AuthoritativeCommandGateStore } from './authoritativeCommandGateHarness.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const PLAYER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PLAYER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const commandId = (digit) => `${digit.repeat(8)}-${digit.repeat(4)}-4${digit.repeat(3)}-8${digit.repeat(3)}-${digit.repeat(12)}`;

const baseState = () => ({
  schemaVersion: 1,
  protocolVersion: 2,
  rulesetVersion: 1,
  revision: 0,
  match: { gameId: GAME_ID, status: 'active' },
  board: [null, null],
  result: null
});

const command = ({ id, actor = PLAYER_A, revision = 0, pieceId = 0, gridIndex = 0 }) => ({
  actor,
  value: createMatchCommand({
    gameId: GAME_ID,
    commandId: commandId(id),
    expectedRevision: revision,
    type: MATCH_COMMAND_TYPES.PLACE_PIECE,
    payload: { pieceId, gridIndex }
  })
});

const evaluate = vi.fn(({ canonicalState, command: submitted, actorRole }) => {
  const nextRevision = canonicalState.revision + 1;
  const nextState = structuredClone(canonicalState);
  if (nextState.board[submitted.payload.gridIndex]) throw new Error('Position occupied');
  nextState.revision = nextRevision;
  nextState.board[submitted.payload.gridIndex] = {
    pieceId: submitted.payload.pieceId,
    placedBy: actorRole
  };
  return {
    canonicalState: nextState,
    projections: {
      playerA: { revision: nextRevision, board: nextState.board },
      playerB: { revision: nextRevision, board: nextState.board }
    }
  };
});

const createStore = (overrides = {}) => new AuthoritativeCommandGateStore({
  gameId: GAME_ID,
  playerAId: PLAYER_A,
  playerBId: PLAYER_B,
  canonicalState: baseState(),
  endsAt: '2026-10-13T12:00:00.000Z',
  clock: () => new Date('2026-10-13T11:00:00.000Z'),
  ...overrides
});

const submit = (store, request) => processRankedCommand({
  admin: store.admin,
  actorId: request.actor,
  command: request.value,
  now: new Date('2026-10-13T11:00:00.000Z'),
  evaluate
});

describe('Sprint 1 authoritative concurrency gates', () => {
  it('allows exactly one concurrent command at a shared revision to commit', async () => {
    const store = createStore();
    const results = await Promise.all([
      submit(store, command({ id: '2', actor: PLAYER_A, pieceId: 0, gridIndex: 0 })),
      submit(store, command({ id: '3', actor: PLAYER_B, pieceId: 1, gridIndex: 0 }))
    ]);

    expect(results.filter(({ status }) => status === 'accepted')).toHaveLength(1);
    expect(results.filter(({ errorCode }) => errorCode === 'revision_conflict')).toHaveLength(1);
    expect(store.snapshot()).toMatchObject({ revision: 1 });
    expect(store.snapshot().outbox).toHaveLength(2);
  });

  it('replays simultaneous duplicate command IDs without a second commit', async () => {
    const store = createStore();
    const request = command({ id: '4' });
    const results = await Promise.all([submit(store, request), submit(store, request)]);

    expect(results).toEqual([results[0], results[0]]);
    expect(results[0]).toMatchObject({ status: 'accepted', revision: 1 });
    expect(store.snapshot().outbox).toHaveLength(2);
  });

  it('rejects reuse of a command ID with a different payload', async () => {
    const store = createStore();
    const first = command({ id: '5', pieceId: 0 });
    const conflicting = command({ id: '5', pieceId: 1 });

    const accepted = await submit(store, first);
    const rejected = await submit(store, conflicting);

    expect(accepted.status).toBe('accepted');
    expect(rejected).toEqual({ status: 'rejected', errorCode: 'command_id_conflict' });
    expect(store.snapshot().revision).toBe(1);
  });

  it('resumes a pending ledger command after a worker interruption', async () => {
    const store = createStore();
    const request = command({ id: '6' });
    store.failNextCommit();

    await expect(submit(store, request)).rejects.toMatchObject({ code: 'database_rpc_failed' });
    expect(store.snapshot().commandStatuses).toEqual([{
      commandId: request.value.commandId,
      status: 'pending',
      errorCode: null
    }]);

    const retried = await submit(store, request);
    expect(retried).toMatchObject({ status: 'accepted', revision: 1 });
    expect(store.snapshot().outbox).toHaveLength(2);
  });

  it('rejects a command exactly at the authoritative deadline', async () => {
    const store = createStore({
      clock: () => new Date('2026-10-13T12:00:00.000Z')
    });

    const result = await submit(store, command({ id: '7' }));

    expect(result).toEqual({
      status: 'rejected',
      errorCode: 'deadline_expired',
      currentRevision: 0
    });
    expect(store.snapshot().outbox).toHaveLength(0);
  });
});
