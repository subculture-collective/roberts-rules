# ADR 0007: ElectionGuard-Compatible Secret-Ballot Boundary

## Status

Accepted

## Context

The meeting aggregate currently records voter-keyed ballots for deterministic, non-secret procedural simulation. Secret ballots require a different authority boundary: eligibility must be enforced without retaining an identity-to-ballot link, encrypted ballots must remain independently verifiable, guardian secrets must be isolated, and a complete election record must be produced without exposing sensitive material.

ElectionGuard end-to-end verifiability requires confirmation codes, a cast-or-challenge path, and sufficient published artifacts for independent verification. Its specification and serialization formats evolve together, so compatibility cannot be claimed without pinning and testing an exact pair of versions.

## Decision

The current meeting aggregate, command API, browser UI, PostgreSQL journal, and AT Protocol publisher do not implement secret ballots. The existing `counted`, `rollCall`, `weighted`, `plurality`, and `rankedChoice` methods remain explicitly non-secret simulations.

A future isolated ballot subsystem will own:

- redemption of one-time eligibility authorizations that cannot be linked back to a submitted ciphertext by the ballot subsystem alone;
- ballot preparation and encryption on a hardened voting device or client;
- mutually exclusive cast or challenge finalization;
- confirmation-code issuance;
- append-only encrypted-ballot storage;
- guardian key and tally ceremonies;
- encrypted tallying, verifiable decryption, and complete election-record production;
- verification against one pinned ElectionGuard design and serialization version.

The private meeting journal may record only:

- a ballot authorization or contest identifier that contains no voter identity-to-ciphertext mapping;
- the approved manifest hash, ceremony identifier, and pinned compatibility versions;
- an immutable election-record digest and location;
- independent verifier reports and their digests;
- an aggregate outcome approved through the existing publication boundary.

The meeting journal must never contain plaintext selections, ballot nonces, guardian secret keys or backups, decrypted cast ballots, browser session identifiers next to ballot ciphertexts, or any identity-to-confirmation-code/ciphertext mapping. Ordinary application logs, metrics, traces, and backups have the same prohibition.

Encrypted ballots and election-record artifacts do not enter AT Protocol records by default. ADR 0001 and ADR 0003 continue to permit only deliberately approved public projections. Publishing a complete ElectionGuard election record requires a separate policy decision about audience, retention, metadata leakage, and immutable hosting; an aggregate outcome alone is not a complete independently verifiable election record.

There is no administrator master decryption key and no chair override for cryptographic verification. Loss of the required guardian quorum fails closed.

## Consequences

- Secret-ballot cryptography cannot be added as another branch in the current `MeetingCommand` tally logic.
- Authentication and eligibility remain meeting concerns, while ballot secrecy requires a one-way handoff into a separately operated subsystem.
- The existing browser cookie session is insufficient proof of a hardened voting device and cannot be presented as such.
- Meeting-database backup and restore cannot recover guardian private material.
- A verifier supporting the pinned ElectionGuard version must accept the produced record before an outcome can be represented as cryptographically verified.
- The project must retain non-cryptographic contingency procedures because endpoint compromise, coercion, traffic analysis, and guardian quorum loss are not eliminated by ElectionGuard.

## References

- [ElectionGuard official specifications](https://electionguard.vote/spec/)
- [Creating a verifiable election](https://electionguard.vote/concepts/Verifiability/)
- [ElectionGuard election record](https://electionguard.vote/develop/Election_Record/)
- [ElectionGuard versioning](https://electionguard.vote/develop/Versioning/)
