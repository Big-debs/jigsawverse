// =====================================================
// SUPABASE CLIENT CONFIGURATION
// File: src/config/supabase.js
// =====================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
    flowType: 'pkce' // More secure auth flow
  },
  realtime: {
    params: {
      eventsPerSecond: 10
    }
  },
  db: {
    schema: 'public'
  },
  global: {
    headers: {
      'x-application-name': 'jigsawverse'
    }
  }
});

// Helper to check if user is authenticated
export const isAuthenticated = async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
};

// Helper to get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
};

// Helper to get user profile
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) throw error;
  return data;
};

// Storage bucket names
export const STORAGE_BUCKETS = {
  PUZZLE_IMAGES: 'puzzle-images',
  AVATARS: 'avatars'
};

// Table names
export const TABLES = {
  PROFILES: 'profiles',
  USER_STATS: 'user_stats',
  IMAGES: 'images',
  GAMES: 'games',
  GAME_STATE: 'game_state',
  PLAYER_PRESENCE: 'player_presence'
};

// Realtime channels
export const createGameChannel = (gameId) => {
  return supabase.channel(`game:${gameId}`);
};

export const createPresenceChannel = () => {
  return supabase.channel('presence');
};

export default supabase;