import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder_anon_key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseConfigured(): boolean {
  return (
    !!process.env.EXPO_PUBLIC_SUPABASE_URL &&
    process.env.EXPO_PUBLIC_SUPABASE_URL !== 'https://seu-projeto.supabase.co' &&
    !!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY &&
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY !== 'sua-chave-anonima-supabase'
  );
}
