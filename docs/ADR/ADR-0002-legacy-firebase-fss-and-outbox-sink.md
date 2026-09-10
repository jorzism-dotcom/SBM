# ADR-0002 — Legacy Firebase-era code and the disabled outbox sink

**Status: PROPOSED (awaiting owner approval)** · Date opened: 2026-09-10 · Source: Phase 0 audit §6/§7, `docs/SYNC_CONTRACT.md` §1

## Problem
Cloud sync was removed from the product (repo permanent rule #5: *"Firebase সম্পূর্ণ ডিলিট হয়ে গেছে (কোড + সব দোকান থেকে)"*),
but the code was not removed — only disabled. Measured at `e2dc756`:
- **239** firebase/Firestore mentions still inside `src/App.jsx`; `FSS.init()` always returns `false`; `useFSSCollection()` never becomes ready;
  `pushDurable()` writes to `SyncOutbox` (IndexedDB `hg_sync_outbox`) and then calls the no-op sink, so outbox entries either linger or are
  drained only against a dead target; **26** `useFSSCollection("<collection>")` call sites kept intact on purpose
  (the in-code comment claiming "12 call sites" is itself stale — measured with `grep -oE 'useFSSCollection\("[a-zA-Z]+"'`).
- `netlify-site/vendor/firebasejs/10.12.0` is still vendored in the repo; `android/` CI still installs `google-services.json` + Firebase
  `server_client_id` into `strings.xml` (used only by the Google **Auth** plugin today).
- Result: every future session must re-derive "what is live vs dead" (this audit had to), and there is a real risk someone re-enables a
  legacy path pointing at a Firebase project that is no longer owned/audited.

## Constraints
- SPEC §158: "Do not rewrite working code merely for style"; SPEC §159: current production behavior is priority-1 truth.
- `SyncOutbox` is the **only** durable pre-send queue for the write path; SPEC §162.5 requires outbox durability *before* transaction completion,
  so the queue must not be deleted — its **sink** is what is dead.
- Multi-device story today = Drive-blob `performMasterSync()` + `mergeCollection()` (`tests/sync-tests.mjs`, 24 cases). That must keep working.
- Repo rule #1 (never remove the fallback path) applies to storage, not to dead remote clients — but the line must be drawn explicitly, not by guess.

## Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | Leave everything as-is | zero risk | permanent ambiguity; dead code rots; outbox grows unbounded on some devices |
| B | **Isolate**: move all firebase-era remnants to `src/legacy/` (no behavior change), keep `SyncOutbox` as the transport-agnostic queue with an explicit `NoopSink`, add a drain/TTL policy so entries cannot accumulate | removes ambiguity, keeps history, keeps SPEC §162.5 queue semantics, makes ADR-0002 reversible by `git mv` | a big mechanical diff (needs a golden-master + full `npm test` pass); must re-verify all 26 `useFSSCollection` call sites stay inert |
| C | **Delete** all Firebase remnants (incl. vendored js, google-services wiring comments) and replace `SyncOutbox` with the SQLite outbox in one step | cleanest end state | mixes two risky changes (deletion + persistence migration) in one step; violates the project's own one-bounded-capability rule; loses the documented history the repo keeps deliberately |
| D | Re-enable a sync target now | would "use" the outbox | directly contradicts SPEC §80 (cloud is dark until Phase 4) and §179 gates |

## Selected option (recommended, not approved)
**B**, executed as two PRs: (B1) move + rename-only isolation with no logic change; (B2) `NoopSink` + outbox retention policy
(entries older than N days or beyond M per collection are dropped with a counted warning, because they can never be delivered).

## Consequences
- `docs/DATA_MODEL.md` §2's "must not be removed" note stays true for IndexedDB **storage**; only the remote client dies.
- Firebase `vendor/` folder in `netlify-site/` can be deleted after checking the admin pages that reference it (`admin.html` was retired per CI comments) — verify before removal.
- CI `google-services.json` step stays (Google **Auth** plugin needs it) → rename the step's comment to avoid confusion.
- Future Phase 3 gets a clean queue interface instead of archaeological surgery.
- Until approval: no deletion, no move, no behavior change.

## Migration / rollback
- B1 is pure `git mv` + import rewrite → rollback = revert commit. `npm test` (251 cases) + `npm run test:golden-master` + `vite build` byte-compare of chunk sizes as a smoke signal.
- B2 changes only outbox bookkeeping → flag-gated (`sbm_legacy_outbox_drain`), default off; rollback = flag off.

## Test plan
- Existing 16 suites must stay green; `sync-tests` (24) cover `mergeCollection` unchanged.
- Add: "no new Firebase import reachable from `src/App.jsx` after B1" (static assertion test, SPEC §66 fitness function).
- Add: outbox depth assertion — after B2, `SyncOutbox.getAll()` length stays bounded in a 7-day simulation.
- Real-device: 1 test shop, cold boot ×3, confirm boot time unchanged and no console errors from renamed imports.

## Approval status
| Field | Value |
|---|---|
| Proposed by | Claude (Phase 0 audit) |
| Approved by | — |
| Approval date | — |
