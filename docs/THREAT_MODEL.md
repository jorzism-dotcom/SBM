# THREAT_MODEL.md — Security Boundaries & Threats

> Scope: SBM Android app (Capacitor 6 WebView), its local stores (SQLite + IndexedDB + Preferences), the custom
> `capacitor-backup-service` plugin, and the two Vercel functions in `netlify-site/`. Findings are **measured at
> `e2dc756`** with file:line. Severity is about the real deployment context: ~500 shops, 3 active shopkeepers with
> money/stock data, sideloaded APKs, no server-side auth yet. Per SPEC §158, Claude reports and does **not**
> unilaterally "fix" security-sensitive design (→ `ADR-0001`, `ADR-0003`).

## 1. Assets

| Asset | Why it matters | Where it lives |
|---|---|---|
| Sales/invoice/ledger data | direct money records | SQLite (per `businessType`) + IndexedDB blobs |
| Customer PII (name, mobile, baki history) | legal/ethical exposure; bulk-SMS lists | same |
| Supplier/expense/cash records | business confidentiality | same |
| Backup files in Google Drive | full business history | user's own Drive (`drive.file` scope) |
| Owner PIN / admin PIN-reset derivation | only gate to the app | Preferences (`sbm-offline-owner-pin-hash`) + code |
| Third-party provider credentials (Anthropic, SMS gateways, Google OAuth) | billable/abusable | Settings storage in-app; `client_secret` in Vercel function (correct place) |

## 2. Trust boundaries

```
[Shopkeeper human] → [Capacitor WebView / React UI (App.jsx)]        ← app-level gate only (6-digit PIN)
        → [Zustand store / logic.js / sync.js]                        ← same process, same trust
        → [SQLite via @capacitor-community/sqlite native bridge]      ← device-local, no per-user ACL
        → [IndexedDB (WebView profile)]                               ← device-local
        → [Vercel functions: refresh-token, gh-releases]              ← unauthenticated HTTP surface
        → [Google APIs (Drive, OAuth), Anthropic, 3 SMS providers]    ← third parties, called from the client
```

There is **no authenticated server and no per-actor authorization inside the app**: anyone who unlocks the phone
profile can read/write everything. SPEC §169 (identity, sessions, RBAC, scopes) and §162.6/§162.14 (server-side tenant
isolation, auditable privileged ops) are the phases that change this.

## 3. Findings

