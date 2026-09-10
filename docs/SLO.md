# SLO.md — Measurable SLOs & Error Budgets

> **Status: PROPOSED — awaiting owner approval.** SPEC §151 requires an SLO/error-budget layer, but the numbers below
> are *not* invented: the "measured" column is taken from `SQLITE_MIGRATION_LOG.md` benchmarks and the Phase 0 audit,
> and each "target" is set at/just above an already-observed value so it is achievable without new infrastructure
> (SPEC §81 diminishing-returns guardrail). No dashboard/alerting exists yet (SPEC §175 is `PARTIAL`), so today these
> SLOs are **manually evaluated** from the DiagLog panel — that is the honest state; §4 lists what makes them measurable.

## 1. Service level objectives

| ID | Objective (window: rolling 30 days, per shop) | Measured baseline | Proposed target | Error budget |
|---|---|---|---|---|
| S-1 | POS sale completes with **zero** network | by design in `OFFLINE_MODE` builds (cloud stripped) — no automated offline proof test yet (SPEC §165 gap) | 100% of POS sessions; proven by a `test:offline` harness | 0 (money path, no budget) |
| S-2 | Interactive list read after cold boot (products/customers first page) | worst documented case: ~5 s empty list (head-of-line blocking, fixed in entries 122/123) | **p95 ≤ 1.5 s**, p99 ≤ 3 s | 0.5% of boots |
| S-3 | Product search latency (FTS5) at 1,00,000 products | 15.7 ms (LIKE 7.4 ms) | p95 ≤ 100 ms on a budget Android device (≥ 6× margin over benchmark host) | 1% of searches |
| S-4 | Dashboard day aggregate (`SUM(total)` by `date_key`) | 2.5 ms after `ANALYZE`; **9,000 ms without it** at 1 crore invoices | p95 ≤ 500 ms; **`ANALYZE` present after every backfill** | 0 (documented cliff) |
| S-5 | Keyset (cursor) pagination depth 50 lakh | ~913× faster than OFFSET (log entry ~"6.") | p95 ≤ 300 ms per page | 1% |
| S-6 | Data durability — no lost write after app kill mid-save | immediate `save()` at sale/create/PE sites + `SyncOutbox` persist-before-send; no kill-test harness yet | 100% proven by P2-5 crash tests | 0 |
| S-7 | Local↔SQLite drift | `reconcileStore()` all-zero drift required; deep check exists, count-only `runVerify()` was found insufficient | `missing+extra+mismatched == 0` at weekly check for every shop on never-load flags | 0 (money/stock source of truth) |
| S-8 | Auto backup freshness (device online) | 5 min interval + 15-min WorkManager safety net | `modifiedTime` ≤ 10 min for ≥ 99% of online hours | 1% |
| S-9 | Restore success (drill) | never formally drilled (SPEC §171.10 `MISSING`) | 100% of monthly drills on first attempt; RTO ≤ 30 min | 0 |
| S-10 | Sync backlog / lag | n/a — cloud sync disabled by design | (Phase 3+) oldest-pending ≤ 15 min online, conflicts auto-resolved ≤ 0.1% | 1% |
| S-11 | Build/CI health | baseline at `e2dc756`: `npm test` 251/251, lint 0 errors, typecheck clean, `vite build` 6.86 s | merge-blocking: all green; fuzz green; new SQL suites required for each converted site | 0 |
| S-12 | Crash-free app sessions | not measured (no telemetry; `logErrorToCentral()` is a no-op) | measure first, then target — no invented number (SPEC §21) | TBD |

## 2. Error-budget policy

- Budget exhausted (S-2/3/5/10/11) → **feature freeze** for that area; only fixes + tests; flag rollback allowed.
- Budgets of S-1, S-4, S-6, S-7, S-9 are **zero**: they are money/stock/data-integrity objectives. Any regression there
  is a release blocker by definition and triggers the shop-level rollback in `docs/OPERATIONS_RUNBOOK.md` §4.
- Budget consumption is reviewed at each migration-step log entry (the repo's existing habit), not in a new ceremony.

## 3. SLIs that must not be gamed

`S-7` (drift) must be evaluated with `reconcileStore()` (deep, content-level), **never** with the count-only
`runVerify()` — the repo already learned that counts hide content drift. `S-2/S-4` must be read from `DiagLog`
with the queue's own split (`queue-wait` vs `নেটিভ-exec`) so a planner regression can't be disguised as "device slow".

## 4. What makes these measurable (SPEC §175 / Phase 12)

| Need | Current | Required |
|---|---|---|
| Metrics | local DiagLog ring buffer, 400 entries, on-device only | OpenTelemetry-compatible counters/histograms behind an interface; export **opt-in, redacted** (`docs/THREAT_MODEL.md` T-09) |
| Traces | one `correlation id` per DB op (`db.query #n`, tagged interactive/background) | propagate the id through outbox → server (Phase 3/4) |
| Dashboards/alerts | none | per-shop backlog/latency/drift; SLO burn-rate alert (SPEC §151) |
| Load/soak | `scripts/generate-synthetic-dataset.mjs` benchmark, manual | scheduled CI job with ceilings from S-3/S-4/S-5 (SPEC §177) |
| Chaos/failure | none | kill-mid-write, disk-full, corrupted-DB boot, mid-migration crash, mass-reconnect (SPEC §178) |
| SLO review | none | monthly, recorded in `docs/CLAUDE_PROGRESS.md` |

## 5. Cost/capacity guardrails (SPEC §152)

$25/month budget stage (SPEC §110) is the binding constraint: no SLO above may justify a new always-on service.
Consequence: **measure first**, keep S-10/S-12 unmeasured-but-defined until Phase 4 exists, and prefer SQLite-side
improvements (indexes backed by `EXPLAIN`, `ANALYZE` scheduling, batching via `executeSet`) over new infrastructure.
