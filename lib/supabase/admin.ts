import { createClient } from '@supabase/supabase-js';

// Guard: this module must never be imported in browser code.
// The service role key has full database access and bypasses RLS.
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase/admin.ts was imported in a browser context. ' +
    'This file is server-only. Move the import inside a server action or route handler.'
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

export const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
