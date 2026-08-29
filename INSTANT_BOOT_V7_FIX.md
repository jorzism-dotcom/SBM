# SBM Instant Boot V7

## Root-cause fix

V7 addresses the remaining boot behavior where Products/Customers stayed at 0 until the SQLite browse query completed.

### Changes
- `src/App.jsx`
  - Local boot payloads are read even when the cache meta record is missing/corrupted.
  - Legacy `sbm-products` / `sbm-customers` are used as an emergency paint cache.
  - When a valid product+customer paint cache exists, the app is marked UI-ready immediately; authoritative IndexedDB/SQLite boot continues in the background.
  - Successful boot-cache writes also mirror Products/Customers to the legacy keys for resilience.
- `index.html`
  - Branding splash is hidden immediately; it is no longer a data-loading overlay.

This does not make SQLite synchronous. It makes the first paint independent of the SQLite query whenever a local paint snapshot exists.
