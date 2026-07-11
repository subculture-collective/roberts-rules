# Secret-Ballot Ceremonies, Recovery, and Review Gate

## Status

Design gate only. This document defines evidence required before implementation or deployment. It does not certify the current application for secret ballots.

## Roles and Separation of Duties

| Role | Authority | Prohibited combination |
| --- | --- | --- |
| Meeting chair/secretary | Approves contest, eligibility snapshot, opening/closing, and final procedural disposition | Cannot decrypt, alter ciphertexts, or waive verification |
| Eligibility issuer | Converts the approved roster snapshot into one-time voting authorizations | Cannot observe ciphertexts, confirmation codes, or selections |
| Ballot-box operator | Maintains encrypted append-only ballot state and produces close commitment | Cannot issue eligibility, hold guardian secrets, or approve outcome |
| Voting-device custodian | Provisions and attests approved client/device images | Cannot act as every guardian or verifier |
| Guardian | Holds one threshold share; verifies ceremonies and contributes approved messages | Cannot unilaterally decrypt or alter the manifest |
| Ceremony coordinator | Relays authenticated public ceremony messages and assembles transcripts | Holds no guardian secret and cannot change threshold parameters after approval |
| Independent verifier | Verifies parameters, ballots, aggregation, decryption, challenges, and record completeness | Cannot rely only on producer-generated pass/fail output |
| Security reviewer/observer | Reviews implementation, privacy, operations, and evidence | Cannot be the sole implementer or system operator |

At least two people must approve manifest freeze, voting close, election-record digest, and verifier acceptance. Guardian independence must be evaluated by device administration, employer/organization, physical custody, and communication channel—not merely by assigning different usernames.

## Compatibility Profile

Before code begins, an implementation ADR must pin:

- one ElectionGuard design specification version;
- its compatible serialization specification and JSON schemas;
- cryptographic parameter/constants set and hash conventions;
- one producing core/library version and immutable source/build digest;
- at least two independently implemented verifier versions and digests;
- supported ballot styles and limits, including whether weighted or ranked contests are supported by that exact profile.

The profile must be exercised against official sample records plus project-owned positive and negative vectors. Unknown versions, mixed version artifacts, altered constants, unsupported optional fields, and schema extensions fail closed. A version upgrade is a new security release, not a dependency patch.

## Pre-Election Ceremony

### 1. Contest and manifest approval

1. Chair and secretary approve contest text, option identifiers/order, selection limits, ballot style, eligibility cutoff, open/close rules, challenge/revote policy, guardian count `n`, decryption quorum `k`, and contingency procedure.
2. The system canonicalizes the manifest and compatibility profile, computes their digests, and displays them through two independent channels.
3. Two approvers sign the manifest digest. Any later change creates a new contest and invalidates all prior ceremony artifacts.

Required evidence: human-readable manifest, canonical manifest, compatibility profile, digests, signatures, approval time, and reason for any abandoned predecessor.

### 2. Guardian selection and readiness

1. Record each guardian’s role, independence rationale, authenticated contact channel, device custody, backup custodian, and conflict disclosure.
2. Provision guardians on separately administered, patched, encrypted devices from reproducible signed builds.
3. Confirm clocks, offline/isolated ceremony network where feasible, malware scan/attestation, removable-media policy, and observer access.
4. Guardians authenticate each other using a channel established outside the coordinator.

Required evidence: guardian roster without private keys, device/build digests, independence review, authentication fingerprints, observer list, and readiness checklist.

### 3. Threshold key ceremony

1. Coordinator publishes the frozen manifest/profile digest, `n`, `k`, guardian identifiers, and session nonce.
2. Each guardian generates secret material locally using an approved entropy source and publishes only specified public commitments/proofs.
3. Per-recipient backups are authenticated and encrypted to their intended guardian. Recipients verify backups and publish verification acknowledgements.
4. Every guardian independently verifies the complete transcript and resulting guardian/election public record before signing readiness.
5. Two independent verifiers validate the public ceremony artifacts with the pinned profile.
6. Private working files are reduced to the minimum required custody set; temporary plaintext and coordinator copies are destroyed with recorded evidence.

The ceremony aborts on missing acknowledgements, proof failure, identifier/version mismatch, transcript disagreement, unapproved device change, or inability to verify required backups. Retrying creates a new ceremony identifier and keys.

### 4. Voting-device provisioning

