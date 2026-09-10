# ADR-0004 — SQLite transactions, outbox ordering & `user_version`

**Status: PROPOSED (awaiting owner approval)** · Date opened: 2026-09-10 · Source: Phase 0 audit §11 (Phase 2 rows), SPEC §165/§162.4/§162.5

## Problem
SPEC §165 requires atomic local transactions, a durable outbox written before the business transaction completes,
idempotency identities, and schema versioning. Measured at `e2dc756`:

1. **No SQLite transaction usage at all.** `grep -E "BEGIN IMMEDIATE|executeTransaction|isTransactionActive"` over `src/db/` → 0 hits.
   Writes go through single statements: `db.run(...)` (`DataStore.js:596-597`, `upsertMany` batching via `db.executeSet(set)` at `DataStore.js:249`, `266`).
   An invoice + its `invoice_items` + stock decrements + `txns` rows are therefore **not** atomic: a crash between statements can leave a
   half-applied sale. Only IndexedDB access uses `db.transaction(...)` (App.jsx:4409-5607).
2. **Queue serialization interaction.** All `db.query()` **and** (since migration log entry 120) `db.run()/db.execute()` calls are routed through a
   JS-side priority queue (`DataStore.js:308-315`, `_pumpDbQueryQueue`, `_enqueueDbQuery`) because the Capacitor native bridge is fully serial.
   Any explicit long-lived transaction interacts with that queue: while a transaction is open, other writes either fail or must be enqueued —
   this must be designed, not discovered in production.
3. **No schema version number.** Migrations are `PRAGMA table_info()`-guarded additive `ALTER`s plus `_migration_state` for data backfill;
   `createConnection(database, encrypted, mode, version, readonly)` exposes a `version`, and the code never uses it for versioning.
   No down-migration, no CI migration gate.
4. **Outbox is not in SQLite.** Durable pre-send queue is IndexedDB (`SyncOutbox`), while the SQLite-side `events` table has a `synced` flag but no
   consumer, no retry columns, no idempotency key. SPEC §162.5 wants outbox records durable before local transaction completion, i.e. in the *same* atomic unit.
5. **Invoice numbering is not idempotent**: `INV-${invoices.length + 1}` over the in-memory array — the repo's own audit calls this the single
   riskiest site (money-record sequencing; two tabs/devices can collide).

## Constraints
- `@capacitor-community/sqlite` v6 API surface present in `node_modules` (verified in `dist/esm/definitions.d.ts`): `open`, `run`, `query`,
  `executeSet` (batch, `capSQLiteSetOptions`), `isTransactionActive`. **Atomicity of `executeSet` must be proven by a device test, not assumed**
  (the plugin wraps provider-side; Android behavior has repeatedly differed from `node:sqlite` — the repo says sandbox cannot reproduce it).
- `node:sqlite` is what tests use today (`tests/helpers/capacitor-sqlite-shim.mjs`) — good for logic, **not** proof for native behavior.
- Perf budget: queue-wait on cold boot is the app's known weak spot (3.9–4.3 s background aggregate blocking interactive reads; log entries 122/123).
  A new transaction must not serialize more work than the statements it replaces.
- Never remove the IndexedDB path (repo rule #1); never roll out to all shops at once (rule #6); `ANALYZE` after bulk writes (log entry 2/4).
- SPEC §158: no redesign of the repository pattern/outbox concept itself — this ADR is about *how to satisfy it*, not replace it.

## Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | Keep per-statement writes; rely on app-level retry + dual-write reconciliation | zero risk now | leaves half-applied money states possible; violates SPEC §165.1/§162.5 |
| B | **`executeSet` per business transaction** (one batch call for invoice + items + stock + txn) + device test proving atomicity; outbox insert appended as the last statement in the same set | minimal new surface, one bridge round-trip instead of N (also faster), reuses existing primitive already used at `DataStore.js:249` | depends on plugin-level transaction semantics → must be verified on device; failure semantics are all-or-nothing per set, so error handling must be centralized |
| C | Explicit `BEGIN IMMEDIATE … COMMIT/ROLLBACK` via `db.run()` with a queue-aware "transaction owner" lock in `DataStore.js` | full control, visible in SQL, standard SQLite semantics | needs a queue policy (block other writers for the transaction's duration) → new head-of-line risk; more code in the most sensitive file |
| D | B for writes, C only where a read-modify-write must be serialized (invoice numbering, stock decrement), plus `PRAGMA user_version` (and `createConnection(..., version)`) for schema versioning with a CI migration gate | incremental, each piece independently rollback-able, covers both §165.1 and §165.7 | two mechanisms to keep consistent; needs a clear rule for when each is used |

## Selected option (recommended, not approved)
**D**, landed in this order, each as its own bounded capability (SPEC §160):
1. `PRAGMA user_version` + `schema_migrations` list + CI gate (pure additive; no write-path change).
2. `executeSet`-based transaction for **one** flow first (return/void restock, read-only-observable), device-verified, flag-gated.
3. Extend to invoice creation; outbox row inside the same set (SQLite `outbox` table replacing IndexedDB `SyncOutbox` semantics — see ADR-0002).
4. `BEGIN IMMEDIATE` + `sequences` table for invoice numbering (never `array.length`).

## Consequences
- New SQLite tables (`outbox`, `sequences`) — additive only, `ALTER`/`CREATE … IF NOT EXISTS`, so an interrupted migration is resumable and old APKs keep working (SPEC §146.7).
- Queue policy in `DataStore.js` must expose an explicit "interactive transaction" tag so boot latency (S-2) does not regress.
- Failure UX changes: a failed sale transaction must surface an error instead of silently saving (compare `applyPurchaseBatch` precedent, migration log entry 89).
- `reconcileStore()` and `getDualWriteFailureStats()` stay as the drift safety net until the SQLite path is proven (SPEC §35 definition-of-done).
- Until approved: no transaction code, no new tables (SPEC §181 — this is exactly the "security/data-sensitive ambiguity → STOP" case).

## Migration / rollback
- Migration: additive DDL only; `user_version` bump per step; **no destructive step** (SPEC §4 "never perform a destructive migration before backup and rollback validation"); `ANALYZE` after any backfill.
- Rollback: per-step flag off → previous per-statement path remains intact (dual-path discipline, repo rule #1). A `user_version` that is too high is handled by ignoring unknown versions (read-only degrade), never by deleting tables.
- Data repair tool: existing "re-run store migration" path (`migrateStoreResumable`) plus `reconcileStore()` to prove zero drift after rollback.

## Test plan
- **Atomicity on device**: kill the app mid-`executeSet` (invoice with 20 lines), restart, assert all-or-nothing; same for `BEGIN IMMEDIATE` numbering under two simultaneous tabs.
- Sandbox parity: `node:sqlite` suites asserting before/after row-count invariants (`stock` deltas == sum of movements; invoice ↔ invoice_items ↔ txns totals equal) — extend the 16 existing suites.
- Property test (`fast-check`, existing): random sale/return/void sequences → ledger invariants hold, no negative drift.
- Perf gate: S-2/S-4 budgets must not regress (DiagLog `queue-wait` p95 before/after); `executeSet` for N statements must beat N×`run` on device.
- Fuzz + golden-master (already CI-blocking) stay green.
- Docs: this ADR's result recorded in `docs/CLAUDE_PROGRESS.md` with `MIGRATION`/`ROLLBACK` columns filled (SPEC §182).

## Approval status
| Field | Value |
|---|---|
| Proposed by | Claude (Phase 0 audit) |
| Approved by | — |
