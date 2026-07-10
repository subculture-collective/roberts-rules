# ADR 0004: Transactional Private Meeting Journal

## Status

Accepted

## Context

Live clients can disconnect, retry commands, and race at the same aggregate version. Browser state and delivery order cannot become procedural authority.

## Decision

PostgreSQL stores the private authoritative meeting journal and every accepted or rejected command decision. A command transaction locks the meeting row, checks durable command-ID idempotency, reconstructs state from ordered events, calls the pure meeting aggregate, appends accepted events, records the decision, and advances the aggregate version atomically.

The HTTP boundary derives actor identity and role from an injected `PrincipalProvider`; request bodies cannot assert either value. The default provider denies all access until production credential issuance is implemented. WebSocket streams and browser views will be replaceable projections of this journal.

## Consequences

- Same-version commands serialize; one may advance and later contenders receive `STALE_VERSION`.
- Retrying the same command ID and canonical request returns the stored decision. Reusing it with different content returns `COMMAND_ID_CONFLICT`.
- Rejected commands create no events but remain durably idempotent.
- HTTP, WebSocket delivery, and PWA state cannot rewrite meeting history.
- Production deployment remains blocked on meeting-scoped authentication and authorization.
