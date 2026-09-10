# ARCHITECTURE.md — Final Architecture & Invariants

> Owner-facing TL;DR (bn): এই ফাইলটা স্থাপত্যের **চুক্তি** — কী বদলাবে না, কোন লেয়ার কী করবে, আর
> SPEC v10-এর §162 invariants। বর্তমান অবস্থার মাপা তথ্য `docs/PHASE_0_AUDIT.md`-এ।
> Status: **CURRENT + TARGET CONTRACT**. No architectural decision in this file is invented by Claude;
> every rule is either quoted from SPEC v10 or measured from code at `e2dc756`.

## 1. Mandate (SPEC §0–§1)

- Build an **architecture, not a one-time server setup**; every major capability gets a stable contract so the implementation technology can change later.
- Preserve the existing **Capacitor + SQLite offline-first** foundation. Cloud is an **extension**, never a rewrite.
- Capacity target: ≥ **500 shops / 2,500 devices**, stress assumption 2,000 invoices/shop/day → 1,000,000 invoices/day (engineering target, not a sizing promise).
- No vendor-specific DB API, no Firebase-specific limits, no single-VPS dependency.

## 2. Layering contract (SPEC §1)

```
Mobile SQLite  ──►  Local Domain / Transaction layer  ──►  Outbox  ──►  Sync protocol
        │                                                                  │
        └── UI (React) never crosses this line ◄───────────────────────────┘
                                                     ▼
                       API / application layer  ──►  Domain services  ──►  PostgreSQL
                                                            │
                                        Change log ──► Event bus ──► Realtime gateway ──► other devices
```

Rules that bind every layer (SPEC §1, §4, §158, §162):

1. Business logic must not depend directly on HTTP, WebSocket, Redis or PostgreSQL.
2. Database access is only reachable through repository/data-access interfaces.
3. Sync is a **protocol with versioned contracts**, not scattered API calls.
4. Events are versioned and backward compatible.
5. Reports are isolated from transactional write paths.
6. External providers are adapters behind interfaces.
7. Never trust client-supplied `shop_id` for authorization; tenant context is derived server-side.
8. Never acknowledge a cloud mutation before durable commit; never make realtime the only sync path.
9. Never blind last-write-wins for **financial** operations (see `docs/SYNC_CONTRACT.md` §4).
10. No unbounded report query; no index without evidence; no breaking API/schema change without a compatibility period; no destructive migration before backup + rollback validation.
11. UI owns no business rules; POS business logic owns no network calls.

## 3. Module map — target (SPEC §164), with current owners in parentheses

| Bounded domain | Owns | Current location |
|---|---|---|
| POS / Sales | invoice creation, void, return, cart, self-use | `App.jsx` `SmartInvoiceBuilder`, `InvoiceVoidModal`, `logic.js` |
| Catalog | products, batches/FEFO, pricing, barcode | `App.jsx` `Products`, `DataStore.js` product helpers |
| Inventory | stock ledger, adjustments, reorder, risk/expiry | `DataStore.js` `getInventoryList/getRiskProducts/getExpiryCandidates/getReorderSalesRows` |
| Purchase | purchase orders, receiving, weighted cost | `App.jsx` `savePE`, `applyPurchaseBatch`, `getPurchaseOrderTotals` |
| Supplier | supplier ledger, dues, payments | `getSupplierDueRows`, `getSupplierSummary`, `getProductsBySupplierKey` |
| Customer / CRM | customers, baki, RFM/LTV, SMS | `getCustomerBakiSummary`, `getCustomerByMobile`, `getBakiCustomers`, `getCustomerRfm…` |
| Finance / Cash | cash logs, txns, expenses | `getCashLogTotal`, `getTxnTotals`, `getReturnsTotals`, `expenses` table |
| Accounting | period close/reopen, reversal, P&L | **absent** (only `ProfitStatementCard` view) → SPEC §168 |
| Tax / VAT | configurable rules | **absent** |
| Employee / Staff | staff ledger, commission | `getStaffStats` (App.jsx:36542) |
| Branch / Warehouse | multi-location | **absent** (`businessType` is the only partition today) |
| Reporting / BI | dashboards, charts, exports | `useKpiStats`, `AnalyticsSection_`, `repData`, `worker.js` |
| Identity | users, session, RBAC | local PIN only → SPEC §169 |
| Subscription | plans, entitlement, grace | offline license code → SPEC §170, `docs/ENTITLEMENT_CONTRACT.md` |
| Device | registration, trust, revoke | `deviceId` string only |
| Sync | outbox, push/pull, conflicts | `SyncOutbox` (disabled sink), `sync.js::mergeCollection` → `docs/SYNC_CONTRACT.md` |
| Backup / DR | export, encrypt, restore, drill | App.jsx backup paths → `docs/DR_RUNBOOK.md` |
| Remote support | diagnostics, consent, repair actions | `DiagLog.js` + dev panel → `docs/REMOTE_SUPPORT_RUNBOOK.md` |
| Release / OTA | version, compat, rollout, rollback | GitHub Actions + releases proxy → `docs/RELEASE_CONTRACT.md` |

