# PHASE 0 — Repository Audit (SPEC §160 + §163)

> **Plan source**: `SBM_ULTIMATE_MASTER_PLAN_v10_CLAUDE_EXECUTION_SPEC_NO_DECISIONS.docx`
> (§158–184, "v10 — CLAUDE EXECUTION SPECIFICATION"), read from commit `e2dc756` (added to `main`).
> **Method constraint honored**: §160 "Do not start a large rewrite" / §163 "Build the app without modifying
> behavior" → **this phase changes zero `src/` files**. Only `docs/` were created.
> **Audited commit**: `e2dc75621f594794f5a65825c5ab58af5175cbdc` (session branch `arena/01a089dd-sbm` fast-forwarded to `main` @ `e2dc756`).
> All numbers below were measured with the commands shown — they are not estimates.

---

## 1. Source directories & build targets (§163.1)

| Path | Contents | Role |
|---|---|---|
| `src/` | 48,009 LOC total | Single-page React app + local data layer |
| `src/App.jsx` | **43,680 lines** | Entire UI **and** all business logic (85 top-level `function X()` components, 233 component-ish declarations) |
| `src/db/` | `DataStore.js` 2,426 · `schema.sql` 477 · `DiagLog.js` 93 · `Repository.js` 56 | SQLite access layer (Capacitor `@capacitor-community/sqlite`), schema, diagnostics, partial repository layer |
| `src/logic.js` 674 / `src/sync.js` 188 / `src/schemas.js` 115 / `src/worker.js` 291 | pure modules | Formulas, backup/sync pure logic, zod shape guards, Web Worker for dashboard math |
| `src/medicineDataset.json` 1.35 MB · `src/vetMedicineDataset.json` 55 KB | static data | Bundled drug catalogs (built as separate chunks) |
| `capacitor-backup-service/` | Android plugin (Java, 5 classes) | Custom native plugin: foreground keep-alive, exact alarms, `WorkManager` 15-min safety-net backup |
| `netlify-site/` | `api/gh-releases.js`, `api/refresh-token.js`, `license-generator.html`, `oauth.html`, vendored firebasejs | Vercel serverless: GitHub-releases proxy + Google OAuth `client_secret` holder; offline license generator |
| `scripts/generate-synthetic-dataset.mjs` | 16 KB | Synthetic data + benchmark harness (`node:sqlite`, same `schema.sql`) |
| `tests/` | 16 suites + `helpers/` | Node-run suites, `node:sqlite` shim for the Capacitor plugin |
| `.github/workflows/` | `build-apk.yml` (424 lines), `generate-keystore.yml` | Only build targets: **Android APK** (debug/release, signed) — CI generates `android/` with `npx cap add android` |

**Build targets (measured)**: `npm run dev` (vite), `npm run build` (vite → `dist/`), `npm run preview`, `npx cap add android` + `cap sync` (CI-only, no `android/` dir in repo), APK signing via `generate-keystore.yml`.
**No iOS target, no web deployment target, no backend build target exists in this repository.**

## 2. App platforms (§163.2)

Capacitor 6 Android-only (`appId com.protik.sbm`, `webDir dist`, `androidScheme https`). Native plugins in `package.json`: sqlite, barcode-scanning(mlkit), filesystem, share, preferences, push, local-notifications, browser, app, haptics, status-bar, navigation-bar, bluetooth-serial (thermal printer), file-opener, google-auth (`@codetrix-studio/capacitor-google-auth 3.4.0-rc.4`), plus the local `capacitor-backup-service`.

## 3. Local database technology & schema (§163.3)

