# SBM Instant Boot V5

- Products and Customers are stored in dedicated chunked localStorage boot caches so a large dashboard snapshot cannot make the entire cache fail because of quota.
- Dashboard's small, already-computed home values and today's bounded operational rows are cached separately.
- On a warm start, React hydrates Products/Customers and dashboard values synchronously from the boot cache; SQLite/IndexedDB remains authoritative and refreshes in the background.
- SQLite runtime EXPLAIN diagnostics are disabled on the production critical path.

Important: the very first run after installing/updating a build cannot display data synchronously if no boot cache exists yet, because IndexedDB/SQLite APIs are asynchronous. That first successful boot seeds the V5 cache; subsequent warm launches can paint immediately from it.
