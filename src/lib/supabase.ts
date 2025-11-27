import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Public client using anon key (respects RLS)
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

// Admin client using service role key (bypasses RLS)
// Only use for background jobs and admin operations
let adminClient: SupabaseClient | null = null;

export function getAdminClient(): SupabaseClient {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for admin operations');
  }
  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return adminClient;
}

// Create authenticated client for a specific user's JWT
export function createAuthenticatedClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
