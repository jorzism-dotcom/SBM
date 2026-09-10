# ENTITLEMENT_CONTRACT.md — Plans, Features, Limits, Offline Grace

> Written from (a) the code as it runs today and (b) SPEC §143/§144/§170. No plan names, prices or rules are
> invented. Where the spec's target model is absent, it is marked `MISSING` and routed to an ADR/phase.

## 1. What exists today (measured, `src/App.jsx:108–200`, `3378`)

| Element | Implementation |
|---|---|
| Feature gate | **Offline monthly license code**: `computeLicenseCode(deviceId, yearMonth)` = 6 digits taken from `SHA-256(LICENSE_SECRET + ":" + deviceId + ":" + YYYY-MM)`; `verifyLicenseCode()` accepts the **current and previous** month (built-in 1-month grace) |
| Signing secret | `LICENSE_SECRET = "SBM-Turjo-Offline-License-v1-…"` (literal value deliberately NOT copied into docs) — **hard-coded in the shipped bundle (App.jsx:130)** → violates SPEC §158 ("do not hard-code subscription plans … or secrets") and §4 ("never put … credentials in the app"). Tracked as `ADR-0001`; nothing is changed until it is approved |
| Local state keys | `sbm-license-device-id`, `sbm-license-unlocked-until` (ISO date), `sbm-license-max-seen-ts` (clock-rollback guard), `sbm-license-history` (`[{activatedAt, validUntil}]`) |
| Admin escape hatch | `computeAdminPinResetCode(deviceId, yearMonth)` = same derivation with `":ADMINPIN:"` (App.jsx:181) |
| Enforcement point | `SubscriptionGate` (skipped entirely in `OFFLINE_MODE` builds; historical bug: hanging `Preferences.get()` caused false `offline_lock` despite 30 valid days — fixed by 3s bound + localStorage mirror, App.jsx:1422-1435) |
| Payment collection | Manual: shopkeeper pays the displayed `BKASH_NUMBER` (App.jsx:3378); a `paymentInvoices` collection exists as a legacy name with no provider integration |
| Issue generator | `netlify-site/license-generator.html` (password-gated form, runs the same offline formula) + `netlify-site/oauth.html` + Vercel `api/refresh-token.js` (keeps Google `client_secret` server-side) |

**Capabilities that are entitlement-shaped today**: 7 runtime flags (14 accessor functions + `mirrorFlagToSqlite()`; 6 of them have Settings toggle components) (`isProductsBootLazyEnabled`, `isProductsNeverLoadEnabled`, `isCustomersBootLazyEnabled`, `isCustomersNeverLoadEnabled`, `isInvoicesWindowedBootEnabled`, `isPosOndemandCartEnabled`, … + setters) mirrored into SQLite `feature_flags(key, value, updated_at, device_id)` by `mirrorFlagToSqlite()`. These are **operator/experimental switches, not entitlements** — SPEC §142 requires activation to be a transaction with audit; that mapping is `MISSING`.

## 2. Required model (SPEC §143/§170) — all `MISSING` today, listed for Phase 7

- Separate concepts: **Product → Plan → Price → Entitlement → Subscription → Invoice → Payment → Credit → Refund → Usage**.
- **Immutable subscription/billing ledger** for traceability.
- Entitlements **server-authoritative**, issued as a signed token for offline clients.
- States: `trial, active, grace, past-due, suspended, cancelled, expired, reactivated` (+ scheduled plan changes with effective dates, proration).
- **Idempotency for payment creation and webhooks**; webhooks verified + idempotent.
- Admin adjustments require **approval + audit**.
- Payment providers behind **adapters** (never hard-coded: no `bKash` literal in app code — currently `BKASH_NUMBER` is).
- Subscription billing kept **separate from shop sales transactions** (`paymentInvoices` naming collision must be resolved in Phase 1 P1-3).

## 3. Offline safety (SPEC §144) — hard constraints for any future enforcement

1. Offline POS continues under an explicit entitlement/grace policy.
2. **Expiry never deletes or corrupts local business data.**
3. Grace behavior is configurable by plan (today: fixed "previous month accepted").
4. Connectivity reconciles entitlement with the server.
5. Critical security actions may require online validation.
6. Entitlement-service outages **fail safe** (app keeps working).
7. Read-only / recovery modes are preferred over destructive lockout.

Verdict: 1,2,3(partial: single hardcoded grace),6,7 are satisfied by the *absence* of enforcement today; 4,5 need Phase 7. Any change here must preserve #2 — the repo's own rule that no code path may destroy shop data.

## 4. Rollout/compatibility notes for Phase 7

- Existing installations carry no signed entitlement; migration must **not** lock anyone out: issue tokens lazily, keep the month-code path as fallback while any supported APK version exists (SPEC §146 backward-compatibility window).
- Clock dependence is the main failure mode (already bitten once — see `SubscriptionGate` history above): the `max_seen_ts` guard must be part of the token validator, and `ADR-0001` must decide whether the derivation secret stays derivable offline at all.
- Enforcement changes are Control-Plane work (SPEC §142): activation is a transaction → audited, reversible, per-tenant, canary-first.
