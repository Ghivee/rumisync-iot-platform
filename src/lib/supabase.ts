import { createClient } from '@supabase/supabase-js';

// Setup untuk Vite env vars
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder_key';

if (!import.meta.env.VITE_SUPABASE_URL) {
  console.warn("⚠️  VITE_SUPABASE_URL tidak ditemukan. Supabase tidak akan bisa terhubung.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
