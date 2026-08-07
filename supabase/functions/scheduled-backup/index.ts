// Supabase Edge Function: scheduled-backup
//
// Reads each business's backup_schedule from app_settings, generates the
// Excel workbook for businesses whose cadence has elapsed, uploads to the
// 'backups' bucket, optionally emails via Resend, and inserts a backups
// row.
//
// Trigger: pg_cron (see SETUP.md). Recommended cadence: hourly. The
// function itself decides per-business whether enough days have passed
// since the last 'done' backup.
//
// Deployment:
//   supabase functions deploy scheduled-backup --no-verify-jwt
//
// Required env (set via `supabase secrets set …`):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (auto-injected for Edge Fns)
//   RESEND_API_KEY                           (only if email destination used)
//   RESEND_FROM                              ("KOC Backup <backup@example.com>")

// deno-lint-ignore-file no-explicit-any
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ExcelJS from 'https://esm.sh/exceljs@4.4.0';

type Schedule = {
  frequency_days: number;
  destinations: string[];
  email_to?: string;
  whatsapp_to?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const RESEND_FROM = Deno.env.get('RESEND_FROM') ?? 'KOC Backup <backup@khaliqoil.com>';

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

Deno.serve(async (_req) => {
  const startedAt = Date.now();
  const results: Array<{ business_id: string; status: string; error?: string }> = [];

  // 1. Find every business with a schedule row
  const { data: settings } = await admin
    .from('app_settings')
    .select('business_id, value')
    .eq('key', 'backup_schedule');

  for (const s of settings ?? []) {
    if (!s.business_id) continue;
    let sched: Schedule;
    try { sched = JSON.parse(s.value as string); } catch { continue; }
    if (!sched || sched.frequency_days < 1) continue;

    // 2. Has enough time elapsed since the last successful backup?
    const { data: last } = await admin
      .from('backups')
      .select('completed_at')
      .eq('business_id', s.business_id)
      .eq('status', 'done')
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last?.completed_at) {
      const ageMs = Date.now() - new Date(last.completed_at).getTime();
      if (ageMs < sched.frequency_days * 24 * 60 * 60 * 1000) {
        continue;
      }
    }

    try {
      await runForBusiness(s.business_id, sched);
      results.push({ business_id: s.business_id, status: 'done' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ business_id: s.business_id, status: 'failed', error: msg });
    }
  }

  return new Response(
    JSON.stringify({
      took_ms: Date.now() - startedAt,
      processed: results.length,
      results,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});

async function runForBusiness(businessId: string, sched: Schedule) {
  // Insert a 'running' row up front
  const { data: row, error: insErr } = await admin
    .from('backups')
    .insert({
      business_id: businessId,
      type: 'excel',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (insErr || !row) throw new Error(insErr?.message ?? 'Could not record backup');

  try {
    const { data: biz } = await admin.from('businesses').select('name').eq('id', businessId).single();
    const businessName = biz?.name ?? 'KOC';

    const wb = new ExcelJS.Workbook();
    wb.creator = 'KOC Scheduled Backup';

    // Per-table dump (mirrors lib/backup/generate-excel.ts but slimmer for Deno)
    const tables: Array<[string, string, boolean]> = [
      ['Locations',       'locations',       true],
      ['Customers',       'customers',       true],
      ['Products',        'products',        true],
      ['Invoices',        'invoices',        true],
      ['Invoice Items',   'invoice_items',   false],
      ['Returns',         'returns',         true],
      ['Return Items',    'return_items',    false],
      ['Payments',        'payments',        true],
      ['Suppliers',       'suppliers',       true],
      ['Stock Purchases', 'stock_purchases', true],
      ['Supplier Payments', 'supplier_payments', true],
      ['Expenses',        'expenses',        true],
      ['Investments',     'investments',     true],
      ['Loans',           'loans',           true],
      ['Stock Movements', 'stock_movements', true],
      ['Ledger Entries',  'ledger_entries',  true],
      ['SMS Log',         'sms_log',         true],
      ['Audit Log',       'audit_log',       false],
    ];

    for (const [sheetName, table, byBiz] of tables) {
      const ws = wb.addWorksheet(sheetName);
      let q = admin.from(table).select('*').limit(50_000);
      // invoice_items / return_items have no business_id; scope via parent.
      if (table === 'invoice_items') {
        const { data: ids } = await admin.from('invoices').select('id').eq('business_id', businessId);
        const list = (ids ?? []).map((r: any) => r.id);
        if (list.length === 0) continue;
        q = admin.from(table).select('*').in('invoice_id', list).limit(50_000);
      } else if (table === 'return_items') {
        const { data: ids } = await admin.from('returns').select('id').eq('business_id', businessId);
        const list = (ids ?? []).map((r: any) => r.id);
        if (list.length === 0) continue;
        q = admin.from(table).select('*').in('return_id', list).limit(50_000);
      } else if (byBiz) {
        q = q.eq('business_id', businessId);
      }
      const { data, error } = await q;
      if (error) {
        ws.addRow(['ERROR', error.message]);
        continue;
      }
      const rows = (data ?? []) as Record<string, any>[];
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      ws.addRow(cols);
      ws.getRow(1).font = { bold: true };
      for (const r of rows) ws.addRow(cols.map((c) => coerce(r[c])));
    }

    const ab = await wb.xlsx.writeBuffer();
    const buffer = new Uint8Array(ab);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `${businessName.replace(/\s+/g, '_')}-backup-${stamp}.xlsx`;
    const path = `${businessId}/excel/${filename}`;

    const { error: upErr } = await admin.storage
      .from('backups')
      .upload(path, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: false,
      });
    if (upErr) throw upErr;

    // Email destination
    if (sched.destinations?.includes('email') && sched.email_to && RESEND_API_KEY) {
      await sendEmail(sched.email_to, businessName, filename, buffer);
    }

    await admin
      .from('backups')
      .update({
        status: 'done',
        storage_path: path,
        file_size_bytes: buffer.length,
        completed_at: new Date().toISOString(),
      })
      .eq('id', row.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await admin
      .from('backups')
      .update({ status: 'failed', error_message: message, completed_at: new Date().toISOString() })
      .eq('id', row.id);
    throw err;
  }
}

function coerce(v: unknown) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v as any;
}

async function sendEmail(to: string, businessName: string, filename: string, buf: Uint8Array) {
  const b64 = btoa(String.fromCharCode(...buf));
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: RESEND_FROM,
      to,
      subject: `KOC Backup - ${new Date().toISOString().slice(0, 10)} (${businessName})`,
      text: `Attached is the latest scheduled backup for ${businessName}.`,
      attachments: [{
        filename,
        content: b64,
        content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }],
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Resend send failed: ${r.status} ${txt}`);
  }
}
