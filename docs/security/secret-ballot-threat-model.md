# Secret-Ballot Threat Model

## Status and Scope

This is a design-time threat model for the future ballot subsystem defined by [ADR 0007](../adr/0007-electionguard-compatible-secret-ballot-boundary.md). No secret-ballot implementation exists. Re-run this model against concrete code, dependencies, devices, network topology, and operating procedures before implementation approval and before every production release.

In scope:

- meeting authorization handed to an isolated ballot subsystem;
- voting clients/devices, encrypted-ballot storage, guardians, ceremonies, tallying, verification, and election-record hosting;
- interactions with the private meeting journal, meeting-scoped sessions, LAN appliance, optional WAN gateway, logs, metrics, traces, and backups.

Out of scope:

- the already implemented non-secret simulator tally algorithms;
- AT Protocol availability as a source of meeting authority;
- physical-site controls not yet specified. Missing physical controls are recorded as required mitigations, not assumed protections.

## Deployment Assumptions

- A primary/standby LAN appliance serves a meeting of up to 1,500 connected clients; an optional WAN gateway may relay traffic but is not authoritative.
- Participants begin with meeting-scoped browser sessions. Those cookies are bearer credentials and are not hardware-bound ([ADR 0006](../adr/0006-meeting-scoped-stateful-sessions.md)).
- The private PostgreSQL journal remains the procedural authority ([ADR 0002](../adr/0002-event-sourced-chair-controlled-procedure.md), [ADR 0004](../adr/0004-transactional-private-meeting-journal.md)).
- Individual ballots and secret material remain outside public AT Protocol artifacts ([ADR 0001](../adr/0001-public-atproto-private-meeting-authority.md)).
- Guardians are independent people using separately administered devices. If one organization controls every guardian device, guardian collusion and common-mode compromise become high-likelihood threats.

## Security Objectives and Assets

1. **Ballot secrecy:** no party below the approved guardian threshold can learn a cast selection or link voter identity to ciphertext, confirmation code, network event, or decrypted selection.
2. **Eligibility and uniqueness:** only eligible representatives vote, and each authorization produces at most one final cast ballot while permitting the specified challenge/revote flow.
3. **Cast as intended:** voters can challenge an encrypted ballot and compare the opened selection to their intent.
4. **Recorded as cast:** voters can locate their confirmation code in the final record without the code revealing selections.
5. **Tallied as recorded:** independent verifiers can validate ballot proofs, aggregation, decryption, manifest/version binding, and record completeness.
6. **Availability and recoverability:** voting can finish or fail closed under documented procedures without a master decryption bypass.
7. **Audit integrity:** ceremony transcripts, manifests, encrypted ballots, verifier reports, approvals, and record digests are immutable and attributable.

High-value assets are guardian secrets/backups, eligibility authorizations, plaintext selections and nonces, identity/linkage metadata, encrypted ballots, manifest and ceremony parameters, confirmation codes, tally shares, the election record, verifier reports, signing keys, device images, and operational logs/backups.

## Trust Boundaries and Entry Points

| Boundary | Entry points | Required security property |
| --- | --- | --- |
| Meeting authority → authorization issuer | Chair/secretary opens a ballot; roster snapshot | Signed manifest and eligibility set; no ballot choices cross this edge |
| Authorization issuer → voter | One-time authorization delivery/redemption | Unforgeable, single-use, short-lived, and unlinkable after redemption |
| Voter → voting client/device | Selections, cast/challenge decision | Hardened UI/device, local secrecy, explicit finalization, no sensitive telemetry |
| Voting device → ballot box | Ciphertext, proofs, device/chain data, confirmation code | Authenticated append, schema/proof validation, replay prevention, traffic unlinkability |
| Ballot box → guardians | Frozen encrypted set and tally | Completeness commitment, immutable close, pinned manifest/specification |
| Guardian ↔ guardian/coordinator | Key ceremony, backups, tally shares | Mutual authentication, transcript verification, independent devices, threshold enforcement |
| Ballot subsystem → meeting journal | Contest state and final verified aggregate | Digests and aggregate references only; never identity/ciphertext linkage or secrets |
| Election record → verifier/approved audience | Immutable artifact download | Complete versioned record, content digest, independent hosting/verification |
| Runtime → operations systems | Logs, metrics, traces, crash dumps, backups | Denylist sensitive fields; retention and access controls; tested deletion |

