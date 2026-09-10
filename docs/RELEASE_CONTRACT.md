# RELEASE_CONTRACT.md — Versions, Compatibility, Rollout

> Current release engineering is real and working; what is missing is *governance* (compatibility windows,
> staged rollout, per-device outcome, emergency rollback). Measured from `.github/workflows/build-apk.yml`
> (424 lines), `generate-keystore.yml`, `netlify-site/`, and `src/App.jsx:3817-3845`.

## 1. Current release pipeline (measured)

| Aspect | Reality |
|---|---|
| Trigger | `push` to `main`/`master` (always OFFLINE build) or `workflow_dispatch` with `online_release: boolean` (default `false`) |
| Version | **auto `1.0.<github.run_number>`** ("Compute semantic app version"), `versionCode` = run number; never bumped by hand. Injected as `VITE_APP_VERSION` → `APP_VERSION` (`v…`), `APP_VERSION_CODE` in the app |
| Build id | `VITE_BUILD_ID` = `$(date -u +%Y%m%d-%H%M)-${GITHUB_SHA::7}` → `APP_BUILD` (traceable artifact↔commit) |
| Mode switch | `OFFLINE_MODE_VAL=true` unless `online_release=true`; production = offline, cloud/Firebase/staff-login stripped (SPEC §43/§78 friendly) |
| Gates in CI | ESLint (errors only block; 577 warnings tolerated), typecheck (**only `src/logic.js` + `src/schemas.js`** — `App.jsx` out of `jsconfig` scope), logic+schema+integration tests, **fuzz tests block the build**, Stryker mutation report (informational, `src/logic.js`) |
| Packaging | `npx cap add android` (no `android/` in repo) → icons/splash generated in CI → google-services.json + Google Auth `server_client_id` into `strings.xml` → manifest permissions → signed `app-release.apk` (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` secrets; SHA-1 printed for Firebase) |
| Distribution | artifact `sbm-apk-v<run>[-OFFLINE]`, **retention 30 days**; OFFLINE APK is *not* published — handed to the one shop's phone manually. Public GitHub Release only when `online_release=true`, plus cleanup keeping the last 15 releases |
| Discovery by admin tooling | `netlify-site/api/gh-releases.js` (Vercel function, 5-min cache, optional `GH_TOKEN`, CORS allow-list incl. `capacitor://localhost`) |
| Removed | `firestore-rules` + `release-canary` jobs (Firestore-emulator rules/canary that gated `build`) were **deleted on 2026-07-30 (Session C)** because Firebase left the app → **there is currently no canary/rollout gate in CI** while the repo's permanent rule #6 still demands canary rollout |

## 2. Contract required by SPEC §146 / §167 / §173 (all `MISSING` unless noted)

1. **Release manifest** per version, consumed by app/admin plane: `app_version`, `min_server_version`,
   `supported_sync_protocol` range, `schema_compatibility_range`, `required_migrations[]`, `channels`.
   Today: none (only `APP_VERSION`/`APP_BUILD` strings, visible on the hidden version tap at App.jsx:37680).
2. **Compatibility windows**: backward-compatible API/sync windows so late-updating devices keep working.
   Needed because ~500 shops update manually; enforced by §146 + SPEC §27 ("no breaking API/schema change without a compatibility period").
3. **Minimum-supported-version enforcement** (SPEC §169 last item) — does not exist; without it a shop can stay on
   a build whose SQLite migration assumptions are stale.
4. **Channels**: `dev → staging → canary → progressive production` with device/platform-specific rollout
   (SPEC §128/§173). Today "canary" = "give the APK to one shop's phone", with **no recorded cohort state**.
5. **Signed artifacts + integrity verification** — partly: APK is signed with the release keystore ✔; there is no
   published digest/signature the app or the admin page verifies, and no checksum in the release body.
6. **Emergency disable / rollback policy** (SPEC §172, §183) — none defined. Only manual: revert commit → new APK.
7. **Migrations compatible with old + new clients during rollout** (SPEC §146) — the SQLite additive-only + IndexedDB
   dual-write discipline already enforces this locally (repo permanent rule #1: never delete the old path); must become
   an explicit CI check, not a comment.
8. **Release train + deprecation calendar** and **per-device update outcome** reporting — needs the device fleet table
   (SPEC §147) from Phase 6; until then the admin site shows releases, not who installed them.
9. **Store policy compliance**: silent updates are prohibited on Android for sideloaded apps → SPEC §146's
   "compliant update prompts" is the only allowed in-app path; today the app never prompts.

## 3. Immediate, low-risk improvements available without any ADR

These are additive and don't change runtime behavior — proposed as Phase 1/2 backlog items, not done in this phase:

- Emit `release-manifest.json` as a CI artifact (version, build id, schema `user_version`, migration list, APK SHA-256) and attach it to the GitHub Release body → makes #1/#5 true with no app change.
- Restore a **canary gate job** in CI (replacement for the deleted `release-canary`): publish only when `online_release=true` **and** a cohort file (`docs/CANARY.md`) lists the target shops; block `main` merges that touch `src/db/schema.sql` without an added migration test.
- Record `keystore` password hygiene: `generate-keystore.yml` ships **default values `sbm@****` (redacted)** for store/key passwords (lines 6-20) — see `docs/THREAT_MODEL.md` T-07 (must not stay as defaults; workflow should require them).

## 4. Relationship to the in-flight SQLite program

`SQLITE_MIGRATION_LOG.md` is the operational release log for the *data* side (flags, per-shop rollout, real-device
verification gates). This file governs the *binary* side. Both agree on one rule: **never ship a change that removes
the fallback path until 4–6 weeks of production stability prove the new path** (SPEC §23/§28, repo permanent rule #1).
