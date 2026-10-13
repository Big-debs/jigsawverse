export { supabase, isAuthenticated, getCurrentUser, getUserProfile, STORAGE_BUCKETS, TABLES, createGameChannel, createPresenceChannel, checkConnection, handleApiError } from './supabase';
export {
  MULTIPLAYER_AUTHORITY,
  authorityForExistingMatch,
  authorityForNewMatch,
  readFeatureFlags
} from './featureFlags';
