# OPERATIONS_RUNBOOK.md — Incidents & Routine Operations

> Written for the app as it actually runs: an offline Android APK, per-shop Google Drive, GitHub Actions as the only
> server-side automation, and a multi-month SQLite migration in flight. Incident classes below are the ones the repo's
> own log (`SQLITE_MIGRATION_LOG.md`, 126 entries; `CLAUDE.md` session history) shows have actually happened.

## 1. Standing operating rules (from `CLAUDE.md` + `SQLITE_MIGRATION_LOG.md` permanent rules)

1. Never delete the old persistence path (IndexedDB blob) while dual-write is running, and not before 4–6 weeks of proven production stability.
2. Re-read the relevant code region before editing — do not trust remembered line numbers (this audit measured 43,680 lines in `App.jsx`; the plan's own line refs were stale by ~300 lines).
3. After changing a shared function, grep **all** call sites (`products` alone had 66 reference sites measured in the repo plan).
4. Run `npm test` after every step; real-device smoke test after every migration step. Never roll out to all shops at once.
5. Firebase stays deleted — no new Firestore/dual-sync code (239 dead mentions are legacy, see `ADR-0002`).
6. Every session/entry must list exactly which files changed (permanent rule #7) — mirrored in `docs/CLAUDE_PROGRESS.md` §182 format.
7. 8 high-priority areas are never "cleaned up" as a side effect: sync, multi-device, backup, restore, all money math (profit/cash drawer/supplier due/KPI), products (stock, batch/FEFO), customers, invoice + void.

## 2. Incident playbooks

### I-1 · "App opens but product/customer list is empty for ~5 s" (cold-boot latency)
- Class: boot/queue contention, **not** data loss. Cause documented: single serialized native bridge; a background untagged aggregate dispatched before the interactive `queryPage()` blocks it (3.9–4.3 s native cost cold).
- Check: DiagLog `queue-wait` vs `নেটিভ-exec`; boot log `⏱️ [SQL cold-start]` breakdown.
- Actions: confirm `_pumpDbQueryQueue()` micro-settle behavior (entries 122/123) is present in that build; do **not** add new untagged boot queries to `App.jsx` boot path. Escalate only if `নেটিভ-exec` itself is the cost (then see I-4).

### I-2 · Wrong number in a KPI / dashboard / report
- Class: JS-vs-SQL parity. Every converted site runs shadow-verify first and `console.warn`s a mismatch (pattern: `⚠️ [এন্ট্রি ১২৬] paymentTypeTotals SQL vs JS মিসম্যাচ`).
- Check: which flag state (`sqlite master`, `products never-load`, `customers never-load`, `invoices windowed boot`), whether the number is windowed (6-month) vs full-history, and whether `dateKey` vs `date` ("M/D/YYYY") comparison is involved (a real past bug: ASCII-comparing `"8/16/2026" >= "2026-07-17"` always true → m1/m2/m3 buckets were garbage).
- Actions: flip the responsible flag **off** (safe by design), collect the console excerpt, fix in a test shop, re-enable after a real-device pass. Never "fix" by editing the displayed value.

### I-3 · Data drift between SQLite and IndexedDB
- Tool: dev panel "🧪 Products গভীর রিকনসিলিয়েশন চেক" → `reconcileStore()` `{missingInSql, extraInSql, mismatched, matched}` (read-only).
- Root cause precedent: `dualWriteSqlite()` used to advance `prevMapRef` synchronously before the write resolved, so a silently swallowed failure (`catch(() => {})`) never retried → record permanently absent in SQLite. Fixed by advance-on-success + `getDualWriteFailureStats()`.
- Residual: **not** guaranteed eventual consistency — if nothing else in that store changes, no new cycle triggers. Action: make any edit in the shop (or re-run the store migration) to force re-upsert; then re-check to all-zero.
- If counts-only `runVerify()` says OK but deep check does not → trust the deep check.

### I-4 · Sudden slowness after bulk import / mass edit
- Cause pattern: SQLite planner picking a non-selective index (`idx_invoices_status`, 2 distinct values) → `SUM(total)` per day took **~9 s at 1 crore rows** vs 2.5 ms after `ANALYZE`.
- Action: run `analyzeDb()` (scheduled/weekly tied to the backup routine was the documented recommendation); confirm with DiagLog timing; do **not** add indexes without measured `EXPLAIN` evidence (SPEC §4). Note the migration path must call `ANALYZE` after every backfill (log entry 2 action item).

### I-5 · "A sale went through but stock didn't decrease" / purchase entry silently did nothing
- Precedent 1 (entry 91): never-load mode `base` lookup in POS stock deduction — real-device verified fixed.
- Precedent 2 (entry 80/89): `applyPurchaseBatch()` looked `prod` up in a **local** `productsByIdMap` built from raw `products` → empty in never-load mode → `if (!prod) return null` saved the form as a no-op, no error. Fixed by building from `productsSearchSource` (hydrated global).
- Action: confirm which lookup the code path uses (local useMemo Map vs global `productsById`/`useProductsByIds()`); the rule is *never* build a Map from a possibly-empty boot array. Then reproduce with a real sale + cold restart.

### I-6 · App locked out / "offline_lock" with valid subscription
- Precedent (July 19 2026 fix): a hanging `Capacitor.Plugins.Preferences.get()` on cold start (low battery / power-saving) never resolved, the `SubscriptionGate` 8 s fallback timed out, so the lock screen appeared although the local cache was valid. Mitigations now in code: `setStorage()` mirrors to `localStorage`, `getStorage()` bounds Preferences to 3 s.
- Action: don't clear app data (that destroys the only local truth); collect `sbm-license-history` / `max_seen_ts` evidence (clock rollback?), and if the device clock is broken use the offline admin-PIN-reset derivation — never a manual DB edit.

### I-7 · Corrupt / unreadable SQLite DB, or boot loop after a device OS update
- Order: (1) flag off `sqlite master switch` → app falls back to IndexedDB path by design; (2) if boot is broken (see the six `INSTANT_BOOT_V*.md` files at repo root — this class has recurred 7 times, all root-caused to boot-injection/timing), install the same-version APK over itself (data preserved); (3) restore from Drive/JSON per `docs/DR_RUNBOOK.md` R1/R2 as last resort.
- Never hand-edit the `.db` file to "quickly fix" a shop.

### I-8 · Restore applied to the wrong business
- Guard: `validateBackup()` refuses on `_meta.businessType` mismatch (App.jsx:42612). If a shop reports "our vet data appeared in the pharmacy", check whether that guard was bypassed by an old APK or a multi-business device, and reconcile counts immediately.

## 3. Routine operations

| Cadence | Task |
|---|---|
| Per build | CI gates: lint(errors) → typecheck → `npm test` → fuzz (blocking) → signed APK artifact (30-day retention). Public release only with `online_release=true` |
| Per release | one canary shop first, 24 h watch (DiagLog + one deep reconcile check), then batched shops |
| Weekly | `analyzeDb()` after any bulk change; review `getDualWriteFailureStats()`; check Drive backup freshness (`modifiedTime`) on at least one shop per business type |
| Monthly | restore drill on a spare device (`docs/DR_RUNBOOK.md` §6); review open dependabot PRs (11 currently open) — pin majors only with a test pass |
| Per migration step | log entry in `SQLITE_MIGRATION_LOG.md` + `docs/CLAUDE_PROGRESS.md` line, with file list and evidence |

## 4. Escalation & stop-the-line

- Any incident that touches money/stock correctness: **freeze all migration flag changes** until root-caused (SPEC §179 gate culture; repo plan's "ধাপ ৪ আটকে রাখা হয়েছে" precedent — the team deliberately stopped a step even under "যেকোনো মূল্যে" pressure because real-device behavior cannot be simulated in a sandbox).
- If two shops report the same numeric discrepancy after one release: roll back the release (install the previous APK), keep the data, root-cause on a test shop.
- Never mark a capability "done" without a passing gate and evidence (SPEC §182).
