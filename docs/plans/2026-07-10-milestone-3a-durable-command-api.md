# Milestone 3A: Durable Private Command API Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add a private HTTP command boundary that durably loads a meeting journal, calls the existing deterministic aggregate, atomically appends accepted events, and records every command decision.

**Architecture:** Keep procedure in `meeting-domain`. The backend adds PostgreSQL repositories and a transaction-scoped application service; HTTP only validates input, supplies an authenticated principal, and maps stable results. This slice stops before WebSockets and the meeting UI, but exposes a versioned state snapshot endpoint for later clients.

**Tech Stack:** Node.js 22, TypeScript, PostgreSQL 17, `pg`, Zod, Vitest, Docker Compose, and `@subculture/roberts-rules-meeting-domain`.

---

## Boundaries

- The database journal is authoritative; HTTP request order and browser state are not.
- The server derives `actorId` and `role` from a `MeetingPrincipal`. It rejects envelopes that try to provide either field.
- Milestone 3A uses an injected principal provider. Tests use a fixed provider; production credential issuance and device binding are a separate 3B prerequisite before public deployment.
- One database transaction locks the meeting row, checks command idempotency, replays the journal, decides, appends accepted events, stores the decision, and advances the version.
- Accepted and rejected decisions are durable. Reusing a command ID with a different request hash returns `COMMAND_ID_CONFLICT`.
- No WebSocket, browser command controls, secret voting, or production authentication is added here.

## Target files

| Path | Responsibility |
| --- | --- |
| `backend/migrations/001_meeting_journal.sql` | Meetings, events, and command-decision schema. |
| `backend/src/db.ts` | Pool creation and transaction helper. |
| `backend/src/meeting-store.ts` | PostgreSQL persistence port and implementation. |
| `backend/src/meeting-service.ts` | Transactional create, decide, replay, and snapshot use cases. |
| `backend/src/principal.ts` | Private authenticated meeting-principal interface. |
| `backend/src/http.ts` | Zod request schemas and JSON route handlers. |
| `backend/src/server.ts` | Server composition only. |
| `backend/test-support/postgres.ts` | Isolated test database setup and migration runner. |
| `backend/src/*.test.ts` | Repository, service, HTTP, concurrency, and idempotency coverage. |

## Task 3A.1: Add the journal schema and test database harness

**Files:**

- Create: `backend/migrations/001_meeting_journal.sql`
- Create: `backend/src/db.ts`
- Create: `backend/test-support/postgres.ts`
- Create: `backend/src/db.test.ts`
- Modify: `backend/package.json`

- [x] **Write a failing migration test** that applies migrations twice and asserts the three tables and uniqueness constraints exist.

```ts
it("applies the meeting journal schema idempotently", async () => {
  await migrate(pool);
  await migrate(pool);
  await expectTable(pool, "meetings");
  await expectTable(pool, "meeting_events");
  await expectTable(pool, "command_decisions");
});
```

- [x] **Run the test and confirm RED.**

```bash
pnpm --filter @subculture/roberts-rules-api test -- db.test.ts
```

Expected: failure because the migration runner and schema do not exist.

- [x] **Create the schema.** Use `UUID` meeting IDs, `BIGINT` aggregate versions, `JSONB` profiles/events/decisions, and these keys:

```sql
CREATE TABLE IF NOT EXISTS meetings (
  id uuid PRIMARY KEY,
  profile jsonb NOT NULL,
  aggregate_version bigint NOT NULL DEFAULT 0 CHECK (aggregate_version >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS meeting_events (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  aggregate_version bigint NOT NULL,
  event jsonb NOT NULL,
  PRIMARY KEY (meeting_id, aggregate_version)
);
CREATE TABLE IF NOT EXISTS command_decisions (
  meeting_id uuid NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  command_id text NOT NULL,
  request_hash text NOT NULL,
  decision jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, command_id)
);
```

- [x] **Implement `withTransaction(pool, callback)`** with `BEGIN`, `COMMIT`, and guaranteed `ROLLBACK` on error. Never expose a checked-out client after callback completion.
- [x] **Run the focused test and `make verify`.** Expected: all checks pass.

## Task 3A.2: Implement the persistence port

**Files:**

- Create: `backend/src/meeting-store.ts`
- Create: `backend/src/meeting-store.test.ts`
- Modify: `backend/package.json`

- [ ] **Write a failing integration test** proving `lockMeeting` blocks concurrent mutation, events return in aggregate-version order, and a stored decision can be fetched by command ID.

```ts
export interface MeetingStore {
  createMeeting(id: string, profile: RulesProfile): Promise<void>;
  lockMeeting(id: string): Promise<StoredMeeting | null>;
  loadEvents(id: string): Promise<MeetingEvent[]>;
  findDecision(id: string, commandId: string): Promise<StoredCommandDecision | null>;
  appendEvents(id: string, expectedVersion: number, events: MeetingEvent[]): Promise<void>;
  storeDecision(id: string, commandId: string, requestHash: string, decision: Decision): Promise<void>;
}
```

