# DR_RUNBOOK.md — Backup, Restore & Disaster Recovery

> Everything in §1–§3 is **implemented and in use in production**; §4–§6 are the SPEC §171 requirements that are still
> `MISSING`, each with the exact gap so no one has to re-derive it. Owner context: 3 active shopkeepers, ~500 shops
> receiving APKs, no off-device server of our own (the user's Google Drive is the only remote copy).

## 1. Backup — current mechanisms (measured)

| Mechanism | Detail |
|---|---|
| Auto Drive backup | every **5 min** (`DRIVE_BACKUP_INTERVAL_MIN = 5`, App.jsx:3868); interval is intentionally fixed (multiple comments: users must not choose longer) |
| Source of truth for payload | `buildBackupData()` reads **full collections from SQLite `getAllRows()`** (not from React state) — the fix that made backups correct under boot-lazy/never-load modes (migration log entries 75/76); `buildManualBackupData()` and `performMasterSync()` use the same pattern |
| Field registry | `src/sync.js::BACKUP_FIELDS` (20 collections + `users`); `pickBackupFields()` strips anything unregistered; `diffBackupFields()` compares |
| Integrity metadata | payload + **`checksum` + `counts`** built by looping the registry (App.jsx:14462-14475); re-verified by `validateBackup()` before apply, incl. legacy v2–v6 formats (App.jsx:5020-5045, `checksumMismatch` → refuse) |
| Cross-business guard | `validateBackup(data, currentBusinessType, currentEnabledTypes)` refuses a restore whose `_meta.businessType` ≠ active business type (App.jsx:42612) — prevents mixing a pharmacy backup into a vet shop |
| Encryption | optional AES-256-GCM, `PBKDF2-SHA256` **600,000 iterations**, salted, `CRYPTO_MAGIC = "SBM-ENC-V1"`, `_meta.version: 3` (App.jsx:7725-7775). Lost passphrase = **unrecoverable by design**, warned in UI |
| Remote storage | Google Drive, `drive.file` scope, normal (visible) folder `"…"` with `BACKUP_FILENAME = "sbm-backup.json"` (App.jsx:42712, 43030-43224); folder/file metadata read via `appProperties`, `modifiedTime` |
| Native scheduling | `capacitor-backup-service`: exact alarm per interval, `WorkManager` periodic 15-min **safety net**, foreground keep-alive service, `BootCompletedReceiver`, battery-optimization exemption requests (`isIgnoringBatteryOptimizations`, `requestIgnoreBatteryOptimizations`) |
| Local export/import | JSON file export + `<input type=file accept=".json">` restore (App.jsx:42102), restore guard `beginRestoreGuard(computeRestoreGuardMs())` (App.jsx:4084) suppresses writes while applying |

## 2. Restore — current procedure (what to actually do)

**R1. Local file restore (single device, worst case: fresh phone)**
1. Install the **same or newer** APK version (older app may not understand newer `_meta.version`).
2. Sign in to Google only if Drive is used; otherwise export the JSON from the old device first.
3. Settings → Restore → pick `sbm-backup.json` (or encrypted variant) → enter passphrase if encrypted.
4. Confirm the counts shown by `validateBackup()` (customers/products/invoices) against the last known numbers;
   abort on `checksum মেলেনি` or the business-type-mismatch message — **do not force past either**.
5. After restore, app does a cold restart; verify: today's KPI, one known invoice, one customer baki, stock of one known product.
6. Only then switch the shop back to normal use. SQLite gets re-hydrated from restored state by the dual-write path
   (boot's first `products` change re-upserts the whole array — repo plan §"ধাপ ২").

**R2. Drive restore (device lost / reinstalled)**
Same flow, source = `sbm-backup.json` in the app's Drive folder; check `modifiedTime` is within the last 5–10 minutes before
proceeding, otherwise the device was offline for longer than assumed and R3 applies.

**R3. Worst case — both device and Drive lost**
Recovery is limited to: any manual JSON exports the owner kept, plus `paymentInvoices`/paper records. There is **no
server-side copy** (SPEC §171 `MISSING`), so treat this as the driver for §4.1.

## 3. Verification commands (no device needed)

```bash
npm test                     # 16 suites / 251 cases (logic, schema, integration, sync, 12 datastore SQL suites)
node tests/golden-master.mjs # golden-master parity of formulas
node tests/logic-fuzz.mjs    # property-based (CI-blocking)
```
Deep data-drift check (device, dev panel): "🧪 Products গভীর রিকনসিলিয়েশন চেক" → `reconcileStore()` output
`{missingInSql, extraInSql, mismatched, matched}`; expect all-zero drift before trusting a restore as "clean".

## 4. Gaps vs SPEC §171 (each one is a backlog item, not a claim)

1. **Retention policy** — `sbm-backup.json` is overwritten; no versioned archive → cannot roll back past the last 5 minutes.
   Needed: N-version Drive filenames + retention (SPEC §171.2), or move to the object-storage adapter (§167).
2. **Integrity verification is client-side only** — nobody can prove a backup is good until someone restores it
   (SPEC §171.3 automated verifier job).
3. **PITR** — none (`MISSING`; SPEC §171.4 "where provider supports it").
4. **Tenant export contract** — partial: JSON export exists, no per-tenant export API/contract (SPEC §171.5).
5. **Restore-to-staging** — `MISSING`; restores apply straight onto the live shop (SPEC §171.6) — this is the single
   scariest gap: a bad file becomes the shop's truth with no rehearsal.
6. **Restore approval + audit** — `MISSING` (SPEC §171.8); only `auditLogs` collection entries.
7. **RPO/RTO undefined and untested** (SPEC §171.9) → see §5; **automated restore drills missing** (SPEC §171.10) —
   SPEC §171.11: *"Do not declare backup complete until a restore has succeeded."*

## 5. Declared objectives (to be confirmed by owner — proposed values, not yet a promise)

| Metric | Proposed | Basis |
|---|---|---|
| RPO (offline-tolerant, local) | ≤ 1 write-batch (immediate `save()` on critical mutations) | code: crash-safety immediate writes at sale/create/PE sites |
| RPO (off-device) | ≤ 5 min while device online & battery-exempt | `DRIVE_BACKUP_INTERVAL_MIN = 5` + WorkManager 15-min safety net |
| RTO (single shop, R1) | ≤ 30 min manual | dominated by download + restore + verify; measured only anecdotally |
| RTO (fleet-wide catastrophic) | **undefined** — no server copy | §4.1/§4.3 |

These must be re-measured during the first restore drill (§6) before any "enterprise DR" claim (SPEC §35, §179).

## 6. Restore drill — the missing routine (proposed, monthly)

1. Test tenant (the owner's own pharmacy) → make 5 sales, note totals.
2. Export auto backup + one encrypted manual backup.
3. Fresh install on a spare device (or app-data-clear), restore both; assert KPI/invoice count/stock equal the notes;
   run the deep reconcile check (§3); confirm boot-lazy + never-load flags behave with restored data.
4. Record: elapsed time (RTO), counts before/after, `checksum` verification, flag states, any drift.
5. Commit the result line into `docs/CLAUDE_PROGRESS.md` (`MIGRATION`/`ROLLBACK` columns) — SPEC §182.

## 7. Do-not rules (protecting this area during the SQLite program)

- Never remove the IndexedDB blob path while dual-write is running (repo permanent rule #1; SPEC §19/§23).
- Never let a new code path write `products`/`invoices` bypassing `debouncedSave()` + `dualWriteSqlite()`
  (the single choke point verified in repo plan "ধাপ ২" — re-audit after any Phase-1 module extraction).
- Never ship a migration that cannot be re-run idempotently (`migrateStoreResumable` + `_migration_state` semantics),
  and always `ANALYZE` after bulk backfill (`analyzeDb()`) or the dashboard regresses to ~9 s (migration log entry 4).
