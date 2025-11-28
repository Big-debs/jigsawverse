// =====================================================
// STORAGE SERVICE
// =====================================================

import { supabase, STORAGE_BUCKETS } from '../config/supabase';

export const storageService = {
  // Upload puzzle image
  async uploadPuzzleImage(userId, file) {
    // Validate file
    if (!file.type.startsWith('image/')) {
      throw new Error('File must be an image');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new Error('File size must be less than 5MB');
    }

    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    // Upload to Supabase Storage
    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) throw error;

    // Get public URL
    const { data: { publicUrl } } = supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .getPublicUrl(filePath);

    // Save metadata to database
    const { data: imageData, error: dbError } = await supabase
      .from('images')
      .insert({
        uploaded_by: userId,
        file_name: file.name,
        storage_path: filePath,
        storage_url: publicUrl,
        category: 'custom',
        grid_size: 100,
        is_public: true
      })
      .select()
      .single();

    if (dbError) throw dbError;

    return {
      id: imageData.id,
      url: publicUrl,
      path: filePath
    };
  },

  // Delete image
  async deleteImage(imageId, storagePath) {
    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .remove([storagePath]);

    if (storageError) throw storageError;

    // Delete from database
    const { error: dbError } = await supabase
      .from('images')
      .delete()
      .eq('id', imageId);

    if (dbError) throw dbError;
  },

  // Get user's uploaded images
  async getUserImages(userId) {
    const { data, error } = await supabase
      .from('images')
      .select('*')
      .eq('uploaded_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  },

  // Get public images
  async getPublicImages(category = null, limit = 20) {
    let query = supabase
      .from('images')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  },

  // Get image URL from storage path
  getImageUrl(path) {
    const { data } = supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .getPublicUrl(path);

    return data.publicUrl;
  },

  // Upload avatar
  async uploadAvatar(userId, file) {
    const fileExt = file.name.split('.').pop();
    const filePath = `${userId}/avatar.${fileExt}`;

    const { error } = await supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .upload(filePath, file, {
        cacheControl: '3600',
        upsert: true
      });

    if (error) throw error;

    const { data: urlData } = supabase.storage
      .from(STORAGE_BUCKETS.AVATARS)
      .getPublicUrl(filePath);

    return urlData.publicUrl;
  },

  // List user's images from storage
  async listUserImages(userId) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKETS.PUZZLE_IMAGES)
      .list(`${userId}/`, {
        limit: 100,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' }
      });

    if (error) throw error;
    return data;
  }
};

export default storageService;
