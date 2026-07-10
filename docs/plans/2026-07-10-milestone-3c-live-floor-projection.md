# Milestone 3C: Live Floor Projection Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only, role-aware live-floor dashboard driven only by authoritative snapshots and resumable meeting events.

**Architecture:** A framework-independent client fetches a snapshot, opens the authenticated WebSocket after that version, applies consecutive events with the meeting-domain reducer, ignores duplicates, and refreshes after gaps. React consumes this projected state; it never invents procedural state or exposes command controls before credential work exists.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, Vitest, native Fetch/WebSocket, meeting-domain reducer.

---

## Task 3C.1: Reconnecting projection client

**Files:** `web/src/meeting-client.ts`, `web/src/meeting-client.test.ts`, `web/package.json`.

- [x] Test snapshot hydration, ordered event application, duplicate suppression, gap-triggered refresh, and reconnect from the last applied version.
- [x] Implement injected Fetch/WebSocket factories, exponential reconnect with jitter, and an explicit `connecting|live|reconnecting|closed|error` status.
- [x] Never queue meeting commands in this client; it is read-only.
- [x] Run `make verify` and commit `feat: add live meeting projection client`.

## Task 3C.2: Role-aware live-floor dashboard

**Files:** `web/src/LiveFloor.tsx`, `web/src/LiveFloor.test.tsx`, `web/src/App.tsx`, `web/src/styles.css`.

- [ ] Render phase/version, quorum, agenda, active motion, recognition queues, debate deadline, and non-secret simulator vote status from `MeetingState` only.
- [ ] Add chair/secretary/parliamentarian context panels without command controls; participant and observer views omit private operational details not needed by their role.
- [ ] Preserve the editorial/industrial design, responsive layout, semantic headings, visible focus, and text alternatives for status color.
- [ ] Render an authentication-required state honestly when no principal/session exists.
- [ ] Run `make verify` and commit `feat: add role-aware live floor dashboard`.

## Task 3C.3: Close the slice

**Files:** `README.md`, `docs/PLAN.md`, `docs/reference/stack.md`.

- [ ] Document read-only projection/reconnect semantics and keep command controls unchecked.
- [ ] Run `make verify`, `git diff --check`, and commit `docs: complete live floor projection milestone`.
