# Milestone 4B Secret-Ballot Security Architecture Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Define an ElectionGuard-compatible secret-ballot boundary, repository-grounded threat model, operational ceremonies, recovery rules, and independent-review gate without adding a secret-ballot implementation.

**Architecture:** Keep cryptographic ballot authority outside the deterministic meeting aggregate and outside AT Protocol publication. The meeting journal may authorize a ballot and later reference verified aggregate artifacts, but voter identity, plaintext selections, ballot nonces, guardian secrets, and identity-to-ciphertext linkage must not enter it. A future ballot subsystem must pin one ElectionGuard specification/serialization version and produce a complete independently verifiable election record.

**Tech Stack:** Markdown ADRs and security documentation; existing Node/TypeScript/PostgreSQL architecture as the modeled system; ElectionGuard official specification and serialization documents as external compatibility references

---

### Task 1: Record the architectural boundary

**Files:**
- Create: `docs/adr/0007-electionguard-compatible-secret-ballot-boundary.md`
- Modify: `docs/adr/README.md`

- [ ] Write ADR 0007 with status `Accepted`. State that the current simulator never handles secret ballots; a future isolated ballot subsystem owns eligibility-token redemption, encryption, cast/challenge state, guardian ceremonies, tallying, and election-record production.
- [ ] State the permitted journal references: ballot authorization ID, manifest hash, ceremony ID, immutable election-record digest/location, verifier reports, and approved aggregate outcome. Explicitly forbid plaintext selections, ballot nonces, guardian private material, and identity-to-ballot mappings.
- [ ] State that encrypted ballot artifacts do not enter AT Protocol records by default and require a separate explicit publication decision.
- [ ] Link ADR 0007 from `docs/adr/README.md`.
- [ ] Commit as `docs: define secret ballot authority boundary`.

### Task 2: Write the repository-grounded threat model

**Files:**
- Create: `docs/security/secret-ballot-threat-model.md`

- [ ] Document scope, deployment assumptions, protected assets, attacker capabilities, non-capabilities, trust boundaries, and entry points grounded in ADRs 0001, 0002, 0004, 0006, and 0007.
- [ ] Enumerate prioritized abuse paths for identity/ciphertext linkage, ballot stuffing, client compromise, guardian collusion, record substitution or truncation, verifier downgrade, challenge suppression, key loss, denial of service, and sensitive logging/backups.
- [ ] Give each threat likelihood, impact, priority, existing controls, required controls, residual risk, and a concrete verification method.
- [ ] Explicitly state that remote-browser malware, coercion, vote buying, traffic analysis, and endpoint compromise are not solved by ElectionGuard cryptography alone.
- [ ] Commit as `docs: add secret ballot threat model`.

### Task 3: Define ceremonies, recovery, and the release gate

**Files:**
- Create: `docs/security/secret-ballot-ceremonies.md`

- [ ] Define pre-election manifest approval, pinned specification/serialization versions, guardian selection, threshold key ceremony, independent transcript verification, device provisioning, and signed readiness approval.
- [ ] Define voting operations: one-time unlinkable eligibility authorization, cast-or-challenge finalization, confirmation-code delivery, encrypted-ballot append, close procedure, tally ceremony, and election-record publication.
- [ ] Define recovery: guardian quorum recovery only, no administrator master key, no recovery from ordinary meeting-database backups, fail-closed behavior, documented revote contingency, and destruction/retention evidence.
- [ ] Define the independent-review gate: cryptographer review, independent verifier interoperability, published deterministic vectors, privacy review, penetration test, ceremony rehearsal, disaster-recovery rehearsal, dependency/SBOM review, and signed remediation closure.
- [ ] State that no `secret` method may enter `RulesProfile.voteMethods`, `MeetingCommand`, HTTP validation, UI claims, or publication schemas until every mandatory gate has evidence and the ADR is superseded by an implementation ADR.
- [ ] Commit as `docs: define ballot ceremonies and review gate`.

### Task 4: Complete Milestone 4B documentation

**Files:**
- Modify: `docs/PLAN.md`
- Modify: `docs/plans/2026-07-10-milestone-4b-secret-ballot-security.md`

- [ ] Link ADR 0007, the threat model, and ceremony document from `docs/PLAN.md`.
- [ ] Mark the Milestone 4 security-design checklist complete while stating that secret-ballot implementation remains prohibited pending independent review.
- [ ] Run `CI=true make verify`; expect repository formatting, lint, tests, builds, Compose validation, and documentation checks to pass.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Commit as `docs: complete secret ballot security design`.
