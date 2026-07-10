# ADR 0002: Event-Sourced, Chair-Controlled Procedure

## Status

Accepted

## Context

Chair-led meetings need deterministic rule enforcement, a visible history of rulings and exceptional actions, and reliable recovery after client or network failure. Mutable browser or database projections cannot provide that audit trail alone.

## Decision

One deterministic meeting aggregate accepts versioned commands and emits immutable, strictly ordered events. Replaying the append-only journal reconstructs authoritative meeting state; databases, APIs, and clients are projections or transports around that aggregate.

The chair controls recognition and rulings. A chair or parliamentarian may apply an exceptional correction only with a recorded reason and a reference to the affected event or entity. Corrections append compensating events and never rewrite prior history.

## Consequences

- The same journal and rules profile must produce byte-equivalent canonical state on replay.
- Command decisions require role, phase, quorum, and expected-version checks within the aggregate.
- Clients recover from stale state by resuming or replaying the authoritative event stream.
- The event schema and rules profiles require explicit versioning and compatibility discipline.
- The journal exposes reasoned overrides for audit instead of hiding exceptional procedure.