- [ ] **Run the focused test and confirm RED.** Expected: missing `PostgresMeetingStore`.
- [ ] **Implement parameterized SQL only.** `lockMeeting` must use `SELECT ... FOR UPDATE`; `appendEvents` must reject non-consecutive versions and update `meetings.aggregate_version` with the locked expected version.
- [ ] **Add rollback coverage.** Force a duplicate event version and assert neither the meeting version nor decision row changes.
- [ ] **Run the focused tests and `make verify`.** Expected: all checks pass.

## Task 3A.3: Add the transactional application service

**Files:**

- Create: `backend/src/meeting-service.ts`
- Create: `backend/src/meeting-service.test.ts`
- Modify: `backend/package.json`

- [ ] **Write a failing tracer test** that creates a meeting, submits `InitializeMeeting`, and reads the resulting canonical snapshot.

```ts
export interface MeetingPrincipal { actorId: string; role: MeetingRole }

export interface SubmitCommandInput {
  meetingId: string;
  commandId: string;
  expectedVersion: number;
  occurredAt: string;
  command: MeetingCommand;
}

submitCommand(principal: MeetingPrincipal, input: SubmitCommandInput): Promise<Decision>;
```

- [ ] **Run the test and confirm RED.** Expected: missing service.
- [ ] **Implement the service transaction.** Hash canonical `{meetingId, principal, input}` with SHA-256; return a byte-equivalent stored decision for the same ID/hash; return `COMMAND_ID_CONFLICT` for the same ID with a different hash; otherwise replay events, call `decide`, append accepted events, and store either outcome.
- [ ] **Add rejection tests** for nonexistent meeting, stale version, forbidden role, and duplicate rejected commands. Assert rejected commands never add journal events.
- [ ] **Add a two-client concurrency test.** Submit two commands at the same expected version and assert exactly one can advance the journal while the other receives `STALE_VERSION` after acquiring the row lock.
- [ ] **Run focused tests and `make verify`.** Expected: all checks pass.

## Task 3A.4: Expose the private HTTP boundary

**Files:**

- Create: `backend/src/principal.ts`
- Create: `backend/src/http.ts`
- Create: `backend/src/http.test.ts`
- Modify: `backend/src/server.ts`
- Modify: `backend/src/index.ts`

- [ ] **Write failing HTTP tests** for:

```text
POST /api/meetings                 -> 201 meeting metadata
POST /api/meetings/:id/commands    -> 200 accepted or rejected Decision
GET  /api/meetings/:id/snapshot    -> 200 canonical state and latest version
```

- [ ] **Test the authority boundary.** A request containing `actorId` or `role` must return `400 ENVELOPE_AUTHORITY_FORBIDDEN`; missing principal returns `401 AUTHENTICATION_REQUIRED`.
- [ ] **Implement `PrincipalProvider`.** The default provider returns no principal. Tests inject a fixed principal; do not add header-based actor or role impersonation.

```ts
export interface PrincipalProvider {
  authenticate(request: IncomingMessage, meetingId?: string): Promise<MeetingPrincipal | null>;
}
```

- [ ] **Implement bounded JSON parsing.** Reject bodies above 64 KiB, malformed JSON, unknown command variants, invalid UUIDs/datetimes, and unknown keys with stable JSON error codes.
- [ ] **Map service outcomes without leaking SQL or private journal rows.** Return `404` for missing meetings, `409` for command-ID conflict, and `200` for domain rejections such as `STALE_VERSION`.
- [ ] **Run focused tests and `make verify`.** Expected: all checks pass.

## Task 3A.5: Document and close the slice

**Files:**

- Create: `docs/adr/0004-transactional-private-meeting-journal.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/reference/stack.md`
- Modify: `README.md`
- Modify: `docs/PLAN.md`

- [ ] **Record the authority decision:** PostgreSQL journal and stored decisions are authoritative; HTTP, WebSocket, and browser projections are replaceable delivery layers.
- [ ] **Document local migration and test commands** without including credentials or private meeting fixtures.
- [ ] **Leave WebSockets and PWA controls unchecked** in Milestone 3. Link their future plans from `docs/PLAN.md` only when written.
- [ ] **Run final gates.** Expected: `make verify`, `git diff --check`, and all PostgreSQL integration tests pass.

## Milestone 3A acceptance gate

- [ ] Journal append, meeting version update, and decision storage are atomic.
- [ ] Accepted and rejected command IDs are idempotent; mismatched reuse conflicts.
- [ ] Concurrent same-version commands serialize and produce one stale decision.
- [ ] HTTP cannot supply actor identity or role.
- [ ] Snapshots are reconstructed from the authoritative journal.
- [ ] `make verify` passes without adding WebSockets or browser command controls.
