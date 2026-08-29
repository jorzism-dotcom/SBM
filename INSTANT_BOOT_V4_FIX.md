# SBM Instant Boot V4

- Business-scoped localStorage boot snapshot (`sbm_instant_boot_v4:<businessType>`).
- Warm start paints Products, Customers, Dashboard data synchronously from the last successful snapshot.
- Dashboard snapshot includes recent operational arrays used by KPI/cards; SQLite remains authoritative and refreshes in the background.
- Snapshot writes are debounced and quota protected.
- V3 snapshots are accepted once for upgrade.
- SQLite cold-start EXPLAIN/warm-up/health diagnostics are disabled in production so diagnostic PRAGMA/EXPLAIN calls cannot sit on the startup path.

## Important technical constraint
Capacitor SQLite is asynchronous. A truly first-ever launch cannot synchronously read fresh SQLite rows before the first React paint. The no-loading guarantee therefore comes from a previously saved local boot snapshot; the first launch after installation/migration must create that snapshot once.
