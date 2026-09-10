# DATA_MODEL.md — Entities, Ownership & Relationships

> Source of truth order (SPEC §159): 1) current production behavior + existing data, 2) current code/tests,
> 3) SPEC v10, 4) approved ADRs, 5) vendor docs. This file **documents what exists**; target-state rows are
> labelled `TARGET` and inherit their requirement from the cited SPEC section.

## 1. Tenancy / ownership model (measured)

- **Tenant key** = `businessType` (601 references in `App.jsx`) — one app install can hold multiple business types (pharmacy, vet, …).
- **Isolation mechanism today**: *physical* — one SQLite DB file per `businessType` + IndexedDB key prefix `LK(SK.<collection>)` per business type. There is **no `shop_id` column** on any table (SPEC §5 wants every tenant-owned record to carry `shop_id`: `TARGET`, Phase 4/P4-x).
- **Device key** = `deviceId`, generated on first run and persisted under `sbm-license-device-id` (App.jsx:123/136-140); stamped into `feature_flags.device_id`, `events.device_id`.
- **Actor key** = local owner PIN session (no user accounts yet → SPEC §169 `TARGET`).

## 2. Persistence layers

| Layer | Store | Contents | Status |
|---|---|---|---|
| L1 boot state | React state + Zustand `useAppStore` (`productsById` write-through Map) | full arrays for `CRITICAL_KEYS` at boot; boot-lazy/never-load flags shrink this progressively | live |
| L2 legacy | IndexedDB JSON blob per collection (`hg_*` DBs, `SyncOutbox` in `hg_sync_outbox`) | full-record blobs = authoritative fallback for every read/write path | live, **must not be removed** (repo permanent rule #1) |
| L3 new | SQLite via `@capacitor-community/sqlite` (`src/db/DataStore.js`) | hot columns + `data` JSON per row, FTS5, indexes, `events`, `feature_flags`, `_migration_state` | live, dual-written, read-path cutover in flight (`SQLITE_MIGRATION_LOG.md` entry 126) |
| L4 cloud | *none* | `TARGET` PostgreSQL (SPEC §167) | absent |

## 3. SQLite tables (`src/db/schema.sql`: 14 tables, 48 indexes, 2 FTS5, 0 triggers)

| Table | Cols (measured) | Purpose / hot columns + `data` JSON |
|---|---|---|
| `products` | 20 | name, `name_norm`(dup lookup), barcode, stock, cost_price, price, demand_type, min_stock_alert, nearest_expiry_date, supplier_key, supplier_due_key/raw, product_type, category, dosage_form, `browse_rank` |
| `customers` | 8 | name, mobile, total_baki…, `updated_at` |
| `invoices` | 9 | date_key, status(`active`/`voided`), pay_type, total, paid, due, customer_id, staff/id fields |
| `invoiceItems` | — | per-line invoice items (product_sales / reorder windows; `date_key` indexed) — fixes the `inv.date` "M/D/YYYY" vs `date_key` comparison bug class |
| `expenses` | 6 | today/month expense aggregates |
| `cashLogs` | — | cash drawer entries |
| `purchaseOrders` | — | PE/receiving |
| *(no `suppliers` table — supplier master is IndexedDB-only)* | — | see §4 |
| `txns` | 9 | joma/baki ledger (`customer_id`, `type`, `amount`) |
| `returns` | 9 | return/void restock events |
| `stockMovements` | — | stock ledger (FEFO/batch adjustments) |
| `events` | 8 | local change/audit log: `id, entity_type, entity_id, op('upsert'\|'delete'\|'reconcile_mismatch'), payload, device_id, ts, synced` |
| `feature_flags` | 4 | `key, value, updated_at, device_id` — flag mirror of localStorage prefs |
| `_migration_state` | 7 | resumable backfill: `store_name, total_source_rows, migrated_rows, last_migrated_id, status(pending\|in_progress\|verified\|done), started_at, completed_at` |

**Row pattern**: typed hot columns for query predicates + one `data` JSON column carrying the whole record. Consequence: `reconcileStore()` can bit-compare SQLite `data` vs `JSON.stringify(record)`; adding a filterable field = new hot column (additive `ALTER`, guarded by `PRAGMA table_info()`).

`HOT_FIELDS` (the dual-written set, `DataStore.js:888`) = `products, customers, invoices, expenses, cashLogs, purchaseOrders, txns, returns, stockMovements, supplierPayments` + `invoiceItems` written by its own `upsertInvoiceItems()` path — everything else is IndexedDB-only.

**Deliberate deviations from the repo's older comments**: `schema.sql` has **0 triggers** (older migration-plan text mentioned a "sync trigger" — removed/never landed), and **no foreign keys / no `PRAGMA foreign_keys`** → integrity is enforced in application code (`TARGET`: SPEC §168 "stock-ledger integrity", §165 atomic transactions).

## 4. Collection registry (the 20 business collections)

`src/sync.js::FSS_COLLECTIONS` + `BACKUP_FIELDS`: `customers, products, invoices, txns, smsLog, suppliers, purchaseOrders, stockMovements, cashLogs, paymentInvoices, expenses, returns, auditLogs, quotations, supplierPayments, deletedProducts, deletedCustomers, users, staffLedger, serialQueue`.

This registry is the **de-facto entity list** and is used to (a) pick backup fields (`pickBackupFields`), (b) diff backups (`diffBackupFields`), (c) label UI (`BACKUP_FIELD_LABELS_BN`). Collections with no SQLite table yet (`smsLog, quotations, deletedProducts, deletedCustomers, users, staffLedger, serialQueue, paymentInvoices, supplierPayments, auditLogs`) are IndexedDB-only → `TARGET` for Phase 2/5.

Shape guards exist for money-critical fields: `src/schemas.js` (zod, `finiteNum()`/`finiteNumRequired()`), **soft/shadow mode by design** — `validateRecord()` warns but does not block, because 500+ live record shapes are unverified (documented in that file's header).

## 5. Identity & ordering contract

| Concern | Current | Target (SPEC) |
|---|---|---|
| Record id | string id generated at creation, used as PK | unchanged, plus `idempotency_key` per mutation (§166) |
| Mutation ordering | `updated_at` ms → `effectiveTs()` in `sync.js` | server monotonic sequence + client epoch (outbox `seq`) |
| Invoice numbering | `INV-${invoices.length + 1}` (in-memory array length) | SQLite `sequences` table per tenant, `INSERT … RETURNING` inside the invoice transaction (**highest-risk item in the plan**, repo log entry 124) |
| Deletion | tombstone id sets (`deletedProducts`, `deletedCustomers`) | tombstones in outbox + server-side soft delete (§53 conflict matrix) |
| Time zone | **fixed GMT+6** via `_bdParts()` (`dateKeyFromTs()` in `DataStore.js`, `bdDateKey()` in the benchmark script) — synced with `App.jsx::_dateKeyOf()` after a UTC-date bug was caught (migration log entry 3) | keep; assert in a contract test |

## 6. Financial & inventory ledger principle (SPEC §51)

`TARGET`, not yet true: an invoice line's money effect and its stock effect must be produced by the same atomic write, journaled (stockMovements + txns + invoiceItems), with finalized records immutable — corrections only by reversal/void (the app already models void+return, but without a database-level uniqueness/append-only guarantee).

## 7. Data lifecycle (SPEC §55)

Current: no retention rule for `events`, no archival for SQLite tables (invoices get a 6-month *boot window* via `getAllRowsWindowed`, while full history stays in the DB and in `InvoiceArchive`), no deletion/erasure workflow for tenant exit → `TARGET` Phase 8/§148 (governance) and Phase 2 (retention job).
