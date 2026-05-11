'use server';

import { revalidatePath } from 'next/cache';
import { adminClient } from '@/lib/supabase/admin';
import { getActiveBusinessId } from '@/lib/business';
import { getSession } from '@/lib/auth/session';
import { generateExcelBackup } from '@/lib/backup/generate-excel';
import {
  backupScheduleSchema, type BackupSchedule, DEFAULT_SCHEDULE,
} from '@/lib/backup/schedule';
import { setSetting, getSetting } from '@/lib/settings';

type ManualBackupResult =
  | { ok: true; base64: string; filename: string; size_bytes: number; backup_id: string }
  | { ok: false; error: string };

const SCHEDULE_KEY = 'backup_schedule';

/**
 * Generate a fresh Excel backup, upload to Storage, and record a backups row.
 * Returns base64 + filename so the client can also download it immediately.
 */
export async function runBackupNow(): Promise<ManualBackupResult> {
  const session = await getSession();
  if (!session || session.role !== 'admin') {
    return { ok: false, error: 'Admin only.' };
  }

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  // 1. Insert a "running" backup row first so we have a stable id
  const { data: row, error: insErr } = await adminClient
    .from('backups')
    .insert({
      business_id: businessId,
      type: 'excel',
      status: 'running',
      triggered_by: session.id,
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insErr || !row) return { ok: false, error: insErr?.message ?? 'Could not record backup.' };

  try {
    // 2. Generate workbook
    const gen = await generateExcelBackup();

    // 3. Upload to Storage
    const path = `${businessId}/excel/${gen.filename}`;
    const { error: upErr } = await adminClient.storage
      .from('backups')
      .upload(path, gen.buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });
    if (upErr) throw upErr;

    // 4. Update backup row to done
    await adminClient
      .from('backups')
      .update({
        status: 'done',
        storage_path: path,
        file_size_bytes: gen.size_bytes,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    revalidatePath('/settings/backup');
    return {
      ok: true,
      base64: gen.buffer.toString('base64'),
      filename: gen.filename,
      size_bytes: gen.size_bytes,
      backup_id: row.id,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await adminClient
      .from('backups')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    return { ok: false, error: message };
  }
}

export async function getBackupSchedule(): Promise<BackupSchedule> {
  const raw = await getSetting<string>(SCHEDULE_KEY, '');
  if (!raw) return DEFAULT_SCHEDULE;
  try {
    const parsed = JSON.parse(raw);
    const verified = backupScheduleSchema.safeParse(parsed);
    return verified.success ? (verified.data as BackupSchedule) : DEFAULT_SCHEDULE;
  } catch {
    return DEFAULT_SCHEDULE;
  }
}

export async function saveBackupSchedule(input: BackupSchedule): Promise<{ ok: boolean; error?: string }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { ok: false, error: 'Admin only.' };
  const parsed = backupScheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const r = await setSetting(SCHEDULE_KEY, JSON.stringify(parsed.data));
  if (!r.ok) return r;
  revalidatePath('/settings/backup');
  return { ok: true };
}

// ─────────────────────────────────────────────
// Backup history (last 10) — admin only
// ─────────────────────────────────────────────
export type BackupHistoryRow = {
  id: string;
  type: 'excel' | 'sql' | 'pdf';
  status: 'pending' | 'running' | 'done' | 'failed';
  storage_path: string | null;
  file_size_bytes: number | null;
  triggered_by_email: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
};

export async function listRecentBackups(): Promise<{ ok: true; data: BackupHistoryRow[] } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { ok: false, error: 'Admin only.' };

  const businessId = await getActiveBusinessId().catch(() => null);
  if (!businessId) return { ok: false, error: 'No active business.' };

  const { data, error } = await adminClient
    .from('backups')
    .select('id, type, status, storage_path, file_size_bytes, started_at, completed_at, error_message, created_at, users(email)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return { ok: false, error: error.message };

  type RawUser = { email: string };
  type Raw = Omit<BackupHistoryRow, 'triggered_by_email'> & { users: RawUser | RawUser[] | null };
  const rows = (data as unknown as Raw[]).map((r) => {
    const u = Array.isArray(r.users) ? r.users[0] : r.users;
    return {
      ...r,
      file_size_bytes: r.file_size_bytes != null ? Number(r.file_size_bytes) : null,
      triggered_by_email: u?.email ?? null,
    } as BackupHistoryRow;
  });
  return { ok: true, data: rows };
}

export async function getBackupSignedUrl(backupId: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await getSession();
  if (!session || session.role !== 'admin') return { ok: false, error: 'Admin only.' };

  const { data: row } = await adminClient
    .from('backups')
    .select('storage_path')
    .eq('id', backupId)
    .single();
  if (!row?.storage_path) return { ok: false, error: 'Backup file not available.' };

  const { data, error } = await adminClient.storage
    .from('backups')
    .createSignedUrl(row.storage_path, 60 * 60); // 1 hour
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not sign URL.' };
  return { ok: true, url: data.signedUrl };
}
