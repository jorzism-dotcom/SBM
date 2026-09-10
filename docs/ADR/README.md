# docs/ADR/ — Architecture Decision Records

Per SPEC §181: *Claude may create an ADR proposal but may not approve it.* Every file here therefore has
`Status: PROPOSED (awaiting owner approval)`. Until an ADR is approved, **the current architecture remains
authoritative** — which means: no code change implied by an open ADR is made.

Required sections (SPEC §181): Problem · Constraints · Options · Selected option · Consequences ·
Migration/Rollback · Test plan · Approval status.

| ADR | Topic | Blocks | Status |
|---|---|---|---|
| [ADR-0001](ADR-0001-offline-license-secret-and-rotation.md) | Hard-coded license signing secret | Phase 7 (enforcement changes), `THREAT_MODEL.md` T-01 | PROPOSED |
| [ADR-0002](ADR-0002-legacy-firebase-fss-and-outbox-sink.md) | Fate of Firebase-era dead code + disabled outbox sink | Phase 1 P1-3, Phase 2 P2-2 | PROPOSED |
| [ADR-0003](ADR-0003-provider-adapters-and-key-custody.md) | LLM/SMS/Drive key custody & adapters | Phase 1 P1-5, `THREAT_MODEL.md` T-02 | PROPOSED |
| [ADR-0004](ADR-0004-sqlite-transactions-and-outbox-ordering.md) | Atomic SQLite transactions + outbox durability ordering | Phase 2 P2-1/P2-2/P2-3 | PROPOSED |
| [ADR-0005](ADR-0005-cloud-backend-topology-and-stage.md) | Where Phase 4's backend lives, who hosts it, which budget stage | Phase 3, Phase 4 (all cloud work) | PROPOSED |

Index of **approved** ADRs: `docs/DECISIONS.md` (currently empty, by design).
