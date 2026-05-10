#!/usr/bin/env node
/**
 * Live test for create_invoice_atomic RPC.
 *
 * Signs in as the seeded admin, picks the first business / customer / 2 products,
 * builds a valid payload, calls the RPC, then re-reads the invoice + items +
 * stock_movements + payment + ledger to verify atomicity.
 *
 * Run:
 *   node scripts/test-create-invoice.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, '..', '.env.local');
const env = Object.fromEntries(
  readFileSync(envPath, 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
  process.exit(1);
}

// Working admin (created via Auth Admin API; the seeded users cannot sign in
// — see migrations 0026/0028. owner@khaliqoil.com is linked to all businesses
// in 0029_link_working_admin_and_cleanup.sql).
const ADMIN_EMAIL = 'owner@khaliqoil.com';
const ADMIN_PASSWORD = 'KocTest2024!';

function pkr(paisa) {
  return `Rs. ${(paisa / 100).toLocaleString('en-PK', { minimumFractionDigits: 2 })}`;
}

function step(name) {
  console.log(`\n━━━ ${name} ━━━`);
}

async function main() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1. Sign in as admin
  step('1. Sign in as admin');
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
  });
  if (authErr) throw new Error(`Auth failed: ${authErr.message}`);
  console.log(`✓ Signed in as ${authData.user.email} (uid=${authData.user.id})`);

  // 2. Fetch one business the admin belongs to
  step('2. Pick a business');
  const { data: businesses, error: bizErr } = await supabase
    .from('businesses')
    .select('id, name')
    .limit(1);
  if (bizErr) throw new Error(`Business fetch failed: ${bizErr.message}`);
  if (!businesses?.length) throw new Error('No businesses accessible to admin');
  const business = businesses[0];
  console.log(`✓ Using business: ${business.name} (${business.id})`);

  // 3. Pick a customer in that business
  step('3. Pick a customer');
  const { data: customers, error: custErr } = await supabase
    .from('customers')
    .select('id, name, opening_balance_paisa')
    .eq('business_id', business.id)
    .is('deleted_at', null)
    .limit(1);
  if (custErr) throw new Error(`Customer fetch failed: ${custErr.message}`);
  if (!customers?.length) throw new Error('No customers found');
  const customer = customers[0];
  console.log(`✓ Customer: ${customer.name} (${customer.id})`);

  // 4. Pick 2 products in that business (use products_for_role; admin sees purchase price)
  step('4. Pick 2 products');
  const { data: products, error: prodErr } = await supabase
    .from('products_for_role')
    .select('id, name, unit, sale_price_paisa, purchase_price_paisa')
    .eq('business_id', business.id)
    .eq('is_active', true)
    .limit(2);
  if (prodErr) throw new Error(`Product fetch failed: ${prodErr.message}`);
  if ((products?.length ?? 0) < 2) throw new Error('Need at least 2 active products');
  const [p1, p2] = products;
  console.log(`✓ Product 1: ${p1.name} @ ${pkr(p1.sale_price_paisa)} (cost: ${pkr(p1.purchase_price_paisa ?? 0)})`);
  console.log(`✓ Product 2: ${p2.name} @ ${pkr(p2.sale_price_paisa)} (cost: ${pkr(p2.purchase_price_paisa ?? 0)})`);

  // 5. Build payload
  step('5. Build invoice payload');
  // line 1: 3 units of p1
  // line 2: 2 units of p2 with Rs. 50 line discount (5000 paisa)
  // invoice-level: 10% discount
  // payment received: half of total

  const item1Qty = 3;
  const item2Qty = 2;
  const item2LineDiscount = 5_000; // 50 PKR

  const line1 = Math.round(item1Qty * p1.sale_price_paisa);
  const line2 = Math.max(0, Math.round(item2Qty * p2.sale_price_paisa) - item2LineDiscount);
  const subtotal = line1 + line2;
  const invoiceDiscount = Math.round((subtotal * 10) / 100);
  const total = Math.max(0, subtotal - invoiceDiscount);
  const paid = Math.floor(total / 2);

  console.log(`  line 1: ${item1Qty} × ${pkr(p1.sale_price_paisa)} = ${pkr(line1)}`);
  console.log(`  line 2: ${item2Qty} × ${pkr(p2.sale_price_paisa)} - ${pkr(item2LineDiscount)} = ${pkr(line2)}`);
  console.log(`  subtotal:    ${pkr(subtotal)}`);
  console.log(`  10% disc:    -${pkr(invoiceDiscount)}`);
  console.log(`  total:       ${pkr(total)}`);
  console.log(`  paid (50%):  ${pkr(paid)}`);

  const rpcInput = {
    business_id: business.id,
    customer_id: customer.id,
    issue_date: null,
    due_date: null,
    discount_paisa: invoiceDiscount,
    notes: 'Test invoice from scripts/test-create-invoice.mjs',
    items: [
      {
        product_id: p1.id,
        quantity: item1Qty,
        unit_price_paisa: p1.sale_price_paisa,
        discount_paisa: 0,
        line_total_paisa: line1,
      },
      {
        product_id: p2.id,
        quantity: item2Qty,
        unit_price_paisa: p2.sale_price_paisa,
        discount_paisa: item2LineDiscount,
        line_total_paisa: line2,
      },
    ],
    payment: {
      amount_paisa: paid,
      method: 'cash',
      reference: 'TEST-RUN',
      payment_date: null,
    },
  };

  // 6. Call RPC
  step('6. Call create_invoice_atomic');
  const { data: invoiceId, error: rpcErr } = await supabase.rpc('create_invoice_atomic', {
    p_input: rpcInput,
  });
  if (rpcErr) throw new Error(`RPC failed: ${rpcErr.message}`);
  console.log(`✓ Invoice created: ${invoiceId}`);

  // 7. Read it back
  step('7. Verify invoice row');
  const { data: inv } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single();
  console.log(`  number:        ${inv.invoice_number}`);
  console.log(`  status:        ${inv.status}`);
  console.log(`  subtotal:      ${pkr(inv.subtotal_paisa)}`);
  console.log(`  discount:      ${pkr(inv.discount_paisa)}`);
  console.log(`  total:         ${pkr(inv.total_paisa)}`);
  console.log(`  paid:          ${pkr(inv.paid_paisa)}`);
  console.log(`  expected status: ${paid >= total ? 'paid' : paid > 0 ? 'partially_paid' : 'issued'}`);
  if (inv.subtotal_paisa !== subtotal) throw new Error(`subtotal mismatch: ${inv.subtotal_paisa} vs ${subtotal}`);
  if (inv.total_paisa !== total) throw new Error(`total mismatch`);
  if (inv.paid_paisa !== paid) throw new Error(`paid mismatch`);
  console.log('✓ Invoice totals match');

  // 8. invoice_items
  step('8. Verify invoice_items (with purchase_price snapshot)');
  const { data: items } = await supabase
    .from('invoice_items')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at');
  if (items.length !== 2) throw new Error(`expected 2 items, got ${items.length}`);
  for (const it of items) {
    console.log(
      `  product=${it.product_id.slice(0, 8)}…  qty=${it.quantity}  rate=${pkr(it.unit_price_paisa)}  cost_snap=${pkr(it.purchase_price_at_sale_paisa)}  line=${pkr(it.line_total_paisa)}`,
    );
  }
  if (items[0].purchase_price_at_sale_paisa !== (p1.purchase_price_paisa ?? 0))
    throw new Error('item 1 cost snapshot mismatch');
  if (items[1].purchase_price_at_sale_paisa !== (p2.purchase_price_paisa ?? 0))
    throw new Error('item 2 cost snapshot mismatch');
  console.log('✓ purchase_price_at_sale_paisa snapshots match products');

  // 9. stock_movements
  step('9. Verify stock_movements (type=out)');
  const { data: moves } = await supabase
    .from('stock_movements')
    .select('product_id, type, quantity, note')
    .eq('invoice_id', invoiceId);
  if (moves.length !== 2) throw new Error(`expected 2 stock movements, got ${moves.length}`);
  for (const m of moves) {
    if (m.type !== 'out') throw new Error(`movement type was ${m.type}, expected 'out'`);
    console.log(`  ${m.product_id.slice(0, 8)}…  type=${m.type}  qty=${m.quantity}  note="${m.note}"`);
  }
  console.log('✓ stock_movements correct');

  // 10. payment
  step('10. Verify payment');
  const { data: pays } = await supabase
    .from('payments')
    .select('amount_paisa, method, reference')
    .eq('invoice_id', invoiceId);
  if (pays.length !== 1) throw new Error(`expected 1 payment, got ${pays.length}`);
  console.log(`  amount=${pkr(pays[0].amount_paisa)}  method=${pays[0].method}  ref=${pays[0].reference}`);
  if (pays[0].amount_paisa !== paid) throw new Error('payment amount mismatch');
  console.log('✓ payment correct');

  // 11. ledger_entries
  step('11. Verify ledger_entries (debit + credit fired by triggers)');
  const { data: ledger } = await supabase
    .from('ledger_entries')
    .select('ref_type, ref_id, debit_paisa, credit_paisa, balance_paisa, description')
    .eq('customer_id', customer.id)
    .order('created_at', { ascending: false })
    .limit(2);
  if (ledger.length < 2) throw new Error(`expected 2 ledger rows, got ${ledger.length}`);
  // Most recent first → payment credit, then invoice debit
  console.log(`  [most recent] ${ledger[0].ref_type}  debit=${pkr(ledger[0].debit_paisa)}  credit=${pkr(ledger[0].credit_paisa)}  balance=${pkr(ledger[0].balance_paisa)}  "${ledger[0].description}"`);
  console.log(`                ${ledger[1].ref_type}  debit=${pkr(ledger[1].debit_paisa)}  credit=${pkr(ledger[1].credit_paisa)}  balance=${pkr(ledger[1].balance_paisa)}  "${ledger[1].description}"`);

  const debitRow = ledger.find((l) => l.ref_type === 'invoice');
  const creditRow = ledger.find((l) => l.ref_type === 'payment');
  if (!debitRow) throw new Error('ledger debit row missing');
  if (!creditRow) throw new Error('ledger credit row missing');
  if (debitRow.debit_paisa !== total) throw new Error(`ledger debit mismatch: ${debitRow.debit_paisa} vs ${total}`);
  if (creditRow.credit_paisa !== paid) throw new Error(`ledger credit mismatch`);
  console.log('✓ ledger entries correctly created by triggers');

  console.log('\n✅ ALL CHECKS PASSED');
  console.log(`   Invoice ${inv.invoice_number} (${invoiceId}) is live in the database.\n`);
}

main().catch((err) => {
  console.error('\n❌ TEST FAILED:', err.message);
  process.exit(1);
});
