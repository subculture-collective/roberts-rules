# Milestone 3D: Meeting-Scoped Sessions Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the deny-all principal provider with short-lived, revocable, meeting-scoped browser sessions before enabling command controls.

**Architecture:** An out-of-band operator CLI creates a single-use enrollment secret whose SHA-256 hash, meeting, participant, role, and expiry are stored privately. Redemption atomically consumes it and returns a separate random session token in an HttpOnly SameSite=Strict cookie; only its hash is stored. Every HTTP request and WebSocket upgrade resolves the cookie to a non-expired, non-revoked principal bound to the requested meeting.

**Tech Stack:** Node.js crypto, TypeScript, PostgreSQL, Zod, Vitest, secure cookies.

---

## Security boundaries

- Raw enrollment and session tokens are shown once and never stored, logged, returned by list endpoints, or placed in URLs.
- Enrollment expires after 15 minutes and is single-use. Sessions expire after 30 minutes and can be revoked immediately.
- Cookies use `HttpOnly`, `SameSite=Strict`, an exact API path, and `Secure` outside explicit localhost development.
- State-changing cookie-authenticated requests require an allowed `Origin`; WebSocket upgrades enforce the same origin policy.
- Role and participant identity come only from the consumed enrollment record.
- This slice binds sessions to a browser cookie, not a cryptographic hardware/device key. Hardware-backed proof-of-possession remains a later hardening gate and must not be claimed here.

## Task 3D.1: Private enrollment and session store

**Files:** `backend/migrations/002_meeting_sessions.sql`, `backend/src/session-store.ts`, `backend/src/session-store.test.ts`.

- [ ] Test single-use enrollment consumption, expiry, session lookup, meeting mismatch, and revocation against PostgreSQL.
- [ ] Store only SHA-256 token hashes; constrain roles, expiry, and consumed/revoked timestamps in SQL.
- [ ] Consume enrollment and create the session in one locked transaction.
- [ ] Run the real PostgreSQL suite, `make verify`, and commit `feat: add meeting session store`.

## Task 3D.2: Operator enrollment CLI

**Files:** `backend/src/enrollment-cli.ts`, `backend/src/enrollment-cli.test.ts`, `backend/package.json`, `README.md`.

- [ ] Accept meeting UUID, participant ID, closed role, and optional 1–15 minute TTL; reject observer-to-chair escalation inputs outside the explicit role value.
- [ ] Generate 32 random bytes, print the raw enrollment token once, and persist only its hash.
- [ ] Test that stdout never includes database rows or hashes and stderr never includes the raw token.
- [ ] Run `make verify` and commit `feat: add private meeting enrollment CLI`.

## Task 3D.3: Cookie principal provider and redemption

**Files:** `backend/src/session-principal.ts`, `backend/src/session-principal.test.ts`, `backend/src/http.ts`, `backend/src/index.ts`.

- [ ] Add `POST /api/meetings/:id/session` redemption with a bounded JSON body and uniform invalid/expired/used response.
- [ ] Set the scoped secure cookie and return only actor ID, role, meeting ID, and expiry.
- [ ] Resolve HTTP and WebSocket principals from the cookie; reject missing, expired, revoked, or wrong-meeting sessions.
- [ ] Add origin checks, logout/revocation, cookie clearing, and tests for replayed enrollment and cross-meeting use.
- [ ] Run `make verify` and commit `feat: authenticate meeting-scoped sessions`.

## Task 3D.4: Close the slice

**Files:** `docs/adr/0006-meeting-scoped-stateful-sessions.md`, `docs/adr/README.md`, `docs/reference/stack.md`, `docs/PLAN.md`.

- [ ] Record the token lifecycle, trust boundaries, CSRF/origin policy, revocation, and remaining device-binding limitation.
- [ ] Run the real PostgreSQL suite, `make verify`, `git diff --check`, and commit `docs: complete meeting session milestone`.