## Attacker Capabilities

Realistic attackers may possess a stolen meeting cookie, control a participant browser, observe LAN/WAN timing and IP metadata, submit malformed/replayed requests, compromise one service or one guardian device, operate a malicious voting device, control the optional gateway, truncate or replace hosted artifacts, or cause resource exhaustion. Insiders may be chair, administrator, teller, operator, guardian, or hosting administrator.

The model does not assume an attacker can break correctly implemented standard cryptography, compromise a threshold of genuinely independent guardians simultaneously, or defeat well-run physical procedures without detection. Those non-capabilities cease to apply if implementation review, guardian independence, or ceremony observation is weak.

## Prioritized Abuse Paths

| ID | Abuse path and impact | Likelihood / impact / priority | Existing controls | Required controls and verification | Residual risk |
| --- | --- | --- | --- | --- | --- |
| SB-01 | Operator correlates session identity with ciphertext using request order, IP, timing, confirmation-code delivery, logs, or device IDs. Ballot secrecy fails without decrypting anything. | High / High / **Critical** for remote browsers | ADR 0007 forbids stored linkage; public/private projection boundary | Blind or privacy-preserving one-time authorization exchange; decouple issuer and ballot box; batch/mix submissions; minimize timestamps/device identifiers; separate logs/operators; test with a correlation-focused privacy assessment using production-equivalent telemetry | Global traffic observers and small anonymity sets can still correlate; remote voting may remain unsuitable for high-coercion elections |
| SB-02 | Stolen cookies, replayed authorizations, issuer compromise, or race conditions create extra ballots or suppress an eligible voter. | Medium / High / **High** | Meeting-scoped sessions, single-use enrollment, transactional journal | Separately signed short-lived eligibility credentials; atomic redemption; one cast finalization per credential; challenged credentials may reissue only through an audited state machine; concurrency and replay tests; reconcile issued/redeemed/cast/challenged counts without identity linkage | Issuer can deny service or target credential delivery; independent count reconciliation detects but may not prevent it |
| SB-03 | Malware or a malicious voting device changes selections before encryption, falsely displays intent, leaks plaintext, or always discourages challenge. | High / High / **Critical** on unmanaged browsers | None sufficient; ElectionGuard proofs do not establish honest UI input | Managed/verifiable device baseline; signed reproducible builds; secure boot/attestation where appropriate; accessible human-verifiable review screen; randomized challenge audits; independent device penetration test; incident procedure | Endpoint compromise and coercion cannot be eliminated cryptographically; paper or supervised fallback may be required |
| SB-04 | Enough guardians collude, share backups, or use commonly compromised devices, revealing ballots or producing an unauthorized tally. | Low if independent, High if centrally managed / High / **High** | Planned threshold ceremony; no master key | Document guardian count/threshold; independent organizations/devices/admin accounts; authenticated in-person or mutually authenticated ceremony; encrypted per-recipient backups; transcript verification by every guardian and observer; collusion/common-mode review | The threshold group is intentionally trusted; governance and physical independence remain essential |
| SB-05 | Ballot box, coordinator, gateway, or host omits/replaces ballots, manifests, verifier reports, or the election record; voters/verifiers see different views. | Medium / High / **High** | Append-only meeting journal does not cover the future ballot store | Hash-chain or signed append commitments; frozen close digest witnessed by multiple roles; immutable content-addressed record; multi-channel digest publication; confirmation-code inclusion checks; two independent verifiers; equivocation test | Availability attacks can delay publication; detection may require a revote rather than repair |
| SB-06 | Implementation accepts malformed proofs, wrong parameters, or a different ElectionGuard/serialization version; a valid-looking but unverifiable result is approved. | Medium / High / **High** | ADR 0002 versions rules; no crypto implementation exists | Pin exact design, serialization, constants, schemas, and verifier versions in manifest; reject unknown/downgraded versions; official vectors plus independently generated negative vectors; independent verifier interoperability; dependency/SBOM review | Specification defects or correlated verifier bugs remain; use independently implemented verifiers |
| SB-07 | Challenge/spoil requests are suppressed, converted to cast, selectively failed, or opened incorrectly, defeating cast-as-intended evidence. | Medium / High / **High** | None implemented | One explicit irreversible cast-or-challenge state transition; confirmation before finalization; challenged ballot excluded from tally and verifiably opened; reconcile state counts; monitor challenge rates without voter linkage; usability and adversarial tests | Coercion and malicious UI can discourage challenges; statistical challenge assurance depends on actual voter behavior |
| SB-08 | Guardian loss, corrupted backups, disaster, or unavailable quorum makes decryption impossible; an operator bypass exposes secrets or invents a result. | Medium / High / **High** | Primary/standby application plan; ADR 0007 forbids master key | Verify encrypted guardian backups during ceremony; geographically/administratively separate custody; tally and disaster-recovery rehearsal; fail closed; documented revote/adjournment rule; never include guardian secrets in meeting backups | Correct fail-closed behavior can still make an election unrecoverable and require a revote |
| SB-09 | Flooding encryption/proof validation, connection exhaustion, oversized records, or WAN disruption prevents voting or closing. | Medium / Medium to High / **Medium** | Planned LAN authority and optional non-authoritative WAN gateway | Bounded schemas and proof sizes; admission/rate limits after authorization; queue/backpressure; capacity test at 1,500 clients with crypto workload; offline LAN operation; explicit close extensions and checkpoint recovery | A local network or power failure can still interrupt the ceremony; procedural continuation rules are required |
| SB-10 | Plaintext selections, nonces, guardian material, identity links, or confirmation-code mappings leak through debug logs, traces, crash dumps, support exports, browser storage, or backups. | Medium / High / **High** | ADR 0001 privacy boundary; ADR 0007 prohibition | Structured sensitive-data inventory; compile-time/runtime redaction; no request-body tracing on ballot routes; encrypted segregated storage; least-privilege access; retention/deletion tests; backup-content scan; incident response exercise | Memory inspection or compromised endpoints may expose transient secrets; minimize lifetime and harden hosts |
| SB-11 | A voter uses the client, screenshots, remote control, or a coercer to prove/sell a selection. | Medium / High in adversarial organizations / **High** | Confirmation codes should not reveal selections | Do not expose cast-ballot plaintext or reusable receipts; challenged ballots are never counted; adopt supervised/paper fallback and anti-coercion procedures; legal/policy review | ElectionGuard does not solve remote coercion or vote buying; residual risk may be unacceptable for some meetings |