1. Load only the signed manifest, election public data, device identifier policy, and approved ballot client build.
2. Verify configuration/build digests at startup and before opening voting.
3. Start the required ballot/confirmation-code chaining state according to the pinned profile.
4. Run a challenge test ballot through encryption, opening, independent verification, and exclusion from the tally.
5. Freeze device enrollment. Replacement devices require dual approval, a new device record, and chain-continuity procedure defined by the pinned profile.

### 5. Open authorization

Voting may open only after chair, secretary, ballot-box operator, guardian quorum, and independent verifier sign a readiness record containing the manifest digest, election public-data digest, device set, eligibility count commitment, ceremony transcript digest, compatibility profile, and test-ballot result.

## Voting Operations

### Eligibility handoff

1. The eligibility issuer creates one short-lived, single-use authorization per active representative from the approved roster snapshot.
2. Redemption uses a blind or equivalently privacy-reviewed exchange so the issued credential cannot later be matched to a ballot-box credential or ciphertext by either service alone.
3. Issuance, redemption, challenge replacement, revocation, and expiry are separate auditable states. Audit reconciliation exposes counts and commitments, never an identity-to-ballot table.
4. A stolen meeting cookie alone is insufficient where the approved risk profile requires managed-device or second-factor proof.

### Prepare, cast, or challenge

1. The client validates the signed manifest/profile and presents the complete human-readable contest before accepting selections.
2. It encrypts selections, creates required proofs/device data, and obtains the confirmation code before final disposition.
3. The voter chooses exactly one irreversible final action:
   - **Cast:** append the encrypted ballot to the cast set; never decrypt it individually.
   - **Challenge:** exclude it from the tally, open it using the pinned ElectionGuard procedure, verify it matches the displayed selections, and issue a new authorization if policy permits another attempt.
4. The voter receives a confirmation code and instructions that the code proves inclusion/status only; it is not a receipt revealing selections.
5. Ballot routes emit no body logging, tracing, analytics, session identifiers, precise public timestamps, or identity-bearing device metadata.

Required evidence: append receipt, confirmation code, cast/challenge state, proof-validation result, device/chain commitment, and aggregate reconciliation counters without identity linkage.

### Close and freeze

1. Chair and secretary announce the close rule and resolve authorized in-progress sessions according to the preapproved policy.
2. The ballot box rejects new authorizations and atomically freezes cast/challenged sets.
3. It produces a content commitment covering the ordered encrypted set, status set, manifest/profile, device records, eligibility reconciliation, and close time window.
4. Chair, secretary, ballot-box operator, and two observers compare/sign the commitment through independent channels.
5. Any mismatch, unexplained count, missing chain data, or unresolved proof failure blocks tallying.

## Tally and Publication Ceremony

1. Guardians and independent verifiers validate the frozen election record before any decryption contribution, consistent with the pinned specification.
2. The system homomorphically aggregates only cast ballots and proves/records the aggregation required by the profile.
3. At least quorum `k` guardians produce authenticated decryption contributions/proofs on their independent devices.
4. Coordinator combines only verified contributions. Failed contributions remain visible and cannot be silently replaced.
5. Two independent verifier implementations validate parameters, manifest binding, guardian/public-key data, every cast ballot/proof, cast/challenge status, device/chain data, aggregation, decryption, challenged ballot openings, confirmation-code inclusion, and record completeness.
6. The complete election record is packaged using the pinned serialization, content-addressed, signed by two approvers, and copied to at least two independently administered immutable locations appropriate to the approved audience.
7. Voters receive a route to locate confirmation codes. Reviewers receive record and verifier-report digests through a second channel.
8. Only after both verifier reports pass may the meeting journal reference the record digest and an approved aggregate outcome. A verifier failure records `verificationFailed`; it never falls back to a simulator result labeled secret or verified.

The official ElectionGuard model expects the election record to enable independent verification and excludes sensitive material such as guardian private keys. If organizational policy cannot release the record to a sufficiently independent audience, the system must not claim public end-to-end verifiability.

## Recovery and Failure Rules

### Guardian loss before voting

Abort the ceremony and generate a new election/keys unless the pinned protocol explicitly supports the state transition and every guardian/verifier accepts the resulting transcript. Never edit the guardian set in place.

### Guardian loss after voting

Use only the pinned threshold-recovery protocol and ceremony-verified backups. Recovery occurs on guardian-controlled devices with authenticated contributions and a published transcript. There is no administrator, chair, operator, database, environment-variable, or support master key.

If quorum cannot be reached, fail closed. Preserve encrypted artifacts and evidence, announce that no verified tally is available, and invoke the preapproved procedural contingency: extend the meeting if valid, adjourn/recess, or conduct a new election with new keys and explicit linkage to the abandoned contest. Never reduce the threshold after ballots exist.

