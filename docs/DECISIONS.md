# DECISIONS.md — Index of **approved** ADRs

Per SPEC §161 this file lists approved architectural decisions only. Per SPEC §181 Claude may propose an ADR but
**may not approve** one — so this index starts empty and stays empty until the owner signs a decision.

## Approved decisions

| # | ADR | Approved on | Scope of effect |
|---|---|---|---|
| — | *none yet* | — | — |

## Open proposals (not decisions — current architecture remains authoritative)

| ADR | Topic | Blocks |
|---|---|---|
| ADR-0001 | Offline license secret & rotation | Phase 7; `THREAT_MODEL.md` T-01 |
| ADR-0002 | Firebase-era dead code + outbox sink | Phase 1 (P1-3); Phase 2 (P2-2) |
| ADR-0003 | Provider adapters & key custody | Phase 1 (P1-5); `THREAT_MODEL.md` T-02 |
| ADR-0004 | SQLite transactions, outbox ordering, `user_version` | Phase 2 (P2-1, P2-2, P2-3) |
| ADR-0005 | Cloud backend topology / hosting / stage | Phase 3, Phase 4 (all cloud work) |

## Decisions that are *already fixed by SPEC §180* (owner-decided; Claude must not re-open)

Database PostgreSQL + SQLite · cache = Redis-compatible abstraction, activated only where measured · event bus = interfaces now,
Kafka adapter later · orchestration = manifests prepared, Kubernetes not required · service mesh = boundary only ·
multi-region = not active-active without ADR + DR test · payment provider = adapter, chosen by owner/config ·
cloud/VPS provider = provider-neutral interfaces · realtime = acceleration signal, durable sync authoritative ·
conflict resolution = documented deterministic rules only · Tax/VAT = configurable + validated against official requirements ·
security-sensitive ambiguity = STOP + ADR.

## How to approve

Add a line to the first table (ADR id, date, one-sentence scope) and set the ADR's `Status:` to `ACCEPTED`.
Approving means implementation may proceed exactly as written in that ADR; any deviation needs a new ADR.
