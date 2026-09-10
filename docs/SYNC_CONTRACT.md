# SYNC_CONTRACT.md — Protocol, Idempotency, Conflicts, Recovery

> **Status of this contract at `e2dc756`: the cloud sync path is intentionally DISABLED.**
> Repo permanent rule #5 (`SQLITE_MIGRATION_LOG.md`): *"Firebase সম্পূর্ণ ডিলিট হয়ে গেছে (কোড + সব দোকান থেকে)"* —
> migration is one-way local (blob → SQLite). Yet **239** firebase/Firestore references remain in `src/App.jsx`
> (dead but kept deliberately as history/fallback), and `FSS.init()` always returns `false`,
> so `useFSSCollection()` never becomes ready and `pushDurable()` drains into a no-op sink.
> Everything in §2–§6 below is therefore a **contract to implement** (SPEC §166), and §1 documents
> what actually runs today so that Claude never "improves" a live behavior by accident (SPEC §159 priority 1).

## 1. CURRENT, measured behavior

| Mechanism | Reality |
|---|---|
| Local durability queue | `SyncOutbox` (App.jsx:5543-5653) — IndexedDB `hg_sync_outbox`, store `outbox`; `put(coll,id,rec)` before send, `remove()` on `res.ok !== false`; re-flush on boot / resume / online / heartbeat / `useResyncTick` |
| Send path | `pushDurable()` (App.jsx:5664) → `FSS.setRecord()` — **no-op in production builds** |
| Multi-device merge | `performMasterSync()` (App.jsx:~14923, auto-invoked) compares Drive backup payloads; `mergeCollection(local, remote, tombstoneIds)` in `src/sync.js:150` |
| Conflict rule in use | **LWW by `effectiveTs()`**, plus tombstone protection (deleted ids are never resurrected). Covered by 24 passing cases in `tests/sync-tests.mjs` |
| Local change log | SQLite `events` table (`entity_type, entity_id, op, payload, device_id, ts, synced`) via `logEventsMany()` / `getUnsyncedEvents()` / `markEventsSynced()` — a real, durable, unacknowledged-events queue **without** a consumer yet |
| Drift reconciliation | `reconcileStore(businessType, store, currentArr)` → `{missingInSql, extraInSql, mismatched, matched}` (read-only, deep `data`-JSON compare) + legacy count-only `runVerify()` |
| Dual-write reliability | `dualWriteSqlite()` advances `prevMapRef` **only on successful write**; failures retry next cycle; `getDualWriteFailureStats()` in-memory counter. Explicitly *not* guaranteed eventual consistency (repo plan §"সীমাবদ্ধতা") |
| Clock/time zone | `dateKeyFromTs()` fixed GMT+6 (`_bdParts`) to match `App.jsx::_dateKeyOf()` — a UTC-vs-local bug previously produced wrong "today" between 00:00–06:00 BD |

**Gap verdict vs SPEC §4/§53/§54**: applying LWW to `invoices`/`txns` is prohibited for financial data ("Never use blind last-write-wins for financial operations"). It is currently harmless *only because there is no cloud write path*, and `performMasterSync()` is a manual/administrative merge. That must be recorded, not assumed — hence `ADR-0002` and §4 below.

## 2. Envelope (SPEC §52 — normative)

```jsonc
{
  "protocol_version": "1",
  "schema_version": <int>,
  "event_id": "<uuidv7>",
  "command_type": "upsert | delete | void | reconcile | close_period | …",
  "entity_id": "<record id>",
  "tenant": { "shop_id": "<id>", "branch_id": null },   // server derives from auth, never trusts client
  "device_id": "<sbm-license-device-id>",
  "client_created_at": <unix ms>,
  "payload": { … },
  "idempotency_key": "<device_id>:<local_seq>:<entity_id>"
}
```

Server result vocabulary (SPEC §52): `accepted | already_applied | conflict | validation_error | authorization_error | retryable_error | permanent_error`.
Pull response: `from_cursor, to_cursor, changes[], has_more, snapshot_required`.

Rules: cursor is server-generated and monotonic in its scope; application is idempotent; **the client never advances its cursor until local application succeeds**; push and pull are independently retryable; capability negotiation must let old clients stay supported; large syncs use bounded pages + backpressure.

