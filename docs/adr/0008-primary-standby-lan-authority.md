# ADR 0008: Primary/Standby LAN Authority

## Status

Accepted

## Context

The meeting journal is authoritative and command acceptance is transactional. A LAN deployment needs to survive appliance failure without creating two writable authorities, silently losing acknowledged commands, or depending on an Internet service. The existing Docker Compose stack is a single-node development topology and does not provide replication or automatic failover.

WebSocket delivery is resumable and at-least-once, so clients can reconnect after a serving-node change. That transport property does not itself provide database durability, promotion safety, or split-brain prevention.

## Decision

The supported appliance topology has one writable primary and one warm standby on the meeting LAN.

- The primary PostgreSQL instance is the sole durable command authority. Only API processes routed to that primary may accept state-changing meeting commands or issue/redeem meeting credentials.
- The standby PostgreSQL instance receives PostgreSQL 17 physical streaming replication. Standby API/web processes may be prestarted for readiness testing, but authoritative traffic is not routed to them before promotion.
- Failover is an explicit operator procedure. Automation may detect and recommend promotion, but it must not create a second writable primary.
- The former primary must be fenced from client traffic and replication networks before standby promotion. Loss of fencing evidence blocks promotion.
- Promotion, traffic switching, reopening commands, and later failback require dual-operator approval and an incident record.
- Failback rebuilds the old primary as a fresh standby from the current primary. Operators never attempt dual-primary reconciliation or reverse-write divergent journals.

### Durability modes and targets

The production profile must declare one of these modes before a meeting opens:

1. **Healthy synchronous mode:** PostgreSQL acknowledges commits only after the configured synchronous standby confirms the required durable write. The measured target is zero acknowledged-command loss for a single-appliance failure while synchronous replication is healthy.
2. **Declared degraded mode:** if policy permits commands while the standby is unavailable or asynchronous, the UI/operator log must show degraded durability. No zero-loss claim is allowed. The recovery point is the last confirmed replay location on the standby, and the potential loss window must be measured and announced after failover.
3. **Fail-closed mode:** organizations that do not accept the degraded loss window freeze state-changing commands until synchronous replication returns or an approved promotion completes.

The operator-promotion target is under five minutes from confirmed primary failure **after** the former primary is fenced. This is a rehearsal target, not a current service-level claim. Detection time, fencing time, client communications, and data-loss assessment are reported separately.

### Readiness and traffic

- Process liveness and authority readiness are separate. A process may be alive while its database is unavailable, read-only, lagging beyond policy, or not promoted.
- The primary traffic endpoint routes commands and WebSocket upgrades only to an appliance that passes the production readiness contract.
- WebSocket clients reconnect with their last applied aggregate version and replay from PostgreSQL. Promotion does not change aggregate versions or permit optimistic client state.
- Health endpoints expose no meeting data, database addresses, replication credentials, positions, or internal exception text.

### Optional WAN gateway

The WAN gateway is a replaceable, optional edge. It may provide TLS termination, static assets, rate limiting, and explicitly approved public projections. It has:

- no private PostgreSQL credentials;
- no authority to create meetings, issue/redeem sessions, accept commands, promote a standby, or approve publication;
- no persistent copy of the private journal, rosters, attendance, deliberation, credentials, or ballots;
- no requirement for LAN command acceptance, event replay, backup, restore, or failover.

If remote participation is later authorized, the gateway may relay mutually authenticated traffic to the LAN authority under a separate threat model. Relay availability or compromise must not change journal state without the same server-side principal, origin, role, phase, quorum, and expected-version checks used on the LAN.

## Consequences

- The current single-node Compose file remains development-only and cannot be described as a resilient appliance.
- PostgreSQL replication state and appliance fencing become operational safety inputs in addition to application health.
- Synchronous durability trades command latency and availability for the zero acknowledged-loss target.
- Degraded operation requires an explicit organizational policy and visible loss-window disclosure.
- Backups complement replication; they do not replace it, and replication does not replace backups.
- Load testing must exercise the declared durability mode, WebSocket reconnect after promotion, slow-client eviction, and a reconnect storm without depending on a WAN service.