## Security Requirements Derived from the Model

Release is prohibited unless the implementation demonstrates:

- unlinkability testing across authorization, network, application, log, backup, and election-record datasets;
- atomic eligibility redemption and cast/challenge state transitions under concurrent replay;
- manifest, option limits, guardian parameters, device data, ballots, proofs, tally shares, and election-record schema validation;
- exact ElectionGuard design/serialization version binding and downgrade rejection;
- threshold enforcement with no administrator, chair, database, or backup bypass;
- immutable close commitments, confirmation-code inclusion, complete record generation, and at least two independent verifier reports;
- operational capacity, failover, key-loss, guardian-loss, artifact-loss, and revote rehearsals;
- explicit acceptance of remaining endpoint, traffic-analysis, and coercion risk by the organization using the system.

## Review Triggers

Re-run and re-approve this model when the pinned ElectionGuard version changes; the browser/device model changes; a WAN or cloud service becomes authoritative; guardian count/threshold/custody changes; election records become publicly hosted; eligibility credentials change; new telemetry is enabled; or a security incident affects sessions, ballots, guardians, signing keys, or build infrastructure.

## External References

- [ElectionGuard official specifications](https://electionguard.vote/spec/)
- [ElectionGuard structure and processes](https://electionguard.vote/concepts/Structure_and_Processes/)
- [Creating a verifiable election](https://electionguard.vote/concepts/Verifiability/)
- [ElectionGuard serialization specification](https://electionguard.vote/spec/Serialization_Spec/)
