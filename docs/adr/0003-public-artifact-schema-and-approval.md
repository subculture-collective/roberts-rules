# ADR 0003: Public Artifact Schema and Approval

## Status

Accepted

## Context

ADR 0001 permits public rule profiles, meeting manifests, and approved aggregate outcomes while keeping the meeting journal and sensitive activity private. AT Protocol repositories are public, mutable at a record path, and may accept unknown fields for forward compatibility, so repository validation alone is not a privacy boundary.

## Decision

Locally authored schemas use the experimental `tv.subcult.experimental*` NSIDs until `_lexicon.subcult.tv` authority is configured and the contracts receive a release review. Published Lexicons evolve additively; breaking changes receive a new NSID.

Public artifacts are immutable application-level snapshots under new `tid` record keys. Corrections publish a new record whose optional `supersedes` field uses `com.atproto.repo.strongRef`; the publisher never overwrites an earlier artifact with changed content.

A pure allowlist projection constructs public records. A separate strict privacy validator rejects unknown fields before repository submission, while generated Lexicon validation checks the interoperable record shape. Aggregate tallies are omitted unless a chair or secretary explicitly approves their inclusion. Approval binds the exact canonical public projection hash to a private audit record. The public record exposes the approving role, never the approver's private identifier.

Repository publication uses a preassigned collection and rkey, requires PDS validation status `valid`, and stores the returned URI and CID. Publication failure cannot change meeting state or procedure.

## Consequences

- Consumers can verify exact referenced content with an AT URI plus CID.
- A `tid` is an addressing choice, not proof of time or immutability; application checks enforce immutable retries.
- Unknown fields remain available for Lexicon evolution but are rejected at this application's privacy boundary.
- Production publication requires control of `_lexicon.subcult.tv`, published schema records, collection-specific OAuth permissions, and a separately authorized smoke test.
- Milestone 2 does not issue meeting credentials or contact a production PDS.

## Private credential handoff

Milestone 3 may add organization-DID preregistration, device-generated keys, short-lived meeting-scoped credentials, revocation, and server-side role binding. Credential material, roster membership, device identifiers, tokens, and DPoP keys must never enter AT Protocol records, publication jobs, fixtures, or logs.

The future production OAuth request is limited to:

```text
atproto repo:tv.subcult.experimentalRuleProfile?action=create repo:tv.subcult.experimentalManifest?action=create repo:tv.subcult.experimentalApprovedOutcome?action=create
```

The opt-in local smoke harness requires an explicit loopback PDS URL, disposable credentials, and a PDS configured to resolve or preload the experimental schemas. It is expected to fail closed with `LEXICON_VALIDATION_REQUIRED` when that schema prerequisite is absent.
