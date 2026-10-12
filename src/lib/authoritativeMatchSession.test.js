import { describe, expect, it, vi } from 'vitest';
import { AuthoritativeMatchSession } from './authoritativeMatchSession.js';
import { MATCH_COMMAND_TYPES } from './matchProtocol.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMMAND_ID = '22222222-2222-4222-8222-222222222222';

const projection = (revision) => ({
  schemaVersion: 1,
  protocolVersion: 2,
  rulesetVersion: 1,
  revision,
  match: { gameId: GAME_ID, status: 'active' },
  board: []
});

const createTransport = ({ snapshots = [projection(0), projection(0)], onSubscribe } = {}) => {
  const queue = [...snapshots];
  let listener = null;
  const unsubscribe = vi.fn();

  return {
    fetchProjection: vi.fn(async () => queue.shift() ?? projection(0)),
    subscribeProjection: vi.fn(async ({ onProjection }) => {
      listener = onProjection;
      if (onSubscribe) await onSubscribe(onProjection);
      return unsubscribe;
    }),
    submitCommand: vi.fn(),
    emit(value) {
      return listener(value);
    },
    unsubscribe
  };
};

describe('AuthoritativeMatchSession connection recovery', () => {
  it('closes the fetch/subscribe race with a confirmed snapshot', async () => {
    const received = [];
    const transport = createTransport({
      snapshots: [projection(0), projection(1)],
      onSubscribe: async (listener) => listener(projection(1))
    });
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      onProjection: (value) => received.push(value.revision)
    });

    await session.connect();

    expect(transport.fetchProjection).toHaveBeenCalledTimes(2);
    expect(received).toEqual([0, 1]);
    expect(session.revision).toBe(1);
    expect(session.status).toBe('connected');
  });

  it('fetches a fresh snapshot when a revision gap is observed', async () => {
    const received = [];
    const transport = createTransport({
      snapshots: [projection(0), projection(0), projection(2)]
    });
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      onProjection: (value, meta) => received.push([value.revision, meta.source])
    });
    await session.connect();

    await transport.emit(projection(2));

    expect(transport.fetchProjection).toHaveBeenCalledTimes(3);
    expect(received).toEqual([
      [0, 'initial_snapshot'],
      [2, 'recovery_snapshot']
    ]);
    expect(session.revision).toBe(2);
  });

  it('ignores duplicate and out-of-order events', async () => {
    const received = [];
    const transport = createTransport();
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      onProjection: (value) => received.push(value.revision)
    });
    await session.connect();

    await transport.emit(projection(1));
    await transport.emit(projection(1));
    await transport.emit(projection(0));

    expect(received).toEqual([0, 1]);
  });

  it('rejects incompatible projection protocol versions', async () => {
    const incompatible = { ...projection(0), protocolVersion: 99 };
    const transport = createTransport({ snapshots: [incompatible] });
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport
    });

    await expect(session.connect()).rejects.toThrow('unsupported protocol version');
    expect(session.status).toBe('error');
  });

  it('unsubscribes and ignores delayed events after disconnect', async () => {
    const received = [];
    const transport = createTransport();
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      onProjection: (value) => received.push(value.revision)
    });
    await session.connect();
    await session.disconnect();

    await transport.emit(projection(1));

    expect(transport.unsubscribe).toHaveBeenCalledOnce();
    expect(received).toEqual([0]);
    expect(session.status).toBe('disconnected');
  });
});

describe('AuthoritativeMatchSession command delivery', () => {
  it('retries an acknowledgement timeout with the same command ID', async () => {
    const transport = createTransport();
    const timeout = Object.assign(new Error('acknowledgement timeout'), { retryable: true });
    transport.submitCommand
      .mockRejectedValueOnce(timeout)
      .mockResolvedValueOnce({ status: 'accepted', revision: 1, projection: projection(1) });
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      commandIdFactory: () => COMMAND_ID
    });
    await session.connect();

    const response = await session.submit(
      MATCH_COMMAND_TYPES.PLACE_PIECE,
      { pieceId: 0, gridIndex: 0 }
    );

    expect(response.status).toBe('accepted');
    expect(transport.submitCommand).toHaveBeenCalledTimes(2);
    expect(transport.submitCommand.mock.calls[0][0]).toBe(transport.submitCommand.mock.calls[1][0]);
    expect(transport.submitCommand.mock.calls[0][0]).toMatchObject({
      commandId: COMMAND_ID,
      expectedRevision: 0
    });
    expect(transport.submitCommand.mock.calls[0][0]).not.toHaveProperty('actorId');
    expect(session.revision).toBe(1);
  });

  it('recovers a snapshot after a stale command rejection', async () => {
    const transport = createTransport({
      snapshots: [projection(0), projection(0), projection(1)]
    });
    transport.submitCommand.mockResolvedValue({
      status: 'rejected',
      errorCode: 'stale_revision',
      currentRevision: 1
    });
    const session = new AuthoritativeMatchSession({
      gameId: GAME_ID,
      userId: USER_ID,
      transport,
      commandIdFactory: () => COMMAND_ID
    });
    await session.connect();

    await session.submit(MATCH_COMMAND_TYPES.RESOLVE_NEXUS, {});

    expect(session.revision).toBe(1);
    expect(transport.fetchProjection).toHaveBeenCalledTimes(3);
    expect(session.status).toBe('connected');
  });
});
