// =====================================================
// API INDEX - Central export for all API modules
// =====================================================

// Games API - Game creation, joining, and management
export { gamesApi, gameStateApi, gameImagesApi } from './games';

// Users API - Authentication and user profiles
export { authApi, profilesApi, userStatsApi } from './users';

// Leaderboard API - Rankings and statistics
export { leaderboardApi } from './leaderboard';

// Presence API - Player presence and realtime features
export { presenceApi } from './presence';

// Default export with all APIs grouped
export default {
  // Game-related
  games: () => import('./games').then(m => m.gamesApi),
  gameState: () => import('./games').then(m => m.gameStateApi),
  gameImages: () => import('./games').then(m => m.gameImagesApi),
  
  // User-related
  auth: () => import('./users').then(m => m.authApi),
  profiles: () => import('./users').then(m => m.profilesApi),
  userStats: () => import('./users').then(m => m.userStatsApi),
  
  // Leaderboard
  leaderboard: () => import('./leaderboard').then(m => m.leaderboardApi),
  
  // Presence/Realtime
  presence: () => import('./presence').then(m => m.presenceApi)
};
