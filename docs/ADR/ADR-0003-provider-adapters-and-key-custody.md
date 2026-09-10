# ADR-0003 — External-provider adapters & key custody (LLM, SMS, Drive)

**Status: PROPOSED (awaiting owner approval)** · Date opened: 2026-09-10 · Source: Phase 0 audit §6, `docs/THREAT_MODEL.md` T-02

## Problem
24 `fetch(` sites live inside `src/App.jsx` business logic (SPEC §158: "Do not put cloud/network calls inside POS business logic"):
- **Anthropic**: `App.jsx:6535`, `6566`, `6605`, `11032` → `POST https://api.anthropic.com/v1/messages` with `x-api-key` taken from
  Settings storage and header `anthropic-dangerous-direct-browser-access: true`, model hard-coded `claude-sonnet-4-20250514`.
- **SMS**: three provider branches hand-coded in one function — Twilio REST (`6685`), `sslwireless.com` (`6694`), `bulksmsbd.net` (`6700`, `6706`),
  with `user`/`pass`/`api_key` interpolated into URLs.
- **Google Drive**: OAuth userinfo (`42741`), token refresh via `sbm-admin-mocha.vercel.app/api/refresh-token` (`3884`, `42899`),
  Drive v3 file CRUD (`43053`–`43224`).
Consequences: provider keys are extractable from the device, provider model/endpoints are hard-coded (SPEC §158 "do not hard-code …
payment providers, feature flags"), no timeout/retry/backoff policy, no per-call observability, no rate limiting, and switching provider is
a code change in a 43,680-line file.

## Constraints
- **Offline-first**: SMS/AI are enhancements; the POS must work fully without them (SPEC §78). Local template fallback already exists
  (`generateSMS()` uses `DEFAULT_SMS_TEMPLATES` when no key — App.jsx:6527-6531) and must be preserved.
- SPEC §2: providers are adapters behind interfaces; SPEC §162.10 the same; SPEC §167: rate limiting + correlation IDs live on the server side.
- Budget stage: ≤ $25/month (SPEC §110) — no new paid service; the existing Vercel function pattern is already deployed and free-tier.
- Multi-tenancy: gateways are configured per shop (accountSid/apiKey/senderId come from settings) — the abstraction must keep per-tenant config, not global.
- ~500 shops may have manually configured credentials today; no config migration may break sending.

## Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | Status quo | nothing | violates §158/§162.10; keys on device; no observability |
| B | Client-side **adapter classes** only (`LlmAdapter`, `SmsAdapter`, `DriveAdapter`) — same direct network calls, same keys, just moved out of components | satisfies layering/UI rule cheaply; testable with fakes; zero runtime behavior change | key custody unchanged (T-02 stays) |
| C | B **+ server-side proxy for credentials** (Vercel functions: `/api/llm`, `/api/sms` holding keys per tenant; app sends only intent) | removes keys from device; single place for timeout/retry/rate-limit/correlation-id; reuses existing `refresh-token.js` pattern; enables usage metering for Phase 7 billing | new functions to build+secure; needs auth so the proxy is not an open relay; adds a network dependency for optional features (must stay non-blocking) |
| D | Full egress broker in the future backend (Phase 4) | architecturally ideal | premature — Phase 4 does not exist; would block Phase 1 hygiene |

## Selected option (recommended, not approved)
**B now, C as Phase 12/13 follow-up**, D explicitly deferred to Phase 4 (SPEC §81: prepare interfaces now, do not pay operational cost early).
Rule for B: business logic may call `adapters/*` only; `no-restricted-globals`-style lint gate makes `fetch(` outside `src/adapters/` a build error.
Hard-coded model name and provider URLs move into the adapter's config object with current values as defaults (no behavior change).

## Consequences
- `App.jsx` shrinks by the ~4 network blocks; POS paths get a fakeable seam, enabling offline tests (SPEC §165).
- The `x-api-key` + `anthropic-dangerous-direct-browser-access` pattern must be recorded as a **known risk until C lands** (do not pretend B fixes it).
- Per-tenant gateway config stays user-owned; no secret ever goes in the repo (SPEC §4).
- Rate limiting/quotas belong to C, not B — SLO S-12 stays "not measured".
- Until approved, no code moves (SPEC §181).

## Migration / rollback
1. B: extract adapters (mechanical), keep call order/semantics byte-for-byte; flag not needed (pure refactor) but land as its own commit for revertability.
2. C: add proxy behind a per-shop opt-in setting; if proxy fails → fall back to today's direct call path (kept during rollout), then remove fallback after 4–6 weeks.
3. Rollback B = revert refactor commit. Rollback C = per-shop setting off. Zero data impact in both.

## Test plan
- Unit: adapter contract tests with injected fetch fake — success, non-2xx, timeout, no-key→template path (assert SMS text equals today's template output).
- Contract: `tests/` assertion "no `fetch(` outside `src/adapters/`" as a CI gate (SPEC §66).
- Fuzz: template rendering for arbitrary customer names/amounts (existing `fast-check` setup).
- Real-device: send one SMS + generate one AI text + one Drive backup round-trip on a test shop, per area.
- Golden-master: `npm run test:golden-master` unchanged (formulas untouched).

## Approval status
| Field | Value |
|---|---|
| Proposed by | Claude (Phase 0 audit) |
| Approved by | — |