**Dual store, mid-migration** (this is the repo's own live program — see `SQLITE_MIGRATION_LOG.md` entry 126):

- **Authoritative at boot today**: IndexedDB JSON blob per key (`LK(SK.<collection>)`) — still the fallback path for every collection.
- **New layer**: SQLite, **one DB file per `businessType`** (tenant isolation by file).
- `src/db/schema.sql` measured: **14 `CREATE TABLE`**, **48 indexes**, **2 FTS5 virtual tables**, **0 triggers**.
  Tables: `products`(20 cols) `customers`(8) `invoices`(9) `invoice_items` `expenses`(6) `cash_logs` `purchase_orders` `suppliers` `txns`(9) `returns`(9) `stock_movements` `events`(8) `feature_flags`(4) `_migration_state`(7).
  Index distribution: products 17 · invoices 8 · customers 7 · txns 3 · events 3 · returns 2 · purchase_orders 2 · invoice_items 2 · (supplier_payments/stock_movements/expenses/cash_logs) 1 each.
  Hot columns + a `data` JSON column per row (so full records round-trip without column-by-column modeling).
- Migration: additive `PRAGMA table_info()` guarded `ALTER TABLE` only; **no `PRAGMA user_version` schema-version number**; resumable data backfill via `_migration_state` (`migrateStoreResumable()`); `ANALYZE` available (`analyzeDb()`), documented as mandatory after bulk backfill.
- `src/db/DataStore.js` exports **65** functions (typed query helpers + **7 boot/feature flags exposed as 14 getter/setter functions** (`isSqliteEnabled`, `isProductsBootLazyEnabled`, `isProductsNeverLoadEnabled`, `isCustomersBootLazyEnabled`, `isCustomersNeverLoadEnabled`, `isInvoicesWindowedBootEnabled`, `isPosOndemandCartEnabled` + setters, plus `mirrorFlagToSqlite()`) + `reconcileStore()` content-level drift checker).

## 4. Repositories / services / use-cases / controllers / UI modules (§163.4)

| Spec concept | Actual state |
|---|---|
| UI modules | 85 screen-ish components in **one file** (`src/App.jsx`); no directory-per-domain, no route layer, no module manifest |
| Application services / use-cases | **absent as a layer**; logic lives in `src/logic.js` (674 LOC pure formulas) and inside React components |
| Repositories | `src/db/DataStore.js` (65 fns, SQLite) + `src/db/Repository.js` (56 LOC, 3 functions) — `Repository.js`'s own header says it is a Strangler-Fig scaffold still reading plain arrays |
| Controllers / API layer | none (no HTTP server in repo) |
| State layer | Zustand `useAppStore` (+ `subscribeWithSelector`) with `productsById` write-through Map — this is the de-facto application-layer cache |
| Background compute | `src/worker.js` Web Worker (dashboard math) |

## 5. Direct database calls from UI (§163.5) — violates SPEC §158 rule "Do not directly access database tables from UI code"

`src/App.jsx` **imports the persistence layer directly in 9 import statements / 23 reference lines**, e.g. `dsAggregate`, `dsQueryPage`, `upsertMany`, `remove as dsRemove`, `getAllRowsWindowed`, `getSupplierDueRows`, `getInventoryList`, `getDistinctCategories`, `hybridSearchCandidateIds`, `getDb as dsGetDb`, `reconcileStore`, plus `getCustomerById` from `Repository.js`. There is no interface/boundary between React components and SQL.

## 6. Network calls inside business logic (§163.6) — violates SPEC §158 rule "Do not put cloud/network calls inside POS business logic"

`grep -c "fetch(" src/App.jsx` = **24** call sites. Categories found by reading each site:

| Where | What | Note |
|---|---|---|
| `App.jsx:6535`, `6566`, `6605`, `11032` | `POST https://api.anthropic.com/v1/messages` (SMS text generation, AI page) | **Browser-direct** LLM call with `x-api-key` supplied from Settings UI and header `anthropic-dangerous-direct-browser-access: true` |
| `App.jsx:6685`, `6694`, `6700`, `6706` | Twilio REST, `sslwireless.com`, `bulksmsbd.net` | SMS provider credentials interpolated into URL/headers inside business logic |
| `App.jsx:42741`, `42899`, `42990`–`43224` | `googleapis.com/oauth2`, `GDRIVE_REFRESH_ENDPOINT` (`sbm-admin-mocha.vercel.app/api/refresh-token`), `googleapis.com/drive/v3/files` | Google Drive backup + token refresh through the Vercel proxy |
| `App.jsx:5879`–`5923` | generic `fetch(url, GET/DELETE/POST)` | backup/sync helper path |
| `src/sync.js`, `src/worker.js`, `src/logic.js`, `src/db/DataStore.js` | **0** `fetch(` | pure layers are clean — the coupling is only in `App.jsx` |

## 7. Authentication & device identity (§163.7)

- **No** registration/login/session/token-lifecycle, no MFA, no RBAC, no server-side tenant check (SPEC §169, §170 gaps).
- Local gate: `OFFLINE_OWNER_PIN_KEY = "sbm-offline-owner-pin-hash"` — 6-digit PIN, hashed `SHA-256("sbm_owner_" + pin)` (App.jsx:19349), stored in `@capacitor/preferences`; `hashPassword()`/`verifyPassword()` at 6482/6500; admin-PIN-reset code derivation `LICENSE_SECRET:ADMINPIN:<deviceId>:<yearMonth>` (App.jsx:181).
- **Device identity exists**: `LICENSE_DEVICE_ID_KEY = "sbm-license-device-id"` (App.jsx:123,136) — random id generated on first run, then used as the anchor for licensing and stamped into `feature_flags.device_id` and `events.device_id`.
- **Tenant identity**: `businessType` (601 references) is the tenant key; enforced by *file-per-tenant* SQLite naming + IndexedDB key prefix, not by a row-level `shop_id` column.
- Google OAuth exists only for the **Drive backup** scope (`drive.file`), via the plugin + Vercel token proxy — not as app login.

## 8. Backup / restore behavior (§163.8)

- Auto backup every **5 minutes** (`DRIVE_BACKUP_INTERVAL_MIN = 5`, App.jsx:3868) to Google Drive; `buildBackupData()` reads full collections from SQLite (`getAllRows`) — the boot-independence fix from migration-log entry 75/76; manual export path `buildManualBackupData()`.
- Payload field registry is centralized: `FSS_COLLECTIONS` (20 collections) + `BACKUP_FIELDS` (+`users`) in `src/sync.js`; `pickBackupFields()` strips unknown fields; `diffBackupFields()` compares.
- Integrity: `validateBackup()` (checksum + field-order recompute, App.jsx:14475/5037) runs before applying a restore; empty-backup guard exists; `beginRestoreGuard(ms=5000)` / `computeRestoreGuardMs()` suppress writes during restore.
- Encryption: **AES-256-GCM via Web Crypto** (`CRYPTO_MAGIC = "SBM-ENC-V1"`, App.jsx:7725-7759), user-supplied passphrase.
- Native assist: `capacitor-backup-service` (foreground keep-alive, exact alarm per-interval, `WorkManager` periodic 15-min safety net, battery-optimization exemption, boot-completed receiver).
- Missing vs SPEC §171: retention policy, server-side/PITR, tenant export contract, restore-to-staging, restore approval+audit, declared RPO/RTO, automated restore drills. **`android/` + Drive-only storage means no off-device redundancy beyond the user's own Drive.**

## 9. Subscription / payment code (§163.9)

- Offline monthly license: `computeLicenseCode(deviceId, yearMonth)` = 6 digits from `SHA-256(LICENSE_SECRET + ":" + deviceId + ":" + yearMonth)` (secret literal deliberately not reproduced in docs) (App.jsx:150-170), current **and previous** month accepted (grace); `LICENSE_UNTIL_KEY`, `LICENSE_MAX_SEEN_KEY` (clock-rollback guard), `LICENSE_HISTORY_KEY`.
- **The signing secret is hard-coded in `src/App.jsx:130`** — SPEC §158 explicitly forbids hard-coding subscription plans/secrets; SPEC §4 "Never put … credentials in the app".
- Payment: manual bank-transfer style — `BKASH_NUMBER = "01611062402"` (App.jsx:3378) shown to the shopkeeper; `PAY_METHODS` list (32797) is a *label* list for invoices, not a billing integration. No `paymentInvoices` provider integration (the collection name is legacy from the Firestore era).
- Missing vs SPEC §170: Product/Plan/Price/Entitlement/Subscription/Invoice/Payment/Credit/Refund/Usage models, immutable billing ledger, trial/grace/past-due/suspended/cancelled/expired/reactivated state machine, proration, provider adapter, verified idempotent webhooks, dunning, billing portal, signed offline entitlement token.

## 10. Update mechanism (§163.10)

- Version identity is **build-time injected**: `APP_VERSION` / `APP_VERSION_CODE` from `import.meta.env.VITE_APP_VERSION`, computed automatically per GitHub Actions run (`build-apk.yml` "Compute semantic app version"), so the user never bumps versions manually (App.jsx:3817-3840).
- Release discovery is **out-of-app**: `netlify-site/api/gh-releases.js` proxies `api.github.com` for an admin site (5-min cache, optional `GH_TOKEN`), `netlify.toml` + Vercel app `sbm-admin-mocha`.
- In-app there is a hidden diagnostics entry (`handleVersionTap`, App.jsx:37680) — **no** download-and-install flow, no signature verification step in the app, no staged/canary rollout state, no minimum-supported-version enforcement, no rollback mechanism.
- `OFFLINE_MODE` (App.jsx:101, `VITE_OFFLINE_MODE`, resolved in CI, default `true`) is the build-time switch that strips the whole cloud/Firebase code path from production bundles.

## 11. Existing tests — baseline recorded (§163.11)

`npm test` at `e2dc756`, node v22.22.3, **16/16 suites green — 251 cases, 0 failures**:

| Suite | Cases | Result |
|---|---|---|
| `logic-tests` | 86 | PASS |
| `schema-tests` | 14 | PASS |
| `integration-tests` | 10 | PASS |
| `sync-tests` (merge/LWW/tombstone) | 24 | PASS |
| `datastore-querypage` / `inventory` / `expenses` / `kpi-extra` / `pos-browse` | 10 / 22 / 7 / 11 / 13 | PASS |
| `datastore-supplier-due` / `getbyids` / `getallrows` / `invoiceitems` / `distinct-lookups` / `customer-rfm` / `reorder-alerts` | 8 / 8 / 6 / 10 / 11 / 7 / 4 | PASS |

Adjacent gates (not in `npm test`, run separately): `npm run lint` → **0 errors, 577 warnings** (repo deliberately warns-only for style in the legacy file); `npm run typecheck` → **clean** (`jsconfig.json` covers `src/logic.js` + `src/schemas.js` only, per CI comment); `npm run test:golden-master` and `npm run test:fuzz` exist (CI blocks on fuzz), `test:mutation` = Stryker on `src/logic.js` (informational).

## 12. Build the app without modifying behavior (§163.12) — **baseline build is GREEN**

```
$ npm ci --no-audit --no-fund      → added 488 packages in 7s
$ npm run build                    → ✓ built in 6.86s
  dist/assets/index-*.js            1,292.05 kB │ gzip 338.93 kB
  dist/assets/vendor-*.js             814.24 kB │ gzip 222.15 kB
  dist/assets/medicineDataset-*.js  1,272.67 kB │ gzip 179.15 kB
  (vite: chunks > 1000 kB warning — no chunking config yet)
```

→ SPEC §163 "STOP after audit if the baseline build is broken" **does not apply**; Phase 0 may be recorded PASS and Phase 1 may be planned.

---

## 13. Gap matrix vs SPEC v10 (classification: IMPLEMENTED / PARTIAL / MISSING / CONFLICTING)

### Cross-cutting rules (SPEC §4, §158, §162)

| # | Requirement | Status | Evidence / reason |
|---|---|---|---|
| G-01 | Repository/data-access interface behind domain | PARTIAL | `DataStore.js` (65 fns) exists, but there is no interface per aggregate; `Repository.js` = 3 fns, still array-backed |
| G-02 | UI must not access DB directly | **CONFLICTING** | §5 above — 9 direct `DataStore.js` import blocks inside `App.jsx` |
| G-03 | No network calls inside business logic | **CONFLICTING** | §6 above — 24 `fetch(` sites in `App.jsx`, incl. provider credentials in URL |
| G-04 | No hard-coded secrets / plans / flags in app | **CONFLICTING** | `LICENSE_SECRET` (App.jsx:130), `BKASH_NUMBER` (3378), Anthropic key + SMS gateway keys handled client-side |
| G-05 | Offline POS works with no network | IMPLEMENTED | Production build is `OFFLINE_MODE=true`; cloud path stripped; local SQLite/IndexedDB only |
| G-06 | Local persistence authoritative for transactional work | IMPLEMENTED | SQLite dual-write + `productsById` hydrate; IndexedDB still primary at boot (migration in flight) |
| G-07 | Server-side tenant isolation | MISSING | No server. Isolation today is device-local (DB file per `businessType`) |
| G-08 | Financial records auditable, no silent mutation of finalized records | PARTIAL | `auditLogs` collection (memory/IndexedDB) + `InvoiceVoidModal` void flow, `status='voided'` filters; **no SQLite audit table**, no append-only guarantee |
| G-09 | Reports isolated from transactional write path | PARTIAL | `src/worker.js` offloads dashboard math; but reports read the same in-memory state + same SQLite DB, no read replica/derived store |
| G-10 | External providers behind adapters | PARTIAL | SMS gateways = 3 hand-written branches in one function (6685-6706); Drive = OAuth proxy; no adapter interface, no provider registry |
| G-11 | Kubernetes/Kafka/mesh/multi-region not forced into runtime | IMPLEMENTED | None present, none needed |
| G-12 | Firebase fully deleted (repo's own permanent rule #5) | PARTIAL | 239 firebase/Firestore mentions remain in `App.jsx`; `FSS.init()` always `false`, 26 `useFSSCollection(…)` call sites neutered — dead code kept as history, `netlify-site/vendor/firebasejs/10.12.0` still shipped in repo |

### Phase 1 — Domain modularization (§164)

| Requirement | Status | Note |
|---|---|---|
| Bounded domains (19 named) | MISSING | one 43,680-line file; 6 pure modules exist but are not domain-scoped |
| Domain models + application services | PARTIAL | `logic.js` formulas + `schemas.js` zod shapes ≈ an anemic model layer |
| Repository interfaces | PARTIAL | `Repository.js` scaffold |
| External-provider interfaces | MISSING | see G-10 |
| Domain events (broker-agnostic) | PARTIAL | SQLite `events` table (`entity_type/entity_id/op/payload/device_id/ts/synced`) = change-log, not a domain-event contract |
| Module dependency rules + automated architecture tests | MISSING | `eslint.config.js` has only react-hooks/react-refresh; no import-boundary rule, no `dependency-cruiser`/madge gate |
| Deployment stays modular | IMPLEMENTED | single APK, single web bundle |

### Phase 2 — Local offline core (§165)

| Requirement | Status | Note |
|---|---|---|
| Atomic local transactions via SQLite | **MISSING** | `grep -E "BEGIN IMMEDIATE|executeSet|transaction("` in `src/db/` → 0 hits; only IndexedDB `db.transaction(...)` (App.jsx:4409-5607). Multi-statement writes (invoice + stock + txn) are currently non-atomic in SQLite |
| Durable outbox | PARTIAL | `SyncOutbox` (IndexedDB `hg_sync_outbox`, put/remove/getAll, flush on boot/resume/online/heartbeat) exists, but its sink `FSS.setRecord()` is a disabled no-op → nothing drains; SQLite side has `events.synced` flag only |
| Client/device/tenant identifiers | PARTIAL | `deviceId` ✔, `businessType` ✔, **no per-record `shop_id`/tenant column**, no per-device write epoch for conflict ordering beyond `updated_at` |
| Local sequence / idempotency identifiers | PARTIAL | record `id` + `updated_at` (`effectiveTs`); invoice numbering is `INV-${invoices.length + 1}` (in-memory) = **not idempotent, not concurrency-safe** (flagged in repo log entry 124 as the single riskiest site) |
| Crash recovery | PARTIAL | immediate `save()` on critical mutations, `_migration_state` resume, boot-dash snapshot (`_bootDash`), restore-guard |
| Schema versioning & migrations | PARTIAL | additive `ALTER` via `PRAGMA table_info()` guard + resumable backfill; **no `user_version`**, no down-migration, no migration gate in CI |
| Local audit records for privileged/financial ops | PARTIAL | `auditLogs` is not in SQLite; cannot be replayed/verified after storage reset |
| Offline test mode + proof POS works w/o network | PARTIAL | `OFFLINE_MODE` build flag ✔; **no automated offline/device test harness** (SPEC §165 last two lines) |

### Phase 3 — Sync engine (§166) · Phase 4 — Cloud platform (§167)

| Requirement | Status |
|---|---|
| Push/pull protocol, versioned contract | MISSING (cloud deleted; only `performMasterSync()` Drive-blob merge remains as the multi-device mechanism) |
| Idempotency keys | MISSING |
| Bounded-backoff retry | PARTIAL (outbox re-flush, no backoff/jitter policy) |
| Cursor / checkpoint sync | MISSING for sync (exists for backfill: `_migration_state.last_migrated_id`) |
| Deterministic conflict resolution | PARTIAL→IMPLEMENTED-for-local-scope: `mergeCollection()` LWW by `effectiveTs` + tombstone protection, 24 passing tests (`tests/sync-tests.mjs`). SPEC §4 forbids blind LWW **for financial operations** → currently LWW is also applied to money records = **CONFLICTING** with §4 for invoice/txn collections |
| Reconciliation | IMPLEMENTED (local-scope): `reconcileStore()` bit-compares row `data` JSON vs in-memory array → `missingInSql/extraInSql/mismatched/matched` |
| Duplicate-invoice prevention | MISSING |
| Partial-failure recovery | PARTIAL (`dualWriteSqlite()` advances `prevMapRef` only on success + failure counter — repo log entry "সংশোধন ২") |
| Mass-reconnect handling | MISSING (no server) |
| Backlog / lag / conflict metrics | MISSING (`DiagLog.js` timing only; 400 entries ring buffer) |
| PostgreSQL, migrations, measured indexes, API layer, object storage, cache, jobs, realtime gateway, health endpoints, rate limiting, correlation IDs | **MISSING for all** — no backend exists in this repository (only 2 Vercel functions) |

### Phases 5–16 (§168–179)

| Area | Status | Note |
|---|---|---|
| §168 full ERP modules (19 domains) | PARTIAL | POS/Catalog/Inventory/Purchase/Supplier/CRM/Finance/Cash/Expenses/Returns/Staff/Quotations/Audit/AI exist **as UI**, not as modules with permission + audit + sync semantics; Accounting period close/reopen + controlled reversal **MISSING**; RBAC **MISSING** |
| §169 identity & device mgmt | PARTIAL | device id ✔; login/session/MFA/RBAC/revoke/lost-device/clock-skew/min-version **MISSING** (clock-rollback guard exists only for license) |
| §170 subscription & billing | PARTIAL | offline month-code license + grace + max-seen guard ✔; all billing models/ledger/webhooks/dunning/portal **MISSING**; secret hard-coded = **CONFLICTING** |
| §171 backup/restore/DR | PARTIAL | see §8 |
| §172 remote operations / admin plane | PARTIAL | in-app dev panel (DiagLog, reconcile button, flag toggles) + Vercel admin site (releases, license generator behind a password field) — **no** admin authn/z, no consent-based diagnostics upload, no typed repair actions, no operator audit |
| §173 OTA / release mgmt | MISSING | see §10 |
| §174 control-plane activation | PARTIAL | strong flag substrate: 21 getter/setter pairs + SQLite `feature_flags` table + `mirrorFlagToSqlite()`; **no** entitlement→flag mapping, no capability switchboard, no activation transaction |
| §175 observability | PARTIAL | console + DiagLog + `logErrorToCentral`; no OpenTelemetry, no metrics/trace/export, no alerts |
| §176 security hardening | PARTIAL | AES-GCM backups, SHA-256 PIN hashing, `webContentsDebuggingEnabled:false` ✔; `cleartext:true` + `allowMixedContent:true` ✘; no keystore-backed key storage; see `docs/THREAT_MODEL.md` |
| §177 performance / load | PARTIAL | benchmark harness exists (1,00,000 products / 10,000 customers / 1,00,00,000 invoices; FTS 15.7 ms, LIKE 7.4 ms, mobile lookup 0.9 ms, keyset pagination ~913× faster than OFFSET at 50 lakh — per `SQLITE_MIGRATION_LOG.md` entry 4) but **not** wired into CI as a gate |
| §178 chaos / failure | MISSING | no fault-injection tests (kill-during-write, disk-full, corrupted DB, mid-migration crash) |
| §179 final production gate | MISSING | gates cannot be declared until §163–178 items land |

### SPEC §161 required documentation

All 13 files now exist (this commit). Before it: **MISSING — 0/13**.

---

## 14. Implementation backlog, dependency order (§160.5)

Bounded capability per ticket, no big rewrite, ordered so that each step is testable and rollback-safe. `→` = prerequisite.

| # | Capability | Spec | Depends on | Risk |
|---|---|---|---|---|
| P1-1 | `docs/ADR/ADR-0002` decision on Firebase-era dead code + `docs/ADR/ADR-0001` secret handling (owner approval) | §158, §181 | — | low (decision only) |
| P1-2 | Architecture fitness test: eslint `no-restricted-imports` boundary — `src/App.jsx` may not import `src/db/DataStore.js` except through `src/db/Repository.js` (allow-list + baseline exception file, warnings first) | §164, G-02 | — | low (no runtime change) |
| P1-3 | Extract `Domain = catalog / pos / inventory / finance / crm / reporting / identity / subscription / device / sync / backup / support / release` as folders, moving **pure** logic first (`logic.js`, `sync.js`, `schemas.js` contents re-exported), zero behavior change | §164 | P1-2 | low-medium |
| P1-4 | Repository interfaces (per-domain read/write contracts) + move all 9 direct `DataStore` import blocks behind them | §164, G-01/G-02 | P1-3 | medium (billing read paths) |
| P1-5 | Provider adapters: `LlmAdapter`, `SmsAdapter`, `DriveAdapter`, `LicenseAdapter` behind interfaces; move 24 `fetch` sites out of components; secrets → adapter config | §158, G-03/G-04/G-10 | P1-1 | medium |
| P2-1 | SQLite transactions: wrap multi-statement writes (invoice+items+stock+txn) in `BEGIN IMMEDIATE … COMMIT`, with `executeSet` batching; add `user_version` + forward/backward migration gate | §165 | P1-4 | **high (money path) — real-device test mandatory** |
| P2-2 | Durable outbox **in SQLite** (`outbox` table, `idempotency_key`, `entity`, `op`, `payload`, `attempt`, `next_retry_at`, `correlation_id`), replace IndexedDB `SyncOutbox`; drain only when a sink exists | §165, G-12 | P2-1 | medium |
| P2-3 | Local idempotency + invoice numbering: SQLite `sequences` table (per tenant) instead of `INV-${invoices.length+1}` | §165, §166 | P2-1 | **highest** (SPEC §33: "ধাপ ৭ … কোনো শর্টকাট নেওয়া যাবে না") |
| P2-4 | Financial audit trail in SQLite (append-only, actor/device/ts/before-after hash) + finalized-record guard | §162 | P2-1 | medium |
| P2-5 | Offline-proof harness: `npm run test:offline` (network-disabled Android emulator) + kill-mid-write crash test; add to CI as `e2e:offline` | §165 | P2-1 | low |
| P3-x | Sync contract v1 (push/pull, cursor, idempotency, conflict matrix incl. **non-LWW rule for money records**), reconciler, dedupe-invoice, mass-reconnect, backlog metrics | §166 | P2-2, P2-3, **ADR-0005 (backend topology)** | high |
| P4-x | Cloud data platform (PostgreSQL schema + migrations + tenant isolation + API services + object storage + jobs + realtime notify-only + health/rate-limit/correlation) | §167 | P3-x | high — **new deployable, owner pays infra (§110 $25 stage)** |
| P5→P16 | As listed in SPEC §168–179, one bounded capability at a time; every phase updates `docs/CLAUDE_PROGRESS.md` (§182) | | | |

**Explicit non-actions for this phase** (SPEC §158/§160 honored): no dependency added, no file moved, no schema change, no deletion of the IndexedDB path, no cloud scaffolding created, no ADR marked approved by Claude.

## 15. Open inputs needed from the owner (blocks, not preferences)

SPEC §183: STOP only where a requirement is genuinely ambiguous **and** blocks implementation. Two do:

1. **§167/Phase 4 backend topology is not specified by the decision matrix** (§180 fixes *technology*, not *where it lives / who hosts it / which stage budget*) → `ADR-0005`. Until approved, Phases 3–4 code cannot be written; Phases 1–2 can.
2. **`LICENSE_SECRET` rotation & signing model** changes real activation codes for 500 shops → `ADR-0001`. Until approved, the existing scheme stays authoritative (nothing is being changed now).

Everything else in Phases 1–2 is derivable from this spec + current behavior and needs no owner preference.
