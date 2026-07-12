# Milestone 6: Usable Authenticated Meeting Session Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Keep every slice runnable, run `make verify`, and commit each completed boundary. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing private meeting authority usable from a browser without weakening the meeting-scoped session boundary.

**Architecture:** The public landing page remains at `/`; `/meetings/:meetingId` discovers or redeems a scoped HttpOnly session, then composes the snapshot, WebSocket, and command clients around the authoritative journal. Disposable fixtures create isolated meetings and single-use enrollment tokens for development and browser tests.

**Tech Stack:** React, TypeScript, Node HTTP, PostgreSQL, Vite proxying, WebSocket, and Playwright.

---

## Completed Slices

- [x] Add current-session discovery and same-origin HTTP/WebSocket development proxying.
- [x] Add UUID meeting routing, paste-only enrollment, live projection, role-aware controls, reconnect states, and logout.
- [x] Add a local-only disposable meeting fixture with chair, secretary, delegate, and observer enrollment tokens.
- [x] Add isolated multi-browser tests for restoration, authorization, multi-client delivery, reconnect catch-up, revocation, token ephemerality, and responsive layout.
- [x] Preserve the non-secret, non-binding simulator boundary and run `make test-e2e` plus `CI=true make verify`.

## Acceptance

A developer can run `make dev`, create a meeting with `make dev-fixture`, open the printed URL, paste one printed token, and operate the live floor according to that session's role. Raw tokens never enter URLs or browser storage, and Playwright deletes only its generated meeting records.
