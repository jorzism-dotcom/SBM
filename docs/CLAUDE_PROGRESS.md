# CLAUDE_PROGRESS.md — Phase / checklist / status (SPEC §161, §182)

> Format is fixed by SPEC §182: `PHASE | STATUS | FILES_CHANGED | TESTS_RUN | TEST_RESULT | MIGRATION | ROLLBACK | RISKS | NEXT_COMMAND`.
> Never marked PASS without evidence; evidence links below. Newest row on top (repo convention, same as `SQLITE_MIGRATION_LOG.md`).
> Status vocabulary: `PASS` (all acceptance criteria of that phase verified) · `PARTIAL` · `BLOCKED-ADR` · `NOT_STARTED`.

---

| PHASE | STATUS | FILES_CHANGED | TESTS_RUN | TEST_RESULT | MIGRATION | ROLLBACK | RISKS | NEXT_COMMAND |
|---|---|---|---|---|---|---|---|---|
| **Phase 0 — Repository audit** (SPEC §163) | **PASS** (audit-only phase; no `src/` file touched) | `NEW docs/PHASE_0_AUDIT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/SYNC_CONTRACT.md`, `docs/ENTITLEMENT_CONTRACT.md`, `docs/RELEASE_CONTRACT.md`, `docs/THREAT_MODEL.md`, `docs/DR_RUNBOOK.md`, `docs/REMOTE_SUPPORT_RUNBOOK.md`, `docs/OPERATIONS_RUNBOOK.md`, `docs/SLO.md`, `docs/DECISIONS.md`, `docs/CLAUDE_PROGRESS.md`, `docs/ADR/README.md`, `docs/ADR/ADR-0001…0005.md` — **no file modified or deleted** | `npm ci`; `npm test` (16 suites); per-suite: `node tests/<name>.mjs`; `npm run lint`; `npm run typecheck`; `npm run build` | **GREEN**: 251/251 cases pass (logic 86, schema 14, integration 10, sync 24, datastore-querypage 10, inventory 22, expenses 7, kpi-extra 11, pos-browse 13, supplier-due 8, getbyids 8, getallrows 6, invoiceitems 10, distinct-lookups 11, customer-rfm 7, reorder-alerts 4) · lint **0 errors** / 577 warnings (style, non-blocking by repo policy) · typecheck clean (scope: `src/logic.js`, `src/schemas.js`) · `vite build` ✓ 6.86 s | **none required** (zero runtime/schema change) | **none required** — `git revert` of the docs commit removes 100% of the change | Documentation risk only: statements are code-measured at `e2dc756`, so line refs age; `docs/PHASE_0_AUDIT.md` records the commands so any session can re-verify | `git log -1 --stat` then `npm test` (confirm still 251/251 on your checkout) |

---

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
`SQLITE_MIGRATION_LOG.md` (entry 126) is mid-flight: Invoices Phase-3 step 6 — 9 of 10 Category B aggregate sites still JS-only,
and the windowed-boot flag (entry 125) awaits real-device smoke testing. **Any Phase 1/2 refactor must be sequenced around it**
(both touch `App.jsx` and `DataStore.js`); the migration's own safety discipline (shadow-verify first, flags off by default,
fallback paths kept) is the same discipline SPEC §160/§162 demands.

## Rules this file enforces

1. One bounded capability per step; no large rewrite (SPEC §160).
2. Focused tests after each capability, regression tests after each phase, migration/restore tests for every persistence change (SPEC §160).
3. Never mark a phase complete before its acceptance gates pass (SPEC §160, §179).
4. Never claim production-readiness without load/failure/security/restore evidence (SPEC §4/§35).
5. Every row's `FILES_CHANGED` must be exhaustive, including non-substantive churn (repo permanent rule #7) — e.g. `package-lock.json` if `npm install` ever changes it.
