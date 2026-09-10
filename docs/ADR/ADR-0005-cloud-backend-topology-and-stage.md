# ADR-0005 — Cloud backend topology, hosting & stage (SPEC §167 / Phase 4)

**Status: PROPOSED (awaiting owner approval)** · Date opened: 2026-09-10 · Why an ADR is required now

## Problem
SPEC §180 fixes the *technology* (PostgreSQL + SQLite, Redis-compatible abstraction, no Kafka/K8s in the initial runtime, provider-neutral
interfaces) but deliberately does **not** decide where Phase 4's backend physically lives, which budget stage it starts at, or whether it is a
workspace package in this repo. SPEC §158 forbids Claude from choosing ("Do not invent … STOP and create an ADR"), and SPEC §150/§163 cannot be
implemented without the answer. This blocks: `docs/SYNC_CONTRACT.md` §8 Step 1 onward, Phase 4's schema/migrations, and the CI for a second artifact.

Current measured facts to design against:
- Repo contains **no backend**: 2 Vercel serverless functions only (`netlify-site/api/refresh-token.js`, `api/gh-releases.js`) and static admin pages.
- CI produces exactly one artifact: signed Android APK (`build-apk.yml`, 424 lines). No container image, no deploy job, no staging environment.
- `netlify.toml` + `netlify-site/package.json` (5 lines) suggest the admin site was migrated Netlify→Vercel (`sbm-admin-mocha.vercel.app` is what the app calls at `App.jsx:3884`), so deployment naming is currently inconsistent.
- Cost ceiling declared by the plan: **≤ $25/month** at budget stage (SPEC §110), pilot $25–75 (SPEC §111).
- 500 shops / 2,500 devices, 2,000 invoices/shop/day stress assumption (SPEC §0).

## Constraints
- SPEC §24 "Infrastructure Principle — $25 Constraint"; SPEC §65 progressive infrastructure; §81 diminishing-returns guardrail.
- SPEC §11 "no component may become a permanent SPOF without a documented reason"; §179 final gate needs staging + load/chaos evidence.
- Owner works from a phone, no PC; deploys must be repo-triggered (GitHub Actions) or fully managed — no imperative SSH routine.
- Existing admin tooling is static + one Vercel project; adding a second hosting vendor increases the operational surface the owner must pay for and maintain.
- Offline-first remains non-negotiable: nothing in Phase 4 may become a runtime dependency of POS (SPEC §78).

## Options
| # | Option | Cost trajectory | Pros | Cons |
|---|---|---|---|---|
| A | `server/` **workspace package inside this repo**, Node.js+TS + PostgreSQL on a managed PG (Neon/Supabase-class), API on one small managed runtime; single repo, single CI matrix | fits ≤ $25 to start with autosuspend | one atomic change set keeps app+contract+`schema.sql` in lockstep; ADRs and migrations reviewed together; reuses existing Actions; no new vendor for the owner | repo grows (still ~1 MB source); must keep `npm test` (mobile) and `server` tests separable so mobile CI stays fast |
| B | Separate repo `SBM-server` with git submodule or package dependency | same | hard boundary by construction; independent release cadence | cross-repo PR friction for every contract change; the owner's manual upload workflow (§CLAUDE.md "files via upload") makes 2-repo sync error-prone |
| C | BaaS-first (Supabase/Firebase-class managed sync + PG) | may exceed $25 at 500 shops | fastest to a working endpoint | violates SPEC §2/§180 intent (vendor-specific DB API, adapter replaceability) and repo rule "Firebase fully deleted"; conflicts with "never trust client-supplied shop_id" unless RLS is proven |
| D | Single self-hosted VPS + Docker Compose (PG + API + Redis + Caddy) | ~$5–20 | full control, everything local | owner has no PC and no ops time; violates "no imperative deploys" practicality; upgrades/backups fall on one human; SPEC §19 DR becomes manual |
| E | Stay serverless-only (Vercel functions + managed PG + cron) | near-zero at low volume | zero new infra to learn; already the pattern in `netlify-site/api` | long-lived WS gateway + durable job strategy are poor fits for request-scoped functions; SPEC §2 explicitly wants a dedicated worker process with durable jobs |

## Selected option (recommended, not approved)
**A**, with the deploy boundary of **E** kept only for the notification/realtime layer if the measured volume justifies it later, and
**B** explicitly recorded as the fallback if the repo becomes too heavy for the owner's manual upload flow. Rationale: it keeps one source of truth
for contract + app while satisfying §2/§65/§81 (no premature complexity, no new vendor), and it is the only option where a Claude session can
verify the whole chain (`npm test` + `server` tests + migration dry-run) in one place.

Suggested shape once approved (illustrative, not committed):
```
server/
  package.json (workspace)         # separate test/lint/typecheck commands; never imported by src/**
  src/{api,domain,persistence,adapters,workers,gateway}/
  drizzle|kysely migrations/       # additive-first, forward+rollback files (SPEC §56)
  deploy/{docker-compose.yml,k8s-optional/}   # manifests prepared, not activated (SPEC §180)
  tests/{contract,migration,load}/
```
Environment stages: `dev → staging → prod` per SPEC §12 (issue #20 asks the same for Android); one managed PG instance with a separate
staging DB is enough at $25-class cost, PITR left to the provider (SPEC §171.4 "where provider supports it").

## Consequences
- A second CI artifact + deploy pipeline appears; `build-apk.yml` stays untouched (mobile gates remain what they are).
- `docs/DATA_MODEL.md` §1 changes: `shop_id` becomes a real column + RLS/policy test; tenant-by-DB-file stays on device for offline.
- Phase 3 (sync engine) becomes implementable against a real contract; until this ADR is approved, **no Phase 3/4 code** is written and the backlog in `docs/PHASE_0_AUDIT.md` §14 stops at P2-5.
- Vendor choice must still respect §24/§110 budget guardrails; any switch of provider needs its own ADR (SPEC §180).

## Migration / rollback
- Approving A adds files only; nothing in the mobile app changes, so rollback of the *decision* is deleting `server/` (zero data risk).
- Phase 4 rollout per SPEC §80: dark deploy → tests → internal/test tenant backup → controlled pilot sync → realtime → scale. No shop gets cloud before its own canary step passes.

## Test plan
- Contract tests generated from `docs/SYNC_CONTRACT.md` §2 (envelope validation, cursor monotonicity, idempotent replay, `already_applied`).
- Migration tests: forward + rollback on a copy of a real anonymized shop DB; "old APK ↔ new schema" compatibility test (SPEC §146.7).
- Load: 500 shops × 2,000 invoices/day replay from `scripts/generate-synthetic-dataset.mjs`; target ceilings from `docs/SLO.md` S-2/S-4/S-5/S-10.
- Backup/restore drill of the **cloud** store (SPEC §171.10) before any tenant is enabled.

## Approval status
| Field | Value |
|---|---|
| Proposed by | Claude (Phase 0 audit) |
| Approved by | — |
| Blocking until approved | Phase 3 (P3-x) and Phase 4 (P4-x) backlog items |
