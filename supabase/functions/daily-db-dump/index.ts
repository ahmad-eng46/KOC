// Supabase Edge Function: daily-db-dump
//
// Exports every major table as JSONL, packs them into a single .tar.gz,
// uploads to backups/db-dumps/, and prunes anything older than 30 days.
//
// Trigger: pg_cron daily at 22:00 UTC (= 03:00 Karachi). See SETUP.md.
//
// Deployment:
//   supabase functions deploy daily-db-dump --no-verify-jwt

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Tar } from 'https://deno.land/std@0.224.0/archive/tar.ts';
import { Buffer } from 'https://deno.land/std@0.224.0/io/buffer.ts';
import { gzip } from 'https://deno.land/x/compress@v0.4.5/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// All tables to dump. Global tables (no business_id) are dumped once.
const TABLES = [
  'businesses', 'users', 'user_businesses',
  'customer_categories', 'customers', 'products', 'stock_movements',
  'invoices', 'invoice_items', 'returns', 'return_items', 'payments',
  'expenses', 'investments', 'loans', 'ledger_entries',
  'sms_log', 'audit_log', 'app_settings', 'backups',
];

const RETENTION_DAYS = 30;

Deno.serve(async (_req) => {
  const startedAt = Date.now();
  try {
    const tar = new Tar();
    let totalRows = 0;

    for (const table of TABLES) {
      const { data, error } = await admin.from(table).select('*').limit(200_000);
      if (error) {
        const buf = new TextEncoder().encode(`-- error: ${error.message}\n`);
        await tar.append(`${table}.error.txt`, {
          reader: new Buffer(buf),
          contentSize: buf.length,
        });
        continue;
      }
      const rows = (data ?? []) as Record<string, any>[];
      const lines = rows.map((r) => JSON.stringify(r)).join('\n');
      const bytes = new TextEncoder().encode(lines + '\n');
      await tar.append(`${table}.jsonl`, {
        reader: new Buffer(bytes),
        contentSize: bytes.length,
      });
      totalRows += rows.length;
    }

    // Manifest
    const manifest = {
      generated_at: new Date().toISOString(),
      tables: TABLES,
      total_rows: totalRows,
    };
    const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
    await tar.append('manifest.json', {
      reader: new Buffer(manifestBytes),
      contentSize: manifestBytes.length,
    });

    // Read tar → gzip
    const tarReader = tar.getReader();
    const tarChunks: Uint8Array[] = [];
    const buff = new Uint8Array(64 * 1024);
    while (true) {
      const n = await tarReader.read(buff);
      if (n === null) break;
      tarChunks.push(buff.slice(0, n));
    }
    const tarBytes = concat(tarChunks);
    const gzBytes = gzip(tarBytes);

    const stamp = new Date().toISOString().slice(0, 10);
    const path = `db-dumps/${stamp}-koc.tar.gz`;
    const { error: upErr } = await admin.storage
      .from('backups')
      .upload(path, gzBytes, {
        contentType: 'application/gzip',
        upsert: true, // allow re-running same day
      });
    if (upErr) throw upErr;

    // Insert backups row (no business_id — this dump is global)
    await admin.from('backups').insert({
      business_id: null,
      type: 'sql',
      status: 'done',
      storage_path: path,
      file_size_bytes: gzBytes.length,
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date().toISOString(),
    });

    // Retention prune
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const { data: oldFiles } = await admin.storage.from('backups').list('db-dumps');
    const toDelete = (oldFiles ?? [])
      .filter((f) => f.created_at && new Date(f.created_at) < cutoff)
      .map((f) => `db-dumps/${f.name}`);
    if (toDelete.length > 0) {
      await admin.storage.from('backups').remove(toDelete);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        rows: totalRows,
        size_bytes: gzBytes.length,
        path,
        pruned: toDelete.length,
        took_ms: Date.now() - startedAt,
      }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await admin.from('backups').insert({
      business_id: null,
      type: 'sql',
      status: 'failed',
      error_message: msg,
      started_at: new Date(startedAt).toISOString(),
      completed_at: new Date().toISOString(),
    });
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}
