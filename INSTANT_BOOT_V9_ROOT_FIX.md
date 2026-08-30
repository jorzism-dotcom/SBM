# SBM Instant Boot V9 — Root Fix

## Problem
The app shell could render immediately, but Products/Customers remained 0 because the boot sequence waited for the SQL invoice window (`getAllRowsWindowed`) before starting the lazy Products/Customers IndexedDB reads. On real devices this created the reported 4–5 second 0-state.

## Fix
- Start Products and Customers local reads immediately after the minimal business/settings boot data is available.
- Publish `loaded=true` before the slow invoice SQL window/aggregates finish.
- Keep `bootHydrationCompleteRef=false` until authoritative boot finishes, preventing partial-state persistence.
- Skip the old delayed Product/Customer blob fallback when the new fast path already populated the state.
- Keep SQLite as authoritative; it continues refreshing in the background.

## Files
- `src/App.jsx` updated.
- `INSTANT_BOOT_V9_ROOT_FIX.md` added.
