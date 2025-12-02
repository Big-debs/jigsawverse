// =====================================================
// SUPABASE CLIENT CONFIGURATION
// =====================================================

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env. VITE_SUPABASE_URL?.trim();
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables! ');
}

const url = supabaseUrl || 'https://placeholder.supabase. co';
const key = supabaseAnonKey || 'placeholder-key';

export const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    flowType: 'pkce'
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

// Make supabase available globally for debugging
if (typeof window !== 'undefined') {
  window.supabase = supabase;
}

/**
 * Set up the realtime client to use the current access token
 */
export const setupRealtimeAuth = async () => {
  const { data: { session } } = await supabase.auth. getSession();
  
  if (session?. access_token) {
    supabase.realtime.setAuth(session.access_token);
    console.log('Realtime auth token set');
    return true;
  }
  
  console. warn('No session available for realtime auth');
  return false;
};

// Listen for auth changes and update realtime token
supabase. auth.onAuthStateChange(async (event, session) => {
  console.log('=== AUTH STATE CHANGE ===');
  console. log('Event:', event);
  console. log('Session exists:', !!session);
  console.log('Access token exists:', !!session?. access_token);
  
  if (session?.access_token) {
    supabase.realtime.setAuth(session.access_token);
    console.log('Realtime auth token updated');
    console.log('Realtime accessToken set:', !!supabase. realtime.accessToken);
  } else if (event === 'SIGNED_OUT') {
    supabase.realtime.setAuth(null);
    console.log('Realtime auth cleared');
  }
});

// Debug: Check session on load
(async () => {
  if (typeof window !== 'undefined') {
    const { data } = await supabase.auth.getSession();
    console. log('=== INITIAL SESSION CHECK ===');
    console.log('Session exists:', !!data. session);
    console.log('Access token exists:', !!data.session?.access_token);
    console.log('Realtime accessToken:', !!supabase.realtime.accessToken);
    
    if (data.session?. access_token && ! supabase.realtime.accessToken) {
      console. log('Setting realtime auth from existing session...');
      supabase.realtime.setAuth(data.session.access_token);
      console.log('Realtime accessToken now:', !!supabase. realtime.accessToken);
    }
  }
})();

// Helper to check if user is authenticated
export const isAuthenticated = async () => {
  const { data: { session } } = await supabase. auth.getSession();
  return !! session;
};

// Helper to get current user
export const getCurrentUser = async () => {
  const { data: { user } } = await supabase. auth.getUser();
  return user;
};

// Helper to get user profile
export const getUserProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    . single();
  
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
  return supabase. channel(`game:${gameId}`);
};

export const createPresenceChannel = () => {
  return supabase. channel('presence');
};

// Helper to check connection
export const checkConnection = async () => {
  try {
    const { error } = await supabase.auth. getSession();
    return !error;
  } catch (err) {
    console.error('Supabase connection failed:', err);
    return false;
  }
};

// Centralized error handler for API responses
export const handleApiError = (error) => {
  console.error('API Error:', error);
  
  if (error.code === 'PGRST116') {
    return 'Resource not found';
  }
  
  if (error.code === '23505') {
    return 'Duplicate entry';
  }
  
  if (error.message?.includes('JWT')) {
    return 'Session expired. Please login again. ';
  }
  
  return error.message || 'An unexpected error occurred';
};

export default supabase;
