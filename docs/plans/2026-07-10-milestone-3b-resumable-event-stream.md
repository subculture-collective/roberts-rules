# Milestone 3B: Resumable Meeting Event Stream Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Stream private meeting events over authenticated WebSockets with durable version-based replay after disconnects.

**Architecture:** PostgreSQL remains authoritative. Accepted command transactions emit a compact `pg_notify` wake-up only after commit; each socket then queries durable events after its last delivered aggregate version. The HTTP server handles WebSocket upgrades explicitly on the same port, and the existing `PrincipalProvider` authorizes the meeting before upgrade.

**Tech Stack:** Node.js 22, TypeScript, PostgreSQL LISTEN/NOTIFY, `pg`, `ws`, Vitest.

---

## Protocol

```text
GET /api/meetings/:meetingId/events?after=<aggregateVersion>
server -> {"type":"ready","meetingId":"...","after":3}
server -> {"type":"event","meetingId":"...","version":4,"event":{...}}
server -> {"type":"heartbeat","at":"2026-07-10T20:00:00.000Z"}
```

- Clients send no command frames. Commands remain HTTP-only.
- `after` is a nonnegative integer and means “last durably applied version.”
- Delivery is ordered and at-least-once. Clients deduplicate by aggregate version.
- Missing authentication closes the HTTP upgrade with `401`; nonexistent meetings use `404`.
- Each connection has a 256 KiB buffered-output ceiling, 30-second ping interval, and 10-second pong grace period. Slow/dead clients close with code `1013`.

## Task 3B.1: Durable wake-ups and replay queries

**Files:** `backend/migrations/002_event_notifications.sql`, `backend/src/meeting-store.ts`, `backend/src/event-source.ts`, and tests.

- [ ] Write a failing PostgreSQL test proving `loadEventsAfter(meetingId, version)` returns ordered later events only.
- [ ] Add `pg_notify('meeting_events', meeting_id)` to the accepted append transaction; notifications contain no private event payload.
- [ ] Implement a dedicated LISTEN connection that reconnects with bounded exponential backoff and invokes subscribers only as a wake-up hint.
- [ ] Run the real PostgreSQL suite, `make verify`, and commit `feat: add durable meeting event source`.

## Task 3B.2: Authenticated resumable WebSocket hub

**Files:** `backend/src/event-stream.ts`, `backend/src/event-stream.test.ts`, `backend/src/server.ts`, `backend/src/index.ts`, `backend/package.json`.

- [ ] Write a failing test connecting after version 1 and asserting ready plus ordered versions 2 and 3.
- [ ] Add explicit `upgrade` handling and authenticate with `PrincipalProvider` before `handleUpgrade`.
- [ ] On connect and every wake-up, query durable events after the socket cursor; advance the cursor only after enqueueing each frame.
- [ ] Add tests for invalid cursors, anonymous upgrades, duplicate wake-ups, reconnect replay, and client command-frame rejection.
- [ ] Add heartbeat, cleanup, and buffered-output limits; no Redis or horizontal scaling in this slice.
- [ ] Run `make verify` and commit `feat: add resumable meeting event stream`.

## Task 3B.3: Close the slice

**Files:** `docs/adr/0005-resumable-at-least-once-event-delivery.md`, `docs/adr/README.md`, `docs/reference/stack.md`, `README.md`, `docs/PLAN.md`.

- [ ] Record durable replay, at-least-once semantics, heartbeat/backpressure behavior, and the future sticky-session/Redis boundary.
- [ ] Run the real PostgreSQL suite, `make verify`, `git diff --check`, and commit `docs: complete resumable event stream milestone`.

## Acceptance gate

- [ ] Reconnect from version N yields every durable event after N in order.
- [ ] Duplicate wake-ups never change ordering and may only cause harmless duplicate delivery.
- [ ] Unauthorized clients never complete the WebSocket upgrade.
- [ ] Slow and dead clients are closed and cleaned up.
- [ ] Meeting events remain private; notifications carry meeting IDs only.
- [ ] WebSocket availability never affects command acceptance or meeting authority.