## 3. State machine (SPEC §41 — normative)

```
PENDING → SENDING → ACKED
PENDING → SENDING → RETRY → SENDING      (bounded backoff + jitter, max attempts → DEAD-LETTER)
PENDING → SENDING → CONFLICT              (deterministic rule per §4, never silent)
PENDING → SENDING → FAILED / DEAD-LETTER
```

Constraints: retry after a network timeout must be safe even when the server already committed; ACKED events retained only as long as the device retention policy requires; partial batch failure must not advance the cursor past unapplied data; **outbox records must be durable before the local business transaction completes** (SPEC §162.5) — today that ordering is IndexedDB-first then send, which satisfies durability-by-store but not same-transaction atomicity (see `ADR-0004`).

## 4. Conflict matrix for this product (SPEC §53 applied, no new rules invented)

| Data class | Rule | Notes for SBM |
|---|---|---|
| Master/reference (products, customers, suppliers) | optimistic version check; controlled merge or latest-version where business-safe | add `rev` per record; SQLite `data` JSON carries it, no schema break |
| Invoice creation | immutable identity + idempotency; duplicates collapse to one operation | requires P2-3 (sequence table) — today `INV-${length+1}` cannot satisfy this |
| Invoice edits after finalization | prohibit, or correction workflow | app already has void + return; must be *append-only* audit-wise (SPEC §162.7) |
| Stock | server-side invariant / ledger validation; **never blind-merge quantities** | stock changes must be expressed as signed movements, not absolute values |
| Payment (customer joma, supplier payment) | idempotent transaction + reconciliation state | `txns` already ledger-shaped; needs idempotency key |
| Delete | tombstone / void semantics | `deletedProducts`/`deletedCustomers` sets already exist |
| User / permission changes | server authoritative | none exist yet (SPEC §169) |
| Reports | derived, rebuildable — never conflict-merged | aligns with `SQLITE_MIGRATION_LOG.md` decision to compute aggregates in SQL rather than cache-and-merge |

## 5. Time, ordering, idempotency (SPEC §54)

Store UTC; client time is **never** the authoritative ordering mechanism; UUID/UUIDv7 for distributed identity; server-side cursor/sequence for cloud ordering; every retriable mutation has a stable idempotency key; idempotency records survive the retry window; clock skew must not corrupt ordering.
Current deviation to close in Phase 2/3: ordering uses `effectiveTs()` (client wall clock, ms). Mitigations that already exist: fixed GMT+6 `date_key` semantics, license `LICENSE_MAX_SEEN_KEY` clock-rollback guard (reuse it as the skew detector seed for SPEC §169 "clock-skew detection").

## 6. Realtime, backlog and observability of sync (SPEC §4, §166)

Realtime is an acceleration signal; durable sync stays authoritative. Required metrics at Phase 3: backlog depth, oldest-pending age, push/pull lag, conflict rate by class, dead-letter count, reconciliation mismatches (`reconcileStore` numbers as a gauge), per-device last-seen/last-sync. Current substrate: `src/db/DiagLog.js` (400-entry timing ring buffer), `console.warn` (74) / `console.error` (12) sites, `logErrorToCentral()` = **no-op**, so **nothing is exportable today** → Phase 12.

## 7. Offline safety boundary (SPEC §78) — non-negotiable during any sync work

All core sales/inventory/customer/payment workflows complete locally · no network call inside a local transaction · remote config never required to render the core app · sync failure never rolls back a committed local transaction · cloud outage never makes SQLite unreadable · local migrations deterministic and recoverable.

## 8. Activation order for this contract (SPEC §80)

Step 0 offline-only (**current**) → Step 1 deploy backend dark → Step 2 contract/migration/backup-restore/load tests → Step 3 cloud backup for an internal/test tenant → Step 4 sync for a controlled pilot → Step 5 realtime/multi-device → Step 6 scale services → Step 7 streams/K8s/mesh only on measured need → Step 8 multi-region only after DR proof.
Gate for every step: repo permanent rule — no simultaneous rollout to all ~500 shops; canary only; old path stays until 4–6 weeks of production stability.
