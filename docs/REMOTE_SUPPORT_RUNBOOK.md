# REMOTE_SUPPORT_RUNBOOK.md — Support Workflow & Safety

> Reality check first: **there is no remote support channel in the product today.** Support is
> *manual, human, and device-physical*: shopkeeper WhatsApps a screenshot / a screen recording / a
> copy-pasted console log, the owner/developer reasons about it, then ships a new APK. SPEC §145/§172
> requires a consented, scoped, redacted, audited channel with **typed allowlisted repair actions** and
> explicitly prohibits arbitrary SQL/shell/code execution. This file documents what exists, what is allowed
> under the current manual model, and the contract to build — nothing in §3–§5 may be implemented before
> Phase 9 (SPEC §168 order) and an ADR for the consent/policy model.

## 1. Existing diagnostics surface (measured)

| Tool | What it gives | Where |
|---|---|---|
| `DiagLog.js` | ring buffer of **400** timing entries (`DiagLog.js:15-17`: `MAX_ENTRIES` raised 60→400 because the first lines — SQL cold-start etc. — were being evicted), in-app panel in Settings | `src/db/DiagLog.js`, `logDiag/getDiagLog/clearDiagLog` imported in `App.jsx:43` |
| SQL timing logs | `⏱️ [SQL cold-start: <tag>] db.open/pragma/column-check/schema-execute/demand_type-backfill/warm-up/health-check` and `🧵 [db.query #n, tag, ব্যাকগ্রাউন্ড|ইন্টারঅ্যাক্টিভ] queue-wait / নেটিভ-exec / মোট` + the SQL text | `DataStore.js` (gated by `SQL_RUNTIME_DIAGNOSTICS`; "🩺 [DB স্বাস্থ্য] production diagnostics disabled" in prod) |
| `getDualWriteFailureStats()` | in-memory dual-write failure counter (drift detector) | App.jsx, added with repo plan "সংশোধন ২" |
| Deep reconcile button | `{missingInSql, extraInSql, mismatched, matched}` for products (read-only) | dev panel `SqliteMigrationCard` → `reconcileStore()` |
| Flag toggles | 21 runtime flags (products/customers boot-lazy + never-load, invoices windowed boot, POS on-demand cart, sqlite master switch, dev panel) | Settings cards `ProductsBootLazyToggle`, `InvoicesWindowedBootToggle`, … |
| Queue priority instrumentation | `_pumpDbQueryQueue()` boot-grace priority + per-background-dispatch micro-settle (migration log entries 122/123) — explains "5 s empty list on cold boot" class bugs | `DataStore.js` |
| Version/build identity | `APP_VERSION`, `APP_BUILD` (`<UTC date>-<sha7>`), hidden tap on version → dev panel | App.jsx:37680, 3817-3845 |

**Nothing is exported anywhere**: `logErrorToCentral()` is an intentional no-op (`App.jsx:1419`). So a support session
today = asking the user to open Chrome DevTools over ADB, or a screenshot of the DiagLog panel.

## 2. Safe workflow under the current (manual) model

1. **Identify the artifact**: version + build id from the Settings version row (never debug an unknown build), shop/business type, device model + Android version, date/time (BDT).
2. **Reproduce the data shape, not the data**: ask for counts (products/invoices/today's sales) and the exact screen, not raw dumps. Business data must not leave the shop unless the owner explicitly consents (SPEC §145.1).
3. **Prefer read-only evidence**: DiagLog panel screenshot, console log paste, reconcile button output, `getDualWriteFailureStats()` output. Do **not** ask for the SQLite file or backups as a first step.
4. **Classify** before touching code: (a) boot/queue latency → `DataStore.js` queue; (b) wrong number → JS-vs-SQL parity (shadow-verify mismatch warnings are designed for this, e.g. `⚠️ [এন্ট্রি ১২৬] paymentTypeTotals SQL vs JS মিসম্যাচ`); (c) data loss/drift → reconcile + dual-write stats; (d) lock/access → `docs/THREAT_MODEL.md` T-03/license paths.
5. **Fix by flag first, code second**: every risky path is already behind an off-by-default flag; a test shop can toggle it. Never remove the fallback path (repo permanent rule #1).
6. Ship: `npm test` (+ fuzz) → CI OFFLINE build → **one shop only** → verify → only then wider rollout.

## 3. Prohibited during support (SPEC §172 last line, §158, §43)

- No arbitrary SQL, shell, or code execution — *not* "a small query", not even read-only, when a typed action exists.
- No direct edits to a shop's SQLite/IndexedDB/backup file by the support operator.
- No ad-hoc "patch" APK built from a private branch (untraceable build id).
- No password/PIN harvesting; the admin PIN-reset code stays derivable offline per `computeAdminPinResetCode()` — if that ever moves server-side, it needs its own ADR (SPEC §162.12, §145).
- No enabling of a flag on all shops at once (SPEC §6 canary rule; repo permanent rule #6).

## 4. Contract to build (Phase 9 / SPEC §145 + §172)

| Capability | Required shape |
|---|---|
| Consent & policy | explicit per-session, per-scope support authorization; owner-approved policy; visible in-app indicator while active |
| Support session | short-lived, scoped, revocable; bound to `device_id` + tenant; every grant logged (SPEC §162.14) |
| Diagnostic bundle | **redacted** structured bundle (flags, versions, timing counters, reconcile summary, error classes) — schema-versioned; never raw PII, never invoice bodies by default |
| Typed repair actions | allowlisted enum (e.g. `re-run-migration-for-store`, `reconcile-products`, `force-sqlite-rehydrate`, `clear-diag-log`, `requeue-outbox`), each with preconditions, dry-run mode, idempotency key, result contract, auto-audit. **No free-form parameters** |
| Remote config / activation | only through the Control Plane (SPEC §142: activation is a transaction), never by direct flag poke |
| Health & visibility | device/app health dashboard, sync backlog + last-seen (SPEC §147), emergency disable (SPEC §172.9) |
| Operator audit | who/when/what/why, append-only, exportable |
| Offline safety | every support feature must degrade to no-op with no network (SPEC §78) |

## 5. Data-safety notes specific to this app

- `DiagLog` contains SQL text — before any export feature, the redactor must strip literal values (customer mobile numbers appear in queries today).
- Real-device reproduction is the project's long-standing verification gate: sandbox cannot reproduce the Capacitor SQLite plugin's Android behavior (repo plan says this explicitly). A support channel that skips real-device confirmation is worse than none.
- Backup restore is a support action, not a repair action: R1–R3 in `docs/DR_RUNBOOK.md` need owner approval each time.
