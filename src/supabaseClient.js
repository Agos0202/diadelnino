import { createClient } from '@supabase/supabase-js';

const createSupabaseClient = () => {
  const supabaseUrl = (process.env.REACT_APP_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY || '').trim();

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
};

export const getSupabaseClient = () => createSupabaseClient();

export const supabase = getSupabaseClient();

export const isSupabaseConfigured = Boolean(supabase);

export const assertSupabaseConfigured = () => {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Falta configurar Supabase en .env: REACT_APP_SUPABASE_URL y REACT_APP_SUPABASE_ANON_KEY deben contener los valores reales del proyecto.');
  }

  return client;
};

export const normalizarDni = (value) => {
  return String(value ?? '')
    .replace(/\./g, '')
    .replace(/\s+/g, '')
    .replace(/-/g, '')
    .replace(/[^0-9]/g, '');
};

export const normalizarTexto = (value) => String(value ?? '').trim();
