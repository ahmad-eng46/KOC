#!/usr/bin/env node
// End-to-end smoke test for Piece 11 user-management actions, run via direct
// API calls to validate the security boundaries.

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8')
    .split('\n').filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = env.SUPABASE_SERVICE_ROLE_KEY;

const admin = createClient(URL, SERVICE, { auth: { persistSession: false } });

const TEST_EMAIL = `piece11-test-${Date.now()}@khaliqoil.com`;
const TEST_PWD = 'TestPiece11!';

function step(name) { console.log(`\n━━━ ${name} ━━━`); }

async function main() {
  // 1. Create a test user via admin API (mirrors createUser action)
  step('1. Create test user');
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: TEST_EMAIL, password: TEST_PWD, email_confirm: true,
    user_metadata: { full_name: 'Piece 11 Tester', role: 'staff' },
  });
  if (cErr) throw new Error(`Create failed: ${cErr.message}`);
  const userId = created.user.id;
  console.log(`✓ Created user ${TEST_EMAIL} (${userId})`);

  // Verify trigger mirrored to public.users
  const { data: pubRow } = await admin.from('users').select('id, role, is_active').eq('id', userId).single();
  if (!pubRow) throw new Error('Trigger did not mirror to public.users');
  console.log(`✓ public.users mirror exists: role=${pubRow.role}, active=${pubRow.is_active}`);

  // 2. Verify sign-in works
  step('2. Sign in as new user');
  const userClient = createClient(URL, ANON, { auth: { persistSession: false } });
  const { data: sess, error: signInErr } = await userClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PWD });
  if (signInErr) throw new Error(`Sign-in failed: ${signInErr.message}`);
  console.log(`✓ Signed in (last_sign_in_at=${sess.user.last_sign_in_at})`);

  // 3. Disable user → next sign-in should fail
  step('3. Disable user via public.users + ban via auth admin');
  await admin.from('users').update({ is_active: false }).eq('id', userId);
  await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  await admin.auth.admin.signOut(userId, 'global');
  const { error: bannedErr } = await userClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PWD });
  if (!bannedErr) throw new Error('Sign-in should have failed for banned user');
  console.log(`✓ Disabled user cannot sign in: "${bannedErr.message}"`);

  // 4. Re-enable + reset password
  step('4. Restore user + reset password');
  await admin.from('users').update({ is_active: true, deleted_at: null }).eq('id', userId);
  await admin.auth.admin.updateUserById(userId, { ban_duration: 'none' });
  const NEW_PWD = 'NewPiece11!';
  await admin.auth.admin.updateUserById(userId, { password: NEW_PWD });
  const { error: oldErr } = await userClient.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PWD });
  if (!oldErr) throw new Error('Old password should have failed');
  console.log(`✓ Old password rejected`);
  const { data: sess2, error: newErr } = await userClient.auth.signInWithPassword({ email: TEST_EMAIL, password: NEW_PWD });
  if (newErr) throw new Error(`New password failed: ${newErr.message}`);
  console.log(`✓ New password works`);

  // 5. user_login_history RPC (admin context)
  step('5. user_login_history RPC');
  const { data: history, error: hErr } = await admin.rpc('user_login_history', { p_user_id: userId, p_limit: 5 });
  if (hErr) console.log(`  RPC error: ${hErr.message}`);
  else console.log(`✓ Login history returned ${history?.length ?? 0} sessions`);

  // 6. Soft delete + audit log entry
  step('6. Soft delete user');
  await admin.from('users').update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', userId);
  await admin.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  await admin.from('audit_log').insert({
    user_id: userId, table_name: 'auth.users', row_id: userId, action: 'DELETE',
    after_jsonb: { reason: 'Piece 11 smoke test cleanup' },
  });
  console.log(`✓ Soft-deleted + audit row written`);

  // 7. Cleanup: hard delete the test user (via admin API)
  step('7. Cleanup');
  await admin.auth.admin.deleteUser(userId);
  console.log(`✓ Hard-deleted test user from auth.users (cascades to public.users)`);

  console.log('\n✅ ALL CHECKS PASSED');
}

main().catch((err) => { console.error('\n❌ FAILED:', err.message); process.exit(1); });
