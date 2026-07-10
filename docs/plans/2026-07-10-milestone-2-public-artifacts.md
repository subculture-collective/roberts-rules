# Milestone 2: Private Authority and Public Approved Artifacts Implementation Plan

> **For agentic workers:** Execute this plan one task at a time. Keep each task independently runnable, use checkbox syntax for tracking, and run `make verify` before every handoff.

**Goal:** Publish only deliberately approved public meeting artifacts through an AT Protocol repository boundary while keeping meeting authority and sensitive activity private.

**Architecture:** Add a pure `meeting-publication` package between the private meeting aggregate and any network client. It owns public Lexicon-shaped types, projection, privacy checks, approval state, and an outbound publication job. A separate `atproto-publication` package implements the repository port. Neither package changes meeting procedure, and Milestone 2 performs no production PDS write.

**Tech Stack:** TypeScript, Vitest, fast-check, AT Protocol Lexicon JSON, `@atproto/lex`, `@atproto/api`, pnpm workspaces, and the existing `make verify` gate.

## Non-negotiable boundary

- The private meeting journal remains authoritative. Repository success or failure never changes a meeting decision.
- Public records use flat experimental NSIDs under `tv.subcult` (`tv.subcult.experimental*`) until `_lexicon.subcult.tv` authority and the final schemas are deliberately released. A released schema is additive-only; a breaking change receives a new NSID.
- Public projection is allowlist-based. It must reject unknown keys and recursively reject private identifiers, rosters, attendance, recognition queues, debate, credentials, participation logs, individual ballots, and private-journal material.
- Outcome tallies are omitted by default. A chair or secretary may explicitly approve aggregate `yes`, `no`, and `abstain` counts; voter identities and ballot records are never eligible.
- All records are immutable snapshots with `tid` record keys. Corrections publish a new record with an optional strong reference (`uri` and `cid`) to the superseded record.
- Milestone 2 stops at a fake/in-memory repository integration test plus an opt-in local-PDS smoke-test harness. Production OAuth, device enrollment, and production PDS writes require a later implementation plan and explicit authorization.

## Target files

| Path | Responsibility |
| --- | --- |
| `lexicons/com/atproto/repo/strongRef.json` | CID-pinned installed standard strong-reference schema. |
| `lexicons/tv.subcult.experimentalRuleProfile.json` | Versioned, machine-readable public rule profile. |
| `lexicons/tv.subcult.experimentalManifest.json` | Minimal public meeting announcement. |
| `lexicons/tv.subcult.experimentalApprovedOutcome.json` | Explicitly approved public motion disposition and optional aggregate tally. |
| `lexicons.json` | Pins installed/published Lexicon inputs used by `@atproto/lex`. |
| `packages/meeting-publication/src/*` | Pure projection, privacy validation, approval state, and publication job creation. |
| `packages/atproto-publication/src/*` | AT Protocol repository port implementation and local smoke-test entry point. |
| `packages/*/test/*` | Contract, privacy, state-transition, idempotency, and adapter tests. |
| `docs/adr/0003-public-artifact-schema-and-approval.md` | Schema, immutability, approval, namespace, and tally decisions. |

## Task 2.1: Freeze the experimental public contracts

**Files:**

- Create: `lexicons/tv.subcult.experimentalRuleProfile.json`
- Create: `lexicons/tv.subcult.experimentalManifest.json`
- Create: `lexicons/tv.subcult.experimentalApprovedOutcome.json`
- Create: `lexicons.json`
- Modify: `package.json`
- Test: `packages/meeting-publication/test/lexicons.test.ts`

