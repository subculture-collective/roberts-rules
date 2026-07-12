# Milestone 5A LAN Appliance Operations Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Define and verify the primary/standby LAN authority, readiness behavior, backup/restore process, failover procedure, and private audit-retention controls before load testing.

**Architecture:** PostgreSQL remains the sole durable authority. One primary appliance accepts commands; a warm standby receives PostgreSQL streaming replication and runs API/web services without accepting authoritative traffic until promotion. An optional WAN gateway terminates no meeting authority and can disappear without preventing LAN commands or journal replay.

**Tech Stack:** Node.js 22, TypeScript, PostgreSQL 17, Docker Compose, Bash operator scripts, Vitest, existing HTTP/WebSocket service

---

### Task 1: Accept the LAN authority topology

**Files:**
- Create: `docs/adr/0008-primary-standby-lan-authority.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/PLAN.md`

- [x] Record one writable primary, one non-serving warm standby, PostgreSQL streaming replication, explicit operator promotion, and fencing of the former primary.
- [x] Define recovery-point and recovery-time objectives as measured targets rather than claims: zero acknowledged-command loss during healthy synchronous operation; no automatic zero-loss claim during degraded asynchronous operation; operator promotion target under five minutes after fencing.
- [x] Define the optional WAN gateway as a stateless relay/projection edge with no database credentials, session issuance, command authority, or private journal storage.
- [x] Link ADR 0008 from the ADR index and Milestone 5.
- [x] Commit as `docs: define primary standby LAN authority`.

### Task 2: Separate liveness from database readiness

**Files:**
- Modify: `backend/src/server.ts`
- Modify: `backend/src/server.test.ts`
- Modify: `backend/src/index.ts`
- Modify: `docker-compose.yml`

- [x] Add a failing server test proving `/health` remains process liveness while `/ready` returns `503 {"status":"not_ready"}` when the injected readiness check fails.
- [x] Add a passing readiness path returning `200 {"status":"ready"}` only after a bounded PostgreSQL query confirms the server is neither in recovery nor read-only.
- [x] Keep probes unauthenticated and free of database, meeting, credential, or exception details.
- [x] Point the API Compose healthcheck at `/ready`; keep WebSocket and command authority unchanged.
- [x] Run backend tests and `CI=true make verify`.
- [x] Commit as `feat: add database readiness probe`.

### Task 3: Add deterministic backup and restore tooling

**Files:**
- Create: `scripts/backup-private-journal.sh`
- Create: `scripts/restore-private-journal.sh`
- Create: `scripts/lib/private-journal-backup.sh`
- Create: `tests/backup-private-journal.bats`
- Create: `docs/runbooks/private-journal-backup-restore.md`
- Create: `backend/src/journal-digest-cli.ts`
- Modify: `backend/package.json`
- Modify: `Makefile`

- [x] Write failing Bats tests for required environment validation, restrictive output permissions, checksum manifest creation, refusal to overwrite, and restore database-name confirmation.
- [x] Implement `pg_dump --format=custom --no-owner --no-privileges`, SHA-256 manifest generation, `umask 077`, atomic temporary files, and cleanup traps.
- [x] Implement restore into an explicitly named empty target using `pg_restore --single-transaction --exit-on-error`; never restore over the active authority database.
- [x] Document encryption-at-rest as an operator prerequisite and explicitly exclude guardian secret material and secret-ballot identity linkage.
- [x] Add `make backup-test`; run Bats plus a disposable PostgreSQL round-trip proving canonical meeting replay after restore.
- [x] Commit as `ops: add private journal backup restore tooling`.

### Task 4: Define failover and failback operations

**Files:**
- Create: `docs/runbooks/primary-standby-failover.md`
- Create: `docs/runbooks/primary-standby-failback.md`
- Modify: `docs/runbooks/README.md`

- [x] Document detection, traffic drain, client command freeze, old-primary fencing, replication-position capture, data-loss assessment, standby promotion, DNS/virtual-IP switch, readiness verification, WebSocket reconnect expectations, and incident logging.
- [x] Require a journal integrity check and explicit comparison of the last acknowledged aggregate version before reopening commands.
- [x] Document failback as rebuild-from-current-primary, never dual-primary resynchronization or reverse writes.
- [x] Include rehearsable success criteria, rollback/abort conditions, and expected commands/output for PostgreSQL 17.
- [x] Commit as `docs: add LAN failover runbooks`.

### Task 5: Define audit retention and verified deletion

**Files:**
- Create: `docs/runbooks/private-audit-retention.md`
- Modify: `docs/runbooks/README.md`
- Modify: `docs/PLAN.md`

- [ ] Classify journals, sessions, enrollments, command decisions, publication jobs, logs, backups, and future cryptographic artifacts by authority, sensitivity, retention owner, and deletion trigger.
- [ ] Require organization-approved retention durations rather than embedding a universal policy in code.
- [ ] Define legal/incident holds, backup expiry, deletion verification, restore sampling, and evidence records without copying private meeting content into tickets.
- [ ] Mark Milestone 5's operations-runbook item complete only after `CI=true make verify` and `git diff --check` pass.
- [ ] Commit as `docs: complete LAN operations foundation`.

## Separate Follow-up

Milestone 5B will build the reproducible WebSocket load harness, run it against a documented host and appliance configuration, measure 1,500 simultaneous clients, reconnect storms, slow consumers, command latency, CPU/memory/network/database pressure, and publish observed limits and failure behavior. It must not infer capacity from unit tests or synthetic connection counts alone.