### Appliance/database loss

Ordinary meeting backups may restore procedural events and artifact digests, not guardian secrets or identity/linkage data. The ballot subsystem uses separately encrypted, integrity-checked, least-privilege backups of permitted encrypted/public artifacts. Restore must reproduce the frozen digest before tallying resumes.

### Device or chain failure

Quarantine the device, retain its signed record, determine the last accepted chain commitment, and follow only the pinned chain-recovery/replacement procedure. Do not renumber, delete, or silently re-encrypt accepted ballots.

### Record hosting or verifier failure

Restore only content matching the signed close/election-record digest. Publish corrected locations and an incident note without changing the record. If independent verifiers disagree, withhold approval until the discrepancy is resolved and reports are rerun from clean environments.

### Security incident

Compromise of eligibility signing keys, ballot-box signing keys, a voting build, guardian threshold, manifest approval, or record integrity triggers immediate voting suspension, evidence preservation, key revocation, participant notification plan, and independent incident review. Whether to resume or revote is decided using the preapproved contingency, not an ad hoc software override.

## Retention and Destruction

- Guardian secret material remains under guardian custody for the minimum approved contest/audit period, then is destroyed with dual-witness evidence unless law/policy requires longer retention.
- Eligibility identity records and anonymous redemption records remain separated and are deleted on independently reviewed schedules.
- Plaintext selections, ballot nonces, decrypted cast ballots, identity/ciphertext mappings, and sensitive request telemetry are prohibited rather than retained temporarily.
- Encrypted ballots, public ceremony artifacts, challenged-ballot evidence, tally artifacts, verifier reports, and digests follow the approved election-record retention policy.
- Backup deletion must be tested; deleting a primary row without expiring snapshots is not destruction.

## Independent Security-Review Gate

Every item below is mandatory evidence, not a self-attestation:

- [ ] Implementation ADR pins design, serialization, schemas/constants, producer, two independent verifiers, device model, guardian `n/k`, hosting audience, and supported contest types.
- [ ] Independent cryptographer reviews protocol composition, authorization unlinkability, randomness/nonces, proof validation, threshold/recovery use, and version compatibility.
- [ ] Independent privacy reviewer tests identity/ciphertext correlation across live traffic, timestamps, logs, traces, metrics, browser storage, backups, support exports, and election records.
- [ ] At least two verifier implementations accept official vectors, project vectors, and a complete rehearsal record; both reject corrupted parameters, proofs, ballots, tallies, challenge states, and truncated/substituted records.
- [ ] Reproducible signed builds, dependency lock, SBOM, provenance, vulnerability scan, secret scan, and critical-dependency review are complete.
- [ ] External penetration test covers eligibility replay/races, authorization bypass, ballot-box append/close, malformed cryptographic inputs, coordinator/guardian authentication, artifact hosting, and denial of service.
- [ ] Five rehearsals pass: normal election; challenge and revote; one guardian unavailable within supported quorum; appliance restore; unrecoverable quorum loss with fail-closed revote contingency.
- [ ] Capacity test demonstrates the approved 1,500-client profile with cryptographic proof validation, close, tally, verification, artifact download, and failure behavior measured.
- [ ] Accessibility/usability review confirms voters can inspect intent, choose cast/challenge, retain a confirmation code, and verify status without exposing selections.
- [ ] Operations runbooks, role training, observer checklist, incident response, revocation, retention/destruction, and participant communications are approved.
- [ ] Every critical/high finding is remediated and retested; accepted medium residual risks name an owner, expiry, and organizational approver.
- [ ] An independent reviewer signs a release report whose digest is committed to the repository and referenced by the implementation ADR.

Until all boxes have durable evidence, the following remain prohibited:

- adding `secret` to `RulesProfile.voteMethods`;
- adding secret-ballot commands/events to the meeting aggregate or HTTP API;
- presenting a secret-ballot control or security claim in the UI;
- publishing a record as ElectionGuard-compatible or end-to-end verifiable;
- treating an encrypted, simulator, or manually entered result as a verified secret-ballot outcome.

## References

- [ElectionGuard official specifications](https://electionguard.vote/spec/)
- [Creating a verifiable election](https://electionguard.vote/concepts/Verifiability/)
- [ElectionGuard election record](https://electionguard.vote/develop/Election_Record/)
- [ElectionGuard data schema](https://electionguard.vote/develop/Data_Schema/)
- [ElectionGuard serialization specification](https://electionguard.vote/spec/Serialization_Spec/)
- [ElectionGuard applications and independent verification](https://electionguard.vote/develop/Applications/)
