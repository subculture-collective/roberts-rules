# Milestone 3E: Credential-Backed Command Controls Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authenticated meeting participants submit a minimal useful set of domain commands while preserving journal authority and stale-version recovery.

**Architecture:** A separate action client posts command envelopes using the session cookie and current projected version. It never mutates projected state optimistically; accepted commands arrive through the event stream. `STALE_VERSION` triggers an authoritative snapshot refresh, and command-ID conflicts surface as explicit errors.

**Tech Stack:** React 19, TypeScript, native Fetch, Vitest, meeting-domain command types.

## Task 3E.1: Session redemption and action client

**Files:** `web/src/meeting-actions.ts`, `web/src/meeting-actions.test.ts`, `web/src/meeting-client.ts`.

- [x] Test enrollment redemption, command submission, cookie credentials, pending/error states, and stale-version snapshot refresh.
- [x] Generate command IDs with `crypto.randomUUID()` and timestamps at submission; never reuse IDs for a changed command.
- [x] Return domain rejections as typed results and HTTP failures as sanitized errors.
- [x] Run `make verify` and commit `feat: add authenticated meeting action client`.

## Task 3E.2: Minimal role-aware controls

**Files:** `web/src/MeetingControls.tsx`, `web/src/MeetingControls.test.tsx`, `web/src/LiveFloor.tsx`.

- [ ] Chair controls: open, recess, resume, and adjourn according to projected phase.
- [ ] Delegate/participant controls: join or withdraw pro/con recognition queues.
- [ ] Eligible participants can cast yes/no/abstain only when a non-secret simulator vote is open.
- [ ] Disable controls while disconnected or pending; announce rejection/error text accessibly.
- [ ] Run `make verify` and commit `feat: add minimal live floor command controls`.

## Task 3E.3: Close the slice

**Files:** `README.md`, `docs/PLAN.md`, `docs/reference/stack.md`.

- [ ] Document non-optimistic command behavior and stale refresh.
- [ ] Run `make verify`, `git diff --check`, and commit `docs: complete command control milestone`.
