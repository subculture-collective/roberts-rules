# ADR 0001: Public AT Protocol, Private Meeting Authority

## Status

Accepted

## Context

Organizations benefit from portable public identity and verifiable approved artifacts, but meeting operations contain sensitive membership, participation, credential, deliberation, and voting data. A public protocol must not become the meeting's source of authority or leak private activity.

## Decision

AT Protocol may publish public organization identity, versioned rule profiles, meeting manifests, and aggregate outcomes explicitly approved by the secretary or chair. The private meeting journal remains authoritative.

Rosters, attendance, participation records, credentials, deliberation, individual ballots, and secret-ballot material remain private by default. Public records reference only approved artifacts and contain no material needed to reconstruct private meeting activity.

## Consequences

- Public records can be portable and independently consumed without exposing the private meeting journal.
- Publication requires an explicit approval boundary and a deliberate projection from private state.
- AT Protocol availability, credentials, and network delivery cannot determine meeting procedure.
- Integrations and tests must demonstrate that private fields never enter public records.
