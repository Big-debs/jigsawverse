export const MULTIPLAYER_AUTHORITY = Object.freeze({
  LEGACY: 'legacy',
  AUTHORITATIVE_V2: 'authoritative_v2'
});

const enabled = (value) => value === true || String(value).trim().toLowerCase() === 'true';

export function readFeatureFlags(environment = import.meta.env) {
  return Object.freeze({
    authoritativeMultiplayerV2: enabled(environment?.VITE_AUTHORITATIVE_MULTIPLAYER_V2)
  });
}

/** Feature flags choose authority only when a new match is created. */
export function authorityForNewMatch(featureFlags = readFeatureFlags()) {
  return featureFlags.authoritativeMultiplayerV2
    ? MULTIPLAYER_AUTHORITY.AUTHORITATIVE_V2
    : MULTIPLAYER_AUTHORITY.LEGACY;
}

/**
 * Existing matches always follow their persisted authority. A flag change must
 * never move an in-progress match between the legacy and v2 protocols.
 */
export function authorityForExistingMatch(match) {
  const authority = match?.authorityModel ?? match?.authority_model;
  if (!Object.values(MULTIPLAYER_AUTHORITY).includes(authority)) {
    throw new TypeError('Match does not have a supported pinned authority model');
  }
  return authority;
}
