# Roadmap Completion Audit

## Scope and method

This audit checks every canonical Milestone 0–5 requirement in `docs/PLAN.md` against current files, tests, runtime measurements, and committed evidence. A checked roadmap item is accepted only where the evidence directly covers its scope.

The audit does **not** claim that future secret-ballot implementation review boxes are complete or that a production primary/standby appliance has been procured and independently reviewed. Those are explicit post-roadmap implementation/release gates.

## Evidence matrix

| Milestone | Canonical requirements | Direct evidence | Verdict |
| --- | --- | --- | --- |
| 0: Baseline | Project identity, stack defaults, workflow, docs/license/templates, verification | Root/backend/web manifests; `.env.example`; `docker-compose.yml`; `.gitea/workflows/verify.yml`; AGPL license/docs; Open Pilot templates; current `make verify` | Complete |
| 1: Meeting domain | Types/commands/events; deterministic decide/reduce; invariants; fixtures/CLI; behavior/property tests | `packages/meeting-domain/src`; 100 passing domain tests; canonical JSONL replay fixtures including voting strategies; `fast-check` invariants | Complete |
| 2: Private/public boundary | Experimental Lexicons; privacy allowlist; immutable approval; idempotent outbox; adapter/smoke gate | `lexicons/`; `packages/meeting-publication`; `packages/atproto-publication`; ADRs 0001/0003; 19 publication and 5 adapter tests | Complete |
| 3: Live floor | Transactional command API; resumable authenticated WebSocket; sessions/roles/UI controls; journal-backed floor; stale/reconnect behavior | `backend/src/meeting-service.ts`, `event-stream.ts`, session/store/migrations; `web/src`; ADRs 0004–0006; 37 real-PostgreSQL backend tests; 13 web tests | Complete |
| 4: Voting/security design | Counted/weighted/roll-call/threshold/plurality/ranked-choice; auditable private inputs/vectors; ElectionGuard-compatible boundary/threat/ceremony/review gate | `vote-strategies.ts`; voting/replay fixtures; ADR 0007; `docs/security/secret-ballot-*`; 100 domain tests | Complete as scoped; secret implementation remains prohibited |
| 5: LAN operations/load | Primary/standby/WAN design; backup/restore/failover/retention; reproducible 1,500-client load and failures | ADR 0008; four operations runbooks; 7 Bats safety tests; real PostgreSQL 17 backup/restore with matching canonical replay digests; authenticated harness; committed raw 1,500/reconnect/invalid/interruption results | Complete as scoped; production appliance acceptance remains future |

## Milestone 5 requirement audit

### Operations runbooks

Evidence proves the first checklist item:

- [ADR 0008](../adr/0008-primary-standby-lan-authority.md) defines single-primary authority, synchronous/degraded/fail-closed modes, fencing, explicit promotion, and optional non-authoritative WAN edge.
- [Backup/restore](../runbooks/private-journal-backup-restore.md) is implemented by executable scripts with `umask 077`, custom-format dumps, checksums, overwrite refusal, empty-target/name confirmation, and single-transaction restore.
- Seven Bats cases pass. A disposable PostgreSQL 17 round trip restored the journal and produced byte-identical canonical replay digest output.
- [Failover](../runbooks/primary-standby-failover.md), [failback](../runbooks/primary-standby-failback.md), and [retention](../runbooks/private-audit-retention.md) cover promotion, fencing, loss assessment, rebuild-only return, holds, expiry, and verified deletion.

### 1,500-client load

Evidence proves the second checklist item:

- The fixture created 1,500 distinct observer sessions; only token hashes were stored and the raw JSONL was mode `0600` and deleted after testing.
- The real API/PostgreSQL path served 1,500/1,500 initial clients through a 35-second heartbeat hold and 150/150 reconnects with zero failures.
- A 100% reconnect storm succeeded for 1,500/1,500 clients.
- Invalid sessions produced HTTP 401; API interruption produced abnormal closes and failed reconnects with nonzero harness exit.
- [The performance report](../performance/event-stream-1500-clients.md) records host/configuration, percentiles, resources, raw result digests, limitations, and the unmeasured slow-reader/high-volume replay profile.

This is a measured development-host lower bound, not evidence of production hardware, synchronous-replication, TLS/proxy, or large-replay capacity.

### Optional WAN gateway

Evidence proves the third checklist item: ADR 0008 grants the WAN gateway no database credentials, credential/session issuance, command acceptance, promotion, private journal storage, or LAN availability dependency. Every load-test URL connected directly to the LAN-local API; no WAN component participated.

## Verification evidence

- Real PostgreSQL 17 backend suite: 14 files, 37 tests passed.
- Repository gate: `CI=true make verify` passed after excluding compiled `backend/dist` tests from duplicate discovery.
- Gate coverage: TypeScript formatting/typechecks, ESLint, 100 domain tests, 19 publication tests, 5 AT Protocol adapter tests, 13 web tests, backend source tests, 7 Bats backup/restore tests, builds, Compose validation, and Open Pilot template checks.
- `git diff --check` passed.

## Remaining intentional gates

- `docs/security/secret-ballot-ceremonies.md` contains unchecked independent-review evidence because no secret-ballot implementation is authorized. Those boxes must remain unchecked.
- `docs/PLAN.md` accurately states that no cryptographically secure secret-ballot system or independently reviewed production 1,500-client appliance exists yet.
- The measured load report requires repetition on final production topology before any production capacity or availability claim.
