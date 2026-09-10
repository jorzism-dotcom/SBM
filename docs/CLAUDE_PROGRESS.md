# CLAUDE_PROGRESS.md — Phase / checklist / status (SPEC §161, §182)

> Format is fixed by SPEC §182: `PHASE | STATUS | FILES_CHANGED | TESTS_RUN | TEST_RESULT | MIGRATION | ROLLBACK | RISKS | NEXT_COMMAND`.
> Never marked PASS without evidence; evidence links below. Newest row on top (repo convention, same as `SQLITE_MIGRATION_LOG.md`).
> Status vocabulary: `PASS` (all acceptance criteria of that phase verified) · `PARTIAL` · `BLOCKED-ADR` · `NOT_STARTED`.

---

| PHASE | STATUS | FILES_CHANGED | TESTS_RUN | TEST_RESULT | MIGRATION | ROLLBACK | RISKS | NEXT_COMMAND |
|---|---|---|---|---|---|---|---|---|
| **Concurrent: SQLite Phase ৩ step ৬** (`SQLITE_MIGRATION_LOG.md` entry ১২৭ — not a SPEC phase; owns the same files) | **PARTIAL** (shadow-verify only — **no display value changed**; cutover still gated on real-device parity) | `src/db/DataStore.js` (+3 exports: `getTopProductRevenueByDateRange`, `getTopCustomerTotalsByDateRange`, `getLastActivityDateKey`), `src/App.jsx` (new `useTxnTotalsShadowVerify()` hook + call, `AnalyticsSection_` parity effect, `Dashboard` auto-carry parity check, 1 import line), `NEW tests/datastore-analytics-parity-tests.mjs`, `package.json` (`scripts.test` only), `SQLITE_MIGRATION_LOG.md`, `docs/CLAUDE_PROGRESS.md`, `docs/DATA_MODEL.md`+`docs/PHASE_0_AUDIT.md`+`docs/ADR/ADR-0004` (table-name corrections: `invoiceItems`/`cashLogs`/`purchaseOrders`/`stockMovements`/`supplierPayments`, no `suppliers` table) · **no** `package-lock.json` change, **no** schema/write-path change | `npm test`; `node tests/datastore-analytics-parity-tests.mjs`; `npm run lint` (repo + App.jsx-only vs `git show HEAD:src/App.jsx`); `npm run typecheck`; `npm run build`; `npm run test:golden-master`; `npm run test:fuzz` | **GREEN**: 17/17 suites, 262/262 cases (was 16/251 — +11 new) · lint **0 errors** / 577 warnings, App.jsx-only **562 = baseline 562** (net-zero new warnings) · typecheck clean · `vite build` ✓ 8.76 s · golden-master ok · fuzz all properties ok (1000 runs each) | **none required** — 3 read-only SQL aggregates over existing hot columns; `invoiceItems.product_id` / `invoices.staff_id` deliberately NOT added yet (that is the next blocked step) | `git revert` of the entry ১২৭ commit removes every shadow block + all 3 helpers; no user-visible behaviour to roll back because JS remains the displayed source | Real-device parity data does not exist yet — correctness on Android SQLite is asserted by tests only. 2 of the 3 instrumented sites are expected to warn (documented JS/SQL semantic deltas: self-use lines absent from `invoiceItems`, discount allocation, `date_key` vs `createdAt`); `todayBaki` warnings would indicate a genuine bug. Also recorded here: 2 audit corrections to entry ১২৪ — `ViewerDashboardScreen`'s `todayBaki` copy cannot be converted (no `businessType` binding, entry ৫৯/৬০ precedent) and `analyticsProductIds`/`pnlProductIds` are blocked on a missing `product_id` column | `npm test && npm run lint` then open the app on a test device with SQLite on, use Home + Analytics, and collect every `⚠️ [এন্ট্রি ১২৭]` line |

| **Phase 0 — Repository audit** (SPEC §163) | **PASS** (audit-only phase; no `src/` file touched) | `NEW docs/PHASE_0_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SYNC_CONTRACT.md`, `docs/ENTITLEMENT_CONTRACT.md`, `docs/RELEASE_CONTRACT.md`, `docs/THREAT_MODEL.md`, `docs/DR_RUNBOOK.md`, `docs/REMOTE_SUPPORT_RUNBOOK.md`, `docs/OPERATIONS_RUNBOOK.md`, `docs/SLO.md`, `docs/DECISIONS.md`, `docs/CLAUDE_PROGRESS.md`, `docs/ADR/README.md`, `docs/ADR/ADR-0001…0005.md` — **no file modified or deleted** | `npm ci`; `npm test` (16 suites); per-suite: `node tests/<name>.mjs`; `npm run lint`; `npm run typecheck`; `npm run build` | **GREEN**: 251/251 cases pass (logic 86, schema 14, integration 10, sync 24, datastore-querypage 10, inventory 22, expenses 7, kpi-extra 11, pos-browse 13, supplier-due 8, getbyids 8, getallrows 6, invoiceitems 10, distinct-lookups 11, customer-rfm 7, reorder-alerts 4) · lint **0 errors** / 577 warnings (style, non-blocking by repo policy) · typecheck clean (scope: `src/logic.js`, `src/schemas.js`) · `vite build` ✓ 6.86 s | **none required** (zero runtime/schema change) | **none required** — `git revert` of the docs commit removes 100% of the change | Documentation risk only: statements are code-measured at `e2dc756`, so line refs age; `docs/PHASE_0_AUDIT.md` records the commands so any session can re-verify | `git log -1 --stat` then `npm test` (confirm still 251/251 on your checkout) |

