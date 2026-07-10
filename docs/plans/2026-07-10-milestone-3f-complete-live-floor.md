# Milestone 3F: Complete Live Floor Controls Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path: dispatch a fresh subagent per task, review each result, then continue. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Complete the non-secret live-floor workflow using only authenticated domain commands and authoritative event projections.

**Architecture:** Focused React control modules emit existing `MeetingCommand` values through `MeetingActionClient`. No control edits local meeting state. Forms derive availability from role, phase, quorum, and active-question state; accepted results arrive through the journal stream.

**Tech Stack:** React 19, TypeScript, Tailwind, Vitest, meeting-domain commands.

## Task 3F.1: Journal-backed presence

- [x] Add check-in/check-out controls for authorized attendance managers using private participant IDs and assigned roles.
- [x] Display present participants and quorum from projected attendance without adding ephemeral socket presence.
- [x] Reuse the projection client's duplicate/reconnect coverage and commit `feat: add journal-backed meeting presence`.

## Task 3F.2: Agenda and motion controls

- [x] Add chair agenda adoption and advance controls with bounded item forms, matching domain authority.
- [x] Add introduce, second, amend, withdraw, table, and dispose motion forms gated by domain-relevant projected state.
- [x] Test role visibility and disabled states, then commit `feat: add agenda and motion controls`.

## Task 3F.3: Debate and vote administration

- [ ] Add chair debate open/close controls with explicit recorded deadline.
- [ ] Add teller/chair vote open/close/record controls; keep the UI labeled non-secret simulator.
- [ ] Add point-of-order and appeal controls for eligible roles.
- [ ] Test payloads and commit `feat: add debate and vote administration controls`.

## Task 3F.4: Close Milestone 3

- [ ] Update README, stack reference, and `docs/PLAN.md`; do not claim secure or binding voting.
- [ ] Run real PostgreSQL tests, `make verify`, `git diff --check`, and commit `docs: complete live floor milestone`.
