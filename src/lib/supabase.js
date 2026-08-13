import { createClient } from '@supabase/supabase-js';

// Safe fallbacks so the preview never crashes with "supabaseUrl is required"
// when the environment variables are not configured.
const FALLBACK_URL = 'https://placeholder.supabase.co';
const FALLBACK_KEY = 'placeholder-key';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || FALLBACK_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || FALLBACK_KEY;

// Flag the app can use to know whether we are running with a real backend.
export const isSupabaseConfigured =
  Boolean(import.meta.env.VITE_SUPABASE_URL) &&
  Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);

if (!isSupabaseConfigured) {
  console.warn(
    '[v0] Supabase env vars missing (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
      'Using placeholder values — data operations will be skipped gracefully.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
