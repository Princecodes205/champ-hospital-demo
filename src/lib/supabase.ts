import { createClient } from '@supabase/supabase-js';
import { env } from './env';

export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

export type Profile = {
  id: string;
  username: string;
  full_name: string;
  role: 'owner' | 'doctor' | 'nurse';
  is_active: boolean;
  created_at: string;
};
