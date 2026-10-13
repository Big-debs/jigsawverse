import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./JigsawVerseApp.jsx', import.meta.url), 'utf8');

describe('authoritative multiplayer screen routing', () => {
  it('uses the rollout flag only for new match creation', () => {
    expect(source).toContain('const authority = authorityForNewMatch()');
    expect(source).toContain('authority === MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2');
  });

  it('resolves joins from trusted persisted authority before legacy mutation', () => {
    const resolveIndex = source.indexOf('const resolved = await lobbyService.join');
    const legacyJoinIndex = source.indexOf('const result = await gameGuest.joinGame(gameCode)');
    expect(resolveIndex).toBeGreaterThan(-1);
    expect(legacyJoinIndex).toBeGreaterThan(resolveIndex);
    expect(source).toContain('authorityForExistingMatch(resolved)');
  });

  it('waits for trusted readiness before bootstrapping gameplay', () => {
    expect(source).toContain('await waitForAuthoritativeMatch({');
    expect(source).toContain('await bootstrapAuthoritativeMatch({');
    expect(source).toContain('multiplayerRef.current = prepared.client');
  });
});