**Deployment rule (SPEC §164):** module boundaries must make a *future* microservice extraction possible, but deployment stays modular (one app, one API, one DB cluster) until an approved ADR changes it.

## 4. Technology baseline (SPEC §2 — fixed, not selectable)

Mobile: existing Capacitor app + SQLite (retained, local data model extended where practical) · Backend: TypeScript + Node.js, strict TS · DB: PostgreSQL (authoritative cloud store) · Pooling: PgBouncer-equivalent · Realtime: WebSocket gateway (**notification only**) · Events: Redis Pub/Sub behind an `EventBus` interface (Kafka/NATS adapter later) · Cache: Redis behind interface, activated only where measured · Jobs: dedicated worker process, durable job strategy (never in-memory queues for business-critical work) · Objects: S3-compatible storage for backups/exports · LB: managed or self-hosted per stage · Observability: OpenTelemetry-compatible · Containers: Docker; orchestration optional until measured need · CI/CD: lint, type-check, tests, migration checks, build, deploy.

## 5. Architecture invariants — NEVER BREAK (SPEC §162, verbatim list)

1. Offline POS remains functional with network unavailable.
2. SQLite/local persistence remains authoritative for local transactional work.
3. Cloud synchronization is asynchronous and idempotent.
4. Every syncable mutation has an idempotency identity.
5. Outbox records are durable before local business transaction completion.
6. Server-side tenant isolation is mandatory.
7. Financial records are auditable; finalized records are not silently mutated.
8. UI does not own business rules.
9. Repository layer separates persistence from domain/application logic.
10. External providers are accessed through adapters/interfaces.
11. Subscription enforcement cannot delete or corrupt business data.
12. Remote support cannot execute arbitrary SQL/shell/code.
13. OTA updates are signed and progressively deployed.
14. All privileged operations are auditable.

**Enforcement status at `e2dc756`** — `✔` = holds and evidenced, `~` = holds only because the cloud/support path is disabled, `✘` = not enforced:
`1 ✔` `2 ✔` `3 ~` `4 ✘` `5 ~` `6 ~` (device-local only) `7 ~` `8 ✘` `9 ~` `10 ✘` `11 ✔` `12 ✔` (no remote execution exists at all) `13 ~` (APK signing exists, no OTA/staged rollout) `14 ✘`.
Nothing enforces 4, 5, 8, 9, 10, 12 by test; Phase 1 (P1-2 fitness gate) + Phase 2 (P2-1/2) make them machine-checkable. Phase 1 P1-2 (architecture fitness test) and Phase 2 P2-1/P2-2 exist to make 4, 5, 9, 10 machine-checkable rather than convention.

## 6. Prohibited anti-patterns (SPEC §43, §158)

No redesign of the architecture, no replacement of SQLite/PostgreSQL/repository pattern/transactional outbox/sync engine/tenant model/module boundaries without an approved ADR. No Kubernetes/Kafka/service-mesh/microservices/multi-region in the initial runtime "because available". No removal of offline capability for a cloud feature. No silent invention of an unspecified business rule → STOP and file an ADR (SPEC §181). No rewrite of working code for style. No production-readiness claim before gates pass (SPEC §179).

## 7. Fitness functions (SPEC §66) — to be automated in Phase 1

| Check | Tool | Gate |
|---|---|---|
| UI → persistence boundary (no `src/db/*` import from components) | eslint `no-restricted-imports` + baseline allow-file | blocks build |
| No `fetch(` outside `src/adapters/` | eslint `no-restricted-globals` scoped rule | blocks build |
| No secret literals in `src/` | grep gate in CI (`LICENSE_SECRET`, `api_key`, `Bearer `) | blocks build |
| Domain cycle-freedom | dependency-cruiser (proposed, Phase 1) | blocks build |
| Migration is additive + reversible | schema diff test | blocks build |
| Restore round-trip | `tests/*` backup→restore equivalence | blocks build |
| Benchmark ceiling (FTS p95, keyset page p95, boot patch) | `scripts/generate-synthetic-dataset.mjs` in scheduled job | warns now, blocks at P1-5 |
