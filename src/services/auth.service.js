// =====================================================
// AUTHENTICATION SERVICE
// =====================================================

import { supabase } from '../config/supabase';

export const authService = {
  // Sign up with email/password
  async signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username,
          display_name: username
        }
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign in with email/password
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;
    return data;
  },

  // Sign in with OAuth (Google, GitHub, etc.)
  async signInWithOAuth(provider) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`
      }
    });

    if (error) throw error;
    return data;
  },

  // Sign in anonymously (Guest)
  async signInAnonymously() {
    // Use Supabase's built-in anonymous sign-in
    const { data, error } = await supabase.auth.signInAnonymously();
    
    if (error) throw error;
    
    // Update user metadata with guest name (timestamp-based to reduce collisions)
    const guestNumber = Date.now() % 10000;
    const { error: updateError } = await supabase.auth.updateUser({
      data: {
        username: `Guest_${guestNumber}`,
        display_name: `Guest Player`,
        is_anonymous: true
      }
    });
    
    if (updateError) {
      console.warn('Failed to update guest metadata:', updateError);
    }
    
    return data;
  },

  // Sign out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },

  // Get current session
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session;
  },

  // Get current user
  async getCurrentUser() {
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    return data.user;
  },

  // Update user profile
  async updateProfile(userId, updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Listen to auth state changes
  onAuthStateChange(callback) {
    return supabase.auth.onAuthStateChange(callback);
  },

  // Reset password
  async resetPassword(email) {
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`
    });

    if (error) throw error;
    return data;
  },

  // Update user metadata via auth
  async updateUserMetadata(updates) {
    const { data, error } = await supabase.auth.updateUser({
      data: updates
    });

    if (error) throw error;
    return data;
  }
};

export default authService;
