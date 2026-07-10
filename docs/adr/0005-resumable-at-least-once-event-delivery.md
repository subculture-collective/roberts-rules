# ADR 0005: Resumable At-Least-Once Event Delivery

## Status

Accepted

## Context

Meeting clients disconnect, reconnect, and may miss in-memory broadcasts. Realtime delivery must not become a second source of procedural truth.

## Decision

WebSocket clients connect to a meeting stream with the last aggregate version they durably applied. The server authenticates the meeting principal before upgrade, sends a ready frame, and queries PostgreSQL for every event after that cursor in aggregate-version order.

Accepted event transactions issue a PostgreSQL notification containing only the meeting ID. Notifications are wake-up hints; sockets always query the durable journal and advance their cursor after enqueueing each event. Delivery is at-least-once, and clients deduplicate by aggregate version.

The server sends WebSocket ping frames every 30 seconds, closes clients that miss the next heartbeat, rejects client data frames, and closes slow clients whose buffered output exceeds 256 KiB.

## Consequences

- Disconnects and duplicate notifications do not lose durable events.
- WebSocket availability cannot affect command acceptance or meeting authority.
- Notifications do not contain private event payloads.
- The current implementation is single-instance. Horizontal deployment requires sticky connections plus a reviewed cross-instance wake-up mechanism; Redis is not introduced until that need exists.
