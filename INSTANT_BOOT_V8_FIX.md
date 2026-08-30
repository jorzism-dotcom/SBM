# SBM Instant Boot V8

## Critical fix
V7 introduced a malformed JavaScript statement in `index.html` immediately before `window.__hideSplash` was defined. The browser/WebView could not parse that inline script, so the splash remained visible indefinitely.

V8 restores valid JavaScript and defines `window.__hideSplash` before invoking it. The branding splash is hidden immediately instead of waiting for SQL/IndexedDB/auth/data loading.

## Files changed from V7
- `index.html` — fixed malformed inline JavaScript and immediate splash hide.
- `INSTANT_BOOT_V8_FIX.md` — this note.

No other source files were changed in V8.
