# Milestone 5B Event-Stream Load Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Build and run a reproducible authenticated load test for 1,500 simultaneous meeting event-stream clients, then publish measured host limits and failure behavior without making an unsupported production-capacity claim.

**Architecture:** A fixture CLI creates one disposable meeting and distinct short-lived observer sessions directly in a disposable PostgreSQL database. A separate WebSocket load CLI connects through the real HTTP upgrade, session lookup, meeting lookup, ready frame, replay cursor, heartbeat, and close paths; it emits machine-readable percentiles and failure counts. The test remains LAN-local and does not depend on the optional WAN gateway.

**Tech Stack:** Node.js 22, TypeScript, `ws`, PostgreSQL 17, Docker Compose, Vitest, macOS/Linux host metrics

---

### Task 1: Build the deterministic load metrics core

**Files:**
- Create: `backend/src/load-metrics.ts`
- Create: `backend/src/load-metrics.test.ts`

- [x] Add failing tests for nearest-rank p50/p95/p99 percentiles, zero-sample output, failure-rate calculation, and deterministic summary ordering.
- [x] Implement pure metrics functions using integer milliseconds and explicit sample counts.
- [x] Run focused backend tests.
- [x] Commit as `test: add event stream load metrics`.

### Task 2: Create disposable authenticated load fixtures

**Files:**
- Create: `backend/src/load-fixture-cli.ts`
- Create: `backend/src/load-fixture.test.ts`
- Modify: `backend/package.json`

- [x] Require `TEST_DATABASE_URL`, `LOAD_MEETING_ID`, `LOAD_SESSION_FILE`, `LOAD_SESSION_COUNT`, and exact `CONFIRM_LOAD_FIXTURE` equality before modifying data.
- [x] Migrate the disposable database, create/reset only the named fixture meeting, generate distinct random session tokens, store only SHA-256 hashes, and write raw tokens to a mode-`0600` JSONL file.
- [x] Reject counts outside `1..5000`, non-UUID meeting IDs, existing non-fixture journal events, unsafe output paths, and production-style confirmation mismatches.
- [x] Add integration coverage using disposable PostgreSQL and commit as `test: add authenticated load fixtures`.

### Task 3: Build the WebSocket load CLI

**Files:**
- Create: `backend/src/event-stream-load-cli.ts`
- Create: `backend/src/event-stream-load.test.ts`
- Modify: `backend/package.json`

- [x] Accept URL, Origin, session JSONL, connection count, ramp duration, hold duration, reconnect percentage, and per-connection timeout through validated environment variables.
- [x] Connect each client with a distinct `rr_meeting_session` cookie and `after=0`; require the expected ready frame before counting it connected.
- [x] Hold through at least one 30-second server heartbeat, close and reconnect the configured subset with jitter, and record ready latency, reconnect latency, unexpected HTTP responses, socket errors, close codes, and peak harness RSS.
- [x] Emit one canonical JSON result and nonzero exit status unless every initial/reconnect target succeeds and remains open for the hold window.
- [x] Add small deterministic integration tests against the real event stream and commit as `perf: add authenticated event stream load harness`.

### Task 4: Run and publish the 1,500-client profile

**Files:**
- Create: `docs/performance/event-stream-1500-clients.md`
- Create: `docs/runbooks/event-stream-load-test.md`
- Modify: `docs/PLAN.md`

- [ ] Record source commit, dirty state, date/timezone, OS/kernel, CPU, RAM, Node/pnpm/PostgreSQL versions, open-file limit, database topology/durability mode, API configuration, exact commands, and raw JSON result digest.
- [ ] Run 1,500 distinct authenticated clients with a controlled ramp, at least 35-second hold, and at least 10% jittered reconnects.
- [ ] Run boundary/failure profiles for invalid sessions, a reconnect storm, slow/non-reading consumers where reproducible, and database/API interruption; document observed close/error behavior.
- [ ] Publish measured p50/p95/p99 ready/reconnect latency, success/failure counts, API/harness peak RSS and CPU, database connections/load, and limitations.
- [ ] Mark the roadmap load item complete only if the real 1,500-client run succeeds; otherwise publish the measured ceiling and leave it unchecked.
- [ ] Commit as `perf: publish 1500 client event stream results`.

### Task 5: Complete Milestone 5

**Files:**
- Modify: `docs/PLAN.md`
- Modify: `docs/plans/2026-07-11-milestone-5b-event-stream-load.md`

- [ ] Confirm the WAN gateway remains optional and absent from all load-test authority paths.
- [ ] Run real PostgreSQL integration tests, `CI=true make verify`, and `git diff --check`.
- [ ] Audit every Milestone 5 statement against committed runbooks, raw results, and observed failure evidence.
- [ ] Mark Milestone 5 complete only when all three canonical checklist items have direct evidence.
- [ ] Commit as `docs: complete LAN appliance milestone`.