---

## Gate evidence (concurrent SQLite step, entry ১২৭)

```
$ npm test                      → 17/17 suites, 262 cases, 0 failures
$ npm run lint                  → 0 errors, 577 warnings (App.jsx alone: 562 = HEAD baseline 562)
$ npm run typecheck             → clean
$ npm run build                 → ✓ built in 8.76s
$ npm run test:golden-master    → ok
$ npm run test:fuzz             → all properties pass (1000 random runs each)
```

## Gate evidence (Phase 0)

SPEC §163 items 1–13 are answered one-by-one in `docs/PHASE_0_AUDIT.md` §1–§14; §163.13 ("STOP after audit if the baseline
build is broken") evaluated **false** — build is green, so Phase 1 planning is permitted.

```
$ npm ci --no-audit --no-fund   → added 488 packages in 7s
$ npm test                      → 16/16 suites, 251 cases, 0 failures
$ npm run lint                  → 0 errors, 577 warnings
$ npm run typecheck             → clean
$ npm run build                 → ✓ built in 6.86s (index 1,292.05 kB, vendor 814.24 kB, medicineDataset 1,272.67 kB)
```

## Checklist — what "done" means for the remaining phases

### Phase 0 · audit — **DONE (PASS)**
- [x] repo inventory (dirs, build targets, platforms, LOC)
- [x] local DB technology + schema measured
- [x] module/repository/service/UI inventory
- [x] direct DB calls from UI enumerated (G-02, CONFLICTING)
- [x] network calls inside business logic enumerated (G-03, CONFLICTING)
- [x] auth + device identity state
- [x] backup/restore behavior
- [x] subscription/payment code
- [x] update mechanism
- [x] test baseline recorded
- [x] build baseline recorded (green)
- [x] gap matrix
- [x] dependency-ordered backlog
- [x] SPEC §161 required docs created (13/13 + ADR proposals)

### Phase 1 · Domain modularization (SPEC §164) — **NOT_STARTED**; needs ADR-0002 approved first for P1-3
- [ ] P1-2 architecture boundary lint (non-blocking baseline → blocking)
- [ ] P1-3 pure-logic extraction into domain folders (behavior-identical commits, one per domain)
- [ ] P1-4 repository interfaces for all 9 direct `DataStore` import blocks
- [ ] P1-5 provider adapters behind interfaces (needs ADR-0003)
- [ ] domain event definitions (broker-agnostic) + dependency-cycle check
- [ ] regression gate: `npm test` + golden-master + fuzz unchanged

### Phase 2 · Local offline core (SPEC §165) — **BLOCKED-BY-ADR (ADR-0004)**
- [ ] `PRAGMA user_version` + migration CI gate
- [ ] atomic transactions on the money path (device-verified atomicity)
- [ ] SQLite `outbox` + idempotency keys
- [ ] `sequences` table replacing `INV-${length+1}`
- [ ] financial audit table (append-only)
- [ ] offline/kill-during-write test harness
- [ ] `ANALYZE` scheduled after backfills

### Phases 3–16 — **NOT_STARTED**; 3 & 4 additionally **BLOCKED-BY-ADR (ADR-0005)**
Do not begin while `docs/DECISIONS.md` shows no approved ADR for them (SPEC §158, §180, §183).

### Concurrent work stream (not part of SPEC phases, but it owns the same files)
`SQLITE_MIGRATION_LOG.md` (entry ১২৭) is mid-flight: Invoices Phase-3 step 6 — 4 of 10 Category B aggregate sites are now
shadow-verified (JS still displayed everywhere), **6 remain** and 2 of those are blocked on new hot columns (`invoiceItems.product_id`,
`invoices.staff_id`/`staff_commission_rate`) while 1 needs a business-rule decision on `date_key` vs `createdAt` bucketing.
No site has been cut over; the windowed-boot flag (entry 125) still awaits real-device smoke testing. **Any Phase 1/2 refactor must be sequenced around it**
(both touch `App.jsx` and `DataStore.js`); the migration's own safety discipline (shadow-verify first, flags off by default,
fallback paths kept) is the same discipline SPEC §160/§162 demands.

## Rules this file enforces

1. One bounded capability per step; no large rewrite (SPEC §160).
2. Focused tests after each capability, regression tests after each phase, migration/restore tests for every persistence change (SPEC §160).
3. Never mark a phase complete before its acceptance gates pass (SPEC §160, §179).
4. Never claim production-readiness without load/failure/security/restore evidence (SPEC §4/§35).
5. Every row's `FILES_CHANGED` must be exhaustive, including non-substantive churn (repo permanent rule #7) — e.g. `package-lock.json` if `npm install` ever changes it.
