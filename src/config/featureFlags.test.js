import { describe, expect, it } from 'vitest';
import {
  MULTIPLAYER_AUTHORITY,
  authorityForExistingMatch,
  authorityForNewMatch,
  readFeatureFlags
} from './featureFlags.js';

describe('multiplayer authority routing', () => {
  it('keeps authoritative multiplayer disabled unless explicitly true', () => {
    expect(readFeatureFlags({}).authoritativeMultiplayerV2).toBe(false);
    expect(readFeatureFlags({ VITE_AUTHORITATIVE_MULTIPLAYER_V2: 'false' }).authoritativeMultiplayerV2).toBe(false);
    expect(readFeatureFlags({ VITE_AUTHORITATIVE_MULTIPLAYER_V2: 'true' }).authoritativeMultiplayerV2).toBe(true);
  });

  it('uses the flag only to choose authority for a new match', () => {
    expect(authorityForNewMatch({ authoritativeMultiplayerV2: false })).toBe(MULTIPLAYER_AUTHORITY.LEGACY);
    expect(authorityForNewMatch({ authoritativeMultiplayerV2: true })).toBe(MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2);
  });

  it('honors persisted authority independently of the current flag', () => {
    expect(authorityForExistingMatch({ authority_model: 'authoritative_v2' }))
      .toBe(MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2);
    expect(authorityForExistingMatch({ authorityModel: 'legacy' }))
      .toBe(MULTIPLAYER_AUTHORITY.LEGACY);
    expect(() => authorityForExistingMatch({})).toThrow('pinned authority');
  });
});
