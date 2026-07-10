# ADR 0006: Meeting-Scoped Stateful Sessions

## Status

Accepted

## Context

Private HTTP commands and WebSocket projections require server-derived identity and immediate revocation. Browser-stored bearer JWTs would complicate revocation and increase exposure to script access.

## Decision

Operators issue short-lived single-use enrollment tokens out of band. The database stores only SHA-256 hashes. Redemption atomically consumes the enrollment and creates a separate 30-minute session whose raw token is returned only in an HttpOnly, SameSite=Strict, meeting-path-scoped cookie. Production cookies are Secure.

Sessions bind participant identity and a closed meeting role to one meeting. HTTP requests and WebSocket upgrades resolve that server-side record and reject expired, revoked, cross-meeting, or wrong-origin use. State-changing requests require the configured application Origin. Logout revokes the database session and clears the cookie.

## Consequences

- Session revocation is immediate and does not depend on token expiry.
- Raw enrollment/session tokens never enter database rows, logs, URLs, or response JSON.
- Cookie theft remains possible on a compromised browser. These sessions are browser-bound operational credentials, not hardware-backed proof of possession.
- Hardware/device key binding requires a later threat model and implementation review.
- Initial meeting creation remains an out-of-band operator bootstrap until organization-level administration is designed.