- [x] Add `@atproto/lex` as a pinned root development dependency and add `lexicons:build` and `lexicons:check` scripts. The check must fail on a dirty generated result or an invalid schema.
- [x] Define all record schemas with `key: "tid"`, a required `$type`, timezone-qualified `createdAt`, and bounded strings/arrays. Do not add free-form metadata bags.
- [x] Install and CID-pin `com.atproto.repo.strongRef`; use it for rule-profile references, meeting references, and `supersedes`.
- [x] Define `ruleProfile` with only public procedural configuration: `profileId`, positive integer `version`, `name`, `quorum`, `debate`, `voteMethods`, `tiePolicy`, `overrides`, `effectiveFrom`, and `createdAt`. Overrides are structured codes and values, never copied parliamentary prose.
- [x] Define `manifest` with `publicMeetingId`, `organizationDid`, `title`, `scheduledStart`, `ruleProfile`, and `createdAt`. Do not include location, roster, attendance, quorum state, or internal meeting ID.
- [x] Define `approvedOutcome` with `publicOutcomeId`, `organizationDid`, `meeting`, `publicMotionId`, `motionText`, `disposition`, optional `tally`, `approvedByRole`, `approvedAt`, `createdAt`, and optional `supersedes`. Restrict `approvedByRole` to `chair` or `secretary`.
- [x] Generate TypeScript definitions into `packages/meeting-publication/src/generated/` and expose only stable aliases from the package index.
- [x] Test that each smallest valid record passes local Lexicon validation and representative missing, malformed, or oversized fields fail. Test extra-field rejection separately at the strict privacy boundary because Lexicon consumers are forward-compatible.
- [x] Run `make verify` and `git diff --check`.

Contract sketch:

```ts
export type PublicArtifact =
  | PublicRuleProfile
  | PublicMeetingManifest
  | PublicApprovedOutcome;

export interface StrongRef {
  uri: string;
  cid: string;
}
```

## Task 2.2: Build the one-way public projection

**Files:**

- Create: `packages/meeting-publication/package.json`
- Create: `packages/meeting-publication/tsconfig.json`
- Create: `packages/meeting-publication/eslint.config.js`
- Create: `packages/meeting-publication/vitest.config.ts`
- Create: `packages/meeting-publication/src/index.ts`
- Create: `packages/meeting-publication/src/types.ts`
- Create: `packages/meeting-publication/src/project.ts`
- Create: `packages/meeting-publication/src/privacy.ts`
- Test: `packages/meeting-publication/test/project.test.ts`
- Test: `packages/meeting-publication/test/privacy.test.ts`

- [x] Define separate private inputs and public outputs. Projection functions return fresh objects and never accept arbitrary record-shaped input.
- [x] Implement `projectRuleProfile`, `projectMeetingManifest`, and `projectApprovedOutcome` as exhaustive allowlists.
- [x] Generate opaque UUID public IDs at the private application boundary and pass them into the pure projector; never derive a public ID from an actor, credential, ballot, or journal event ID.
- [x] Require an explicit `includeAggregateTally` approval flag. When false, omit `tally`; when true, copy only non-negative `yes`, `no`, and `abstain` totals.
- [x] Implement `assertPublicArtifact` to validate the Lexicon and recursively reject forbidden property names and unexpected keys before a publication job can be created.
- [x] Add table tests proving every permitted field projects correctly and each private meeting-state family is absent.
- [x] Add a fast-check property that injects arbitrary private sentinel strings into private inputs and proves no sentinel appears in canonical serialized public output.
- [x] Run `make verify` and `git diff --check`.

Projection boundary:

```ts
export function projectApprovedOutcome(
  source: PrivateOutcomeSource,
  approval: PublicOutcomeApproval,
): PublicApprovedOutcome;

export function assertPublicArtifact(value: unknown): asserts value is PublicArtifact;
```

## Task 2.3: Require explicit approval and create an idempotent outbox

**Files:**

- Create: `packages/meeting-publication/src/approval.ts`
- Create: `packages/meeting-publication/src/outbox.ts`
- Test: `packages/meeting-publication/test/approval.test.ts`
- Test: `packages/meeting-publication/test/outbox.test.ts`

- [x] Define private `PublicationCandidate`, `PublicationApproval`, and `PublicationJob` records. Approval stores the private approver ID for audit, but projection exposes only `chair` or `secretary`.
- [x] Permit transitions `draft -> approved -> publishing -> published` and `publishing -> failed -> publishing`. Reject skips, edits after approval, and approval by any other role.
- [x] Bind approval to the canonical hash of the exact public projection. Any content change creates a new draft and requires a new approval.
- [x] Assign the `tid` rkey once when the job is created and retain it across retries. Persist the returned AT URI, CID, validation result, attempt count, and sanitized failure category.
- [x] Keep network errors out of meeting-domain state and never mark the source outcome unapproved because publication failed.
- [x] Test all allowed and rejected transitions, immutable approved content, retry idempotency, and omission of tokens/credentials from stored failures.
- [x] Run `make verify` and `git diff --check`.

