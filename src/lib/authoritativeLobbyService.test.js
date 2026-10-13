import { describe, expect, it, vi } from 'vitest';
import { AuthoritativeLobbyService } from './authoritativeLobbyService.js';

const GAME_ID = '11111111-1111-4111-8111-111111111111';
const IMAGE_ID = '22222222-2222-4222-8222-222222222222';

const clientWith = (data) => ({
  functions: { invoke: vi.fn(async () => ({ data, error: null })) }
});

describe('authoritative lobby browser service', () => {
  it('sends creation inputs without actor or protected state', async () => {
    const supabase = clientWith({ status: 'created', authorityModel: 'authoritative_v2' });
    const service = new AuthoritativeLobbyService({ supabase });
    await service.create({
      imageId: IMAGE_ID,
      gridSize: 10,
      gameplayMode: 'NEXUS',
      playerName: 'Host',
      timeLimit: 720
    });
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ranked-match-lobby-v2', {
      body: expect.objectContaining({ action: 'create', imageId: IMAGE_ID, rows: 10, cols: 10 })
    });
    const body = supabase.functions.invoke.mock.calls[0][1].body;
    expect(body).not.toHaveProperty('actorId');
    expect(body).not.toHaveProperty('pieceCatalog');
  });

  it('uses the trusted join response to resolve persisted authority', async () => {
    const supabase = clientWith({ status: 'resolved', authorityModel: 'legacy', gameId: GAME_ID });
    const service = new AuthoritativeLobbyService({ supabase });
    await expect(service.join({ gameCode: 'ABC123', playerName: 'Guest' }))
      .resolves.toMatchObject({ authorityModel: 'legacy' });
  });

  it('polls readiness by game ID only', async () => {
    const supabase = clientWith({ status: 'ok', ready: false });
    const service = new AuthoritativeLobbyService({ supabase });
    await service.status(GAME_ID);
    expect(supabase.functions.invoke).toHaveBeenCalledWith('ranked-match-lobby-v2', {
      body: { action: 'status', gameId: GAME_ID }
    });
  });
});