| ID | Finding | Evidence | Impact | Severity | SPEC rule broken | Action |
|---|---|---|---|---|---|---|
| T-01 | **License signing secret hard-coded in the shipped bundle** | `src/App.jsx:130` `LICENSE_SECRET = "SBM-Turjo-Offline-License-v1-…"` (literal value deliberately NOT copied into docs); same formula re-implemented in `netlify-site/license-generator.html` | anyone unpacking the APK can mint valid monthly codes for any device forever; no revocation possible | High | §158 "do not hard-code … secrets"; §4 "never put … credentials in the app" | `ADR-0001` (rotation/model) — do not patch ad hoc |
| T-02 | **Provider keys handled in the WebView** | `App.jsx:6535/6566/6605/11032` `fetch("https://api.anthropic.com/v1/messages", { headers: { "x-api-key": anthropicKey, "anthropic-dangerous-direct-browser-access": "true" }})`; SMS at 6656-6706 build URLs with `user/pass/api_key` | key extraction from device/memory or logs; billing abuse; SMS credit theft | High | §4/§158 (adapters, no secrets in app) | `ADR-0003`: move to a proxied adapter (the existing Vercel pattern), keep offline fallback (templates already exist when no key) |
| T-03 | Owner PIN: **unsalted SHA-256 of a 6-digit value** | `App.jsx:19349` `SHA-256("sbm_owner_" + pin)` stored in Preferences; 10^6 space, fixed pepper in code | offline brute force ≈ trivial if the device/backup is obtained | Medium-High | §162.14 privileged ops auditable; §169 secure credential lifecycle | replace with Argon2id/PBKDF2-HMAC (the app already has PBKDF2 with **600,000** iterations for backups — reuse that KDF) once §169 starts; no behavior change before |
| T-04 | Keystore generation workflow ships **default passwords** `sbm@****` (redacted) (store & key), and prints the generated keystore | `.github/workflows/generate-keystore.yml:6-20` | if run with defaults, the release signing key is guessable → supply-chain (malicious APK signed with the same key) | High (one-time, but key is permanent) | §146 signed artifacts | make inputs `required` without defaults; store keystore only in Actions secrets; document a key-rotation ADR |
| T-05 | Cleartext + mixed content enabled | `capacitor.config.json`: `"cleartext": true`, `"android.allowMixedContent": true` (`androidScheme: https`, `webContentsDebuggingEnabled: false` ✔) | network sniffing/downgrade on shop Wi-Fi; mixed content weakens WebView TLS guarantees | Medium | §173/§176 hardening | turn both off after auditing the 24 `fetch` sites (all https today); keep `allowNavigation` as-is |
| T-06 | Broad `allowNavigation` (accounts.google.com, \*.googleapis.com, github.com, \*.githubusercontent.com) | `capacitor.config.json` | OAuth flow needs it, but any in-app link click can leave the sandboxed origin | Medium-Low | §145 consent-boundary hygiene | narrow to exact hosts used by the OAuth/Drive redirect; verify `oauth.html` redirect_uri |
| T-07 | Backup crypto is strong but **user-passphrase-only** | `deriveKeyFromPin()` PBKDF2-SHA256, `PBKDF2_ITERATIONS = 600000`, AES-256-GCM, `CRYPTO_MAGIC="SBM-ENC-V1"` (App.jsx:7725-7775) | a weak passphrase is the whole security; code itself warns the user that a lost passphrase is unrecoverable | Low-Medium (design, documented) | §171 | add optional device-bound recovery envelope; enforce passphrase length at UI; keep read-only recovery mode (SPEC §144.7) |
| T-08 | Vercel functions are the only real attack surface exposed to the internet | `netlify-site/api/refresh-token.js` (CORS allow-list incl. `capacitor://localhost`, `http://localhost`; accepts `code`/`refresh_token` in POST body), `api/gh-releases.js` (5-min cache, optional `GH_TOKEN`), `license-generator.html` behind a **client-side** password field | token theft/relay for user Drive files; `license-generator` gate is trivially bypassable if the page logic is client-side; CORS `http://localhost` widens browser-origin access | High for the generator | §172 (admin plane needs authn/z, audit), §145 | move license generation behind the same authenticated admin plane; never allow `http://localhost` origins in production function; add rate limit (SPEC §167) |
| T-09 | No central error/log redaction; logs contain business data | `logErrorToCentral()` is a **no-op** (`App.jsx:1419`); 74 `console.warn` + 12 `console.error`; `DiagLog.js` keeps 400 timing entries locally | today = good for privacy (nothing leaves the device), but future support-bundle exports must be redacted (SPEC §172 "redacted diagnostic bundles") | Low now / High when remote support ships | §145 | write the redaction contract **before** any upload feature exists |
| T-10 | Dead-but-present cloud code paths | 239 firebase/Firestore mentions in `App.jsx`; `SyncOutbox` writes durably to a disabled sink; `useFSSCollection` no-op | confusion risk: a future session re-enabling a legacy path would start pushing data to a project that may no longer exist/been audited | Medium (hygiene) | §159 (behavior is source of truth) | `ADR-0002` decide: delete vs isolate under `src/legacy/` |
| T-11 | Multi-device merge can overwrite money records | `src/sync.js:150 mergeCollection()` — LWW by `effectiveTs()`, tombstone-protected; 24 tests | if a cloud/manual merge is ever used across devices, the losing device's invoice edit disappears | High (latent) | §4 "never blind LWW for financial operations", §53 | Phase 3 P2-3/idempotency + correction workflow, not a merge tweak |
| T-12 | Device identity is a random string in Preferences | `LICENSE_DEVICE_ID_KEY` App.jsx:123/136 | no hardware attestation, no revocation; easy to clone/impersonate a device | Medium | §169 device trust/revoke | Phase 6 |

## 4. STRIDE summary per boundary

| Threat | Where | Mitigations present | Mitigations missing (SPEC phase) |
|---|---|---|---|
| Spoofing | app unlock, Drive OAuth, device id | Google OAuth via server-held `client_secret`; local PIN; `max_seen_ts` clock guard | device trust/attestation, sessions, MFA (§169) |
| Tampering | SQLite/IndexedDB, invoices, stock | void+return flows, `validateBackup()` checksum, `reconcileStore()`, schema guards (`schemas.js`, shadow mode), no silent mutation of voided invoices (filters on `status='active'`) | append-only ledger + DB-enforced uniqueness, hash-chained audit (§162.7 → Phase 2) |
| Repudiation | privileged ops | `auditLogs` collection (in-memory/IndexedDB), `events` table with `device_id`+`ts` | SQLite-backed audit store, retention, operator audit (§162.14) |
| Information disclosure | backups, PII, keys | AES-256-GCM PBKDF2 backups, `drive.file` scope only, no telemetry, `webContentsDebuggingEnabled:false` | T-02, T-05, T-08 fixes; redaction contract (§145) |
| Denial of service | shop operations | restore guard, empty-backup guard, boot fallbacks, flag-off safety, WAL checkpointing, `getDb()` cold-boot race fix (log entry 57) | rate limiting (§167), quota/backpressure, chaos tests (§178) |
| Elevation of privilege | admin PIN reset, dev panel, license | PIN required; dev tools behind hidden version tap | server-side authorization, short-lived scoped support sessions (§145/§172) |

## 5. Non-goals of this file

No new cryptographic scheme is proposed here, no rotation is executed, and nothing in §3 is applied — each item is a
**documented finding** routed either to an ADR for owner approval or to a SPEC phase that defines the correct design
(SPEC §158: "If a truly missing business rule blocks implementation, STOP and create an ADR; do not silently decide").