State boundary:

```ts
export interface PublicationJob {
  id: string;
  repositoryDid: string;
  collection: PublicArtifact["$type"];
  rkey: string;
  record: PublicArtifact;
  projectionHash: string;
  status: "approved" | "publishing" | "published" | "failed";
}
```

## Task 2.4: Add the AT Protocol repository adapter without production contact

**Files:**

- Create: `packages/atproto-publication/package.json`
- Create: `packages/atproto-publication/tsconfig.json`
- Create: `packages/atproto-publication/eslint.config.js`
- Create: `packages/atproto-publication/vitest.config.ts`
- Create: `packages/atproto-publication/src/index.ts`
- Create: `packages/atproto-publication/src/repository.ts`
- Create: `packages/atproto-publication/src/atproto-repository.ts`
- Create: `packages/atproto-publication/src/local-smoke.ts`
- Test: `packages/atproto-publication/test/atproto-repository.test.ts`
- Fixtures: `packages/atproto-publication/fixtures/*.json`

- [x] Define a narrow `PublicRepository` port that accepts only an approved `PublicationJob` and returns `{ uri, cid, validationStatus }`.
- [x] Implement the adapter with `com.atproto.repo.putRecord` using the preassigned collection and rkey. Set `validate: true`; treat missing/failed Lexicon validation as failure rather than silently publishing optimistically.
- [x] Request only `atproto` plus repository permissions for the three experimental collections. Do not use `transition:generic` for the production design.
- [x] Keep OAuth tokens and DPoP keys behind an injected session interface. Do not serialize them into jobs, logs, fixtures, errors, or public records.
- [x] Use a fake transport to assert the exact XRPC request, validation requirement, returned URI/CID handling, retry behavior, and that a non-approved job cannot reach the transport.
- [x] Add an opt-in `pnpm --filter @subculture/roberts-rules-atproto-publication smoke:local` command. It requires an explicitly supplied local PDS URL and disposable test identity, refuses known production hosts, and is excluded from `make verify`.
- [x] Do not run the local smoke command unless a local disposable PDS is already available and the user explicitly asks for it.
- [x] Run `make verify` and `git diff --check`.

Repository port:

```ts
export interface PublicRepository {
  publish(job: PublishingPublicationJob): Promise<{
    uri: string;
    cid: string;
    validationStatus: "valid";
  }>;
}
```

## Task 2.5: Document the release and private-credential handoff

**Files:**

- Create: `docs/adr/0003-public-artifact-schema-and-approval.md`
- Modify: `docs/adr/README.md`
- Modify: `docs/reference/stack.md`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/PLAN.md`

- [x] Record why public artifacts are immutable `tid` snapshots, why strong references contain both URI and CID, why tallies are opt-in, and why the experimental namespace precedes release.
- [x] Document the production release gate: review final schemas, control `_lexicon.subcult.tv`, publish Lexicon schema records, verify PDS resolution, request collection-specific permissions, and conduct a separate authorized smoke test.
- [x] Document the future private credential design: organization DID preregistration, device-generated keys, short-lived meeting-scoped credentials, revocation, and server-side role binding. Explicitly state that credentials, roster membership, and device identifiers never enter an AT Protocol record.
- [x] State that credential issuance and verification require the Milestone 3 private API and are not implemented in Milestone 2.
- [x] Mark Milestone 2 complete in `docs/PLAN.md` only after all four implementation slices pass `make verify` and their fixture tests prove the privacy boundary.
- [x] Run final `make verify` and `git diff --check` and report the exact results.

## Milestone 2 acceptance gate

- [x] All three experimental Lexicons validate locally and generated TypeScript is reproducible.
- [x] Property and fixture tests demonstrate that public serialization contains no private sentinels or forbidden fields.
- [x] Only chair/secretary approval of an exact immutable projection creates a publishable job.
- [x] Repository retries reuse the same collection/rkey and retain returned URI/CID without affecting meeting authority.
- [x] `make verify` passes with no production network dependency.
- [x] No production PDS has been contacted and no credential or secret has entered git, fixtures, logs, or public records.
