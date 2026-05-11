#!/usr/bin/env node
// Smoke-test the Excel backup pipeline end-to-end:
//  - sign in as admin
//  - call runBackupNow (via direct DB writes since server actions need a Next.js context)
//  - actually: just exercise the same data fetches the action does and confirm
//    the workbook builds + has the expected sheet structure.

import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';
import { readFileSync, writeFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8').split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TABLES = [
  'customers', 'products', 'invoices', 'invoice_items',
  'returns', 'return_items', 'payments', 'expenses',
  'investments', 'loans', 'stock_movements', 'ledger_entries',
  'sms_log', 'audit_log',
];

const { data: biz } = await admin.from('businesses').select('id, name').limit(1).single();
console.log(`Building backup for: ${biz.name} (${biz.id})`);

const wb = new ExcelJS.Workbook();
wb.creator = 'KOC Backup Test';

const meta = wb.addWorksheet('Meta');
meta.columns = [{ header: 'Key', key: 'k' }, { header: 'Value', key: 'v' }];
meta.addRow({ k: 'Business', v: biz.name });
meta.addRow({ k: 'Generated At', v: new Date().toISOString() });

let totalRows = 0;
for (const t of TABLES) {
  const ws = wb.addWorksheet(t);
  let q = admin.from(t).select('*').limit(50_000);
  if (t === 'invoice_items') {
    const { data: ids } = await admin.from('invoices').select('id').eq('business_id', biz.id);
    const list = (ids ?? []).map((r) => r.id);
    if (list.length === 0) { console.log(`  ${t}: 0 rows (no invoices)`); continue; }
    q = admin.from(t).select('*').in('invoice_id', list).limit(50_000);
  } else if (t === 'return_items') {
    const { data: ids } = await admin.from('returns').select('id').eq('business_id', biz.id);
    const list = (ids ?? []).map((r) => r.id);
    if (list.length === 0) { console.log(`  ${t}: 0 rows (no returns)`); continue; }
    q = admin.from(t).select('*').in('return_id', list).limit(50_000);
  } else if (t !== 'audit_log') {
    q = q.eq('business_id', biz.id);
  }
  const { data, error } = await q;
  if (error) { console.log(`  ${t}: ERROR ${error.message}`); continue; }
  const rows = data || [];
  totalRows += rows.length;
  if (rows.length === 0) {
    console.log(`  ${t}: 0 rows`);
    continue;
  }
  const cols = Object.keys(rows[0]);
  ws.addRow(cols).font = { bold: true };
  for (const r of rows) ws.addRow(cols.map((c) => {
    const v = r[c];
    if (v == null) return '';
    if (typeof v === 'object') return JSON.stringify(v);
    return v;
  }));
  console.log(`  ${t}: ${rows.length} rows, ${cols.length} cols`);
}

const ab = await wb.xlsx.writeBuffer();
const buf = Buffer.from(ab);
const filename = `/tmp/koc-backup-test.xlsx`;
writeFileSync(filename, buf);

console.log(`\n✅ Built ${(buf.length / 1024).toFixed(1)} KB workbook with ${TABLES.length + 1} sheets, ${totalRows} total rows`);
console.log(`   Saved to ${filename}`);
