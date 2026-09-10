# ADR-0001 — Offline license signing secret & rotation

**Status: PROPOSED (awaiting owner approval)** · Date opened: 2026-09-10 · Raised by: Phase 0 audit (SPEC §158/§161)

## Problem
`src/App.jsx:130` contains `const LICENSE_SECRET = "SBM-Turjo-Offline-License-v1-…";` — a single fixed string used by every build (value not reproduced in this ADR). Monthly activation codes are
`SHA-256(SECRET + ":" + deviceId + ":" + YYYY-MM)` truncated to 6 digits (App.jsx:150-170), the same formula duplicated in
`netlify-site/license-generator.html`. Consequences today:
1. Anyone unpacking the APK (all ~500 shops distribute the same bundle) can generate valid codes for any device id.
2. The secret cannot be rotated without breaking every existing shop's ability to activate next month.
3. SPEC §158 explicitly forbids hard-coding secrets/plans in the app; SPEC §4 "never put … credentials in the app".

## Constraints
- Offline-first: activation must keep working with **no network** (SPEC §144.1; production builds are `OFFLINE_MODE=true`).
- Expiry must never delete or corrupt local business data (SPEC §144.2, repo rule).
- Cannot lock out any of the ~500 live shops, and cannot require a coordinated APK update (no OTA exists — `docs/RELEASE_CONTRACT.md` §2.3).
- The owner collects payment manually (bKash number, App.jsx:3378); there is no billing server to validate against yet.
- Existing device ids live only in Preferences (`sbm-license-device-id`) and can be lost on reinstall.

## Options
| # | Option | Pros | Cons |
|---|---|---|---|
| A | Keep as-is; accept that the gate is a **courtesy** mechanism, not security | zero risk, zero work, honest about current intent | violates §158 permanently; cannot be claimed as an entitlement system |
| B | Move the secret to a server-issued **signed entitlement token** (Ed25519 public key compiled in; private key only in the license generator/admin plane), long validity + offline grace | satisfies §143/§170 direction; secret never in app; revocable per device; works offline; auditable | requires a signing tool + migration window; old APKs (option A) remain in the field until updated |
| C | Keep the derivation but load the secret from a **per-shop private value** provisioned at install | no server dependency | no real improvement (secret still in app logic path); per-shop key management burden |
| D | Build-time inject (`VITE_*`) secret into the bundle | removes the literal from source | **security theatre** — the secret is still in the artifact; CI secret exposure; worse traceability |

## Selected option (recommended, not approved)
**B**, staged: ship B-token verification while **keeping A's code path as fallback** for any APK older than the migration
cutoff (SPEC §146 compatibility window). **D is rejected outright.** A stays acceptable if the owner decides the license
gate is intentionally non-security (document it in `docs/ENTITLEMENT_CONTRACT.md`).

## Consequences
- New trust boundary: signing key custody moves to the owner's tooling; loss of that key = loss of ability to issue codes (needs an escrow decision).
- `netlify-site/license-generator.html` must stop deriving client-side, or be replaced by a signed-token issuer behind auth (fixes `THREAT_MODEL.md` T-08 for that page).
- Clock-rollback guard (`sbm-license-max-seen-ts`) must be re-used by the token validator, not replaced.
- No data migration; purely entitlement-layer change.
- Until approved, **nothing changes** (SPEC §181).

## Migration / rollback
1. Add verifier for signed token (accepting both A-format month code and B-token) behind a flag, default off.
2. Test shop: issue B-token, verify activation + grace + clock-rollback behavior; verify a revoked device is refused without data loss.
3. Flip default for new installs only; old installs keep A until they update.
4. Rollback = flag off → A path (already live everywhere today). Zero data risk.

## Test plan
- Unit: token parse/verify/expiry/grace/skew matrices (extend `tests/logic-tests.mjs`; keep the "no network" invariant).
- Contract: `docs/ENTITLEMENT_CONTRACT.md` §1/§2 table becomes executable fixtures.
- Device: activate, expire, revoke, reinstall-with-same-device-id, cold-boot hang simulation (the historical `Preferences.get()` class of bug).
- Negative: token from another device id, replay of a used token, tampered signature, clock set back 400 days.

## Approval status
| Field | Value |
|---|---|
| Proposed by | Claude (Phase 0 audit) |
| Approved by | — (owner) |
| Approval date | — |
| Effective version | — |
