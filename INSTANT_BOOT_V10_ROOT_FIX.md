# V10 Root Boot Fix

The startup delay was caused by the boot path waiting on SQLite work before publishing the existing local UI data.

V10 restores the pre-SQL startup contract:

- Products, customers, invoices and transactions are read from the existing IndexedDB store first.
- `loaded=true` is published after that local UI-critical read.
- SQLite invoice/windowed refresh continues after the UI is already visible.
- Products/Customers SQL browse may still run for pagination, but the screen has the already-hydrated IndexedDB arrays as its first-paint fallback.
- Existing SQLite migration, dual-write and background refresh behavior remains intact.

This is not a cache-only workaround; it uses the same IndexedDB data that made the app appear immediately before the SQLite cutover.
