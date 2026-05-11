# Legacy Migration Report

- **Mode:** DRY RUN
- **Generated:** 2026-05-11T07:58:09.429Z
- **Source folder:** `migration_data/`
- **Legacy business UUID:** `5a358265-2585-4d51-80f8-d76a0940c55d`

## Row counts (source → target)

| Source CSV | Source rows | Planned | Would-insert |
|---|---:|---:|---:|
| Customer_Table.csv | 10 | 10 | 10 |
| Product.csv | 10 | 10 | 10 |
| Stock_Table.csv | 12 | 12 | 12 |
| Invoice_Table.csv | 10 | 9 | 9 |
| Invoice_Table1.csv | 18 | 16 | 16 |
| Cash_Table.csv | 10 | 10 | 10 |
| Expense_Table.csv | 8 | 8 | 8 |
| Investment_Table.csv | 3 | 3 | 3 |
| Loan_Table.csv | 3 | 3 | 3 |
| Login.csv | 4 | 4 | 4 |

## Sum receivables

- **Legacy total:**   Rs. 68,445.50
- **Imported total:** Rs. 68,445.50
- **Diff:**           Rs. 0.00 ✅

## Top 10 customers by balance (legacy vs imported)

| Legacy ID | Name | Legacy balance | Imported balance | Match |
|---|---|---:|---:|:---:|
| 10 | Jan Mohammad | Rs. 18,900.25 | Rs. 18,900.25 | ✅ |
| 1 | Ahmad Traders | Rs. 15,000.00 | Rs. 15,000.00 | ✅ |
| 5 | Eastern Oil Mart | Rs. 12,345.75 | Rs. 12,345.75 | ✅ |
| 7 | Gulshan Petroleum | Rs. 11,000.00 | Rs. 11,000.00 | ✅ |
| 4 | Dawood Cigarette Shop | Rs. 8,000.00 | Rs. 8,000.00 | ✅ |
| 8 | Habib Khan Trading | Rs. 3,700.00 | Rs. 3,700.00 | ✅ |
| 3 | Chaudhry Khan & Sons | -Rs. 500.50 | -Rs. 500.50 | ✅ |
| 2 | Bilal Brothers | Rs. 0.00 | Rs. 0.00 | ✅ |
| 6 | Faisal General Store | Rs. 0.00 | Rs. 0.00 | ✅ |
| 9 | Imran & Co | Rs. 0.00 | Rs. 0.00 | ✅ |

## Skipped rows (3)

| Table | Legacy ID | Reason |
|---|---|---|
| invoices | 7 | Unknown CustomerID 99 |
| invoice_items | 12 | Unknown InvoiceID 7 |
| invoice_items | 18 | Unknown InvoiceID 99 |

## Anomalies (2)

| Table | Legacy ID | Note |
|---|---|---|
| customers | 3 | Negative opening balance -Rs. 2,500.50 |
| products | 7 | Purchase price missing — defaulted to 0 |

## Auto-generated user passwords

These users had no legacy password and were assigned a temp password. Share securely with the user and have them rotate on first login.

| Email | Temp password |
|---|---|
| staff2@legacy.local | `Tmp-6f80f2a9df94!` |
