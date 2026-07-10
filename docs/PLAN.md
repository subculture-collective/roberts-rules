# Roberts Rules Implementation Plan

> **For agentic workers:** Execute one milestone at a time. Keep each pull request independently runnable, preserve the Open Pilot templates, and run `make verify` before handoff. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a chair-led parliamentary-meeting platform whose first usable artifact is a deterministic, auditable procedural simulator.

**Architecture:** The initial system is a pure TypeScript meeting aggregate that accepts versioned commands and emits an append-only event journal. The future API, PWA, and AT Protocol publication layer consume that aggregate; they do not encode procedure themselves. Public organization identity and approved outcomes may be published, while rosters, attendance, deliberation, credentials, and ballots stay private by default.

**Tech Stack:** pnpm workspaces, TypeScript, Node.js, Vitest, fast-check, Vite React, PostgreSQL, Docker Compose, and Gitea Actions.

---

## Current State

- [x] The repository exists at `/Users/onnwee/Projects/subcult/roberts-rules` on `codex/bootstrap-domain-simulator`.
- [x] The generated baseline has Node/TypeScript, Vite React, PostgreSQL, Docker Compose, Open Pilot templates, and `make verify`.
- [x] The generated template identity has been replaced in code, package metadata, Compose configuration, and project documentation.
- [x] The meeting-domain simulator implements all planned commands, strict replay, canonical output, JSONL fixtures, non-secret counted voting, and property-based invariants.
- [ ] No live meeting command API, real-time service, AT Protocol integration, or secure/secret voting system exists yet.

`docs/PLAN.md` is the canonical roadmap. `README.md` must link here once the project identity is adapted. Do not create a duplicate root-level plan.

## Product and Safety Boundaries

The system supports organizations conducting chair-led deliberation. It models original procedural behavior and versioned organization rules; it does not bundle or reproduce Robert's Rules of Order prose.

- The chair controls recognition, rulings, and exceptional overrides. Overrides require a reason and are visible in the event journal.
- The system preserves history. Corrections append compensating events; they never rewrite earlier events.
- A deterministic meeting journal is the procedural source of truth. Browser state, clocks, and WebSocket delivery are never authoritative.
- The first voting slice is explicitly non-secret and simulation-only. Do not describe it as binding, secure, or production-ready.
- Live networking, AT Protocol credentials, ElectionGuard-compatible ballots, and 1,500-client LAN operations are later milestones and must not be silently pulled into the simulator scope.

## Target File Structure

The bootstrap milestone changes the generated baseline. The simulator milestone adds a single isolated workspace package.

| Path | Responsibility |
| --- | --- |
| `package.json` | Workspace scripts and `@subculture/roberts-rules-*` identity. |
| `pnpm-workspace.yaml` | Adds `packages/*` alongside `backend` and `web`. |
| `packages/meeting-domain/src/index.ts` | Sole public exports for the procedural aggregate. |
| `packages/meeting-domain/src/types.ts` | Branded identifiers, commands, events, state, decisions, and stable rejection codes. |
| `packages/meeting-domain/src/decide.ts` | Command validation and event production; no I/O or wall-clock reads. |
| `packages/meeting-domain/src/reduce.ts` | Deterministic state projection from an event journal. |
| `packages/meeting-domain/src/canonical.ts` | Canonical JSON serialization used by replay tests and the CLI. |
| `packages/meeting-domain/src/cli.ts` | JSON-lines transcript replay command. |
| `packages/meeting-domain/test/*.test.ts` | Table-driven behavior and property-based invariant coverage. |
| `packages/meeting-domain/fixtures/*.jsonl` | Readable meeting command transcripts. |
| `docs/adr/0001-public-atproto-private-meeting-authority.md` | Publication and privacy boundary. |
| `docs/adr/0002-event-sourced-chair-controlled-procedure.md` | Aggregate ownership, replay, and override decision. |

## Milestone 0: Adapt the Generated Baseline

**Outcome:** The repository is visibly and mechanically a Roberts Rules project while retaining the generated stack and Open Pilot templates.

- [x] Replace generated package names with `@subculture/roberts-rules`, `@subculture/roberts-rules-api`, and `@subculture/roberts-rules-web` in the root, backend, and web manifests.
- [x] Change PostgreSQL database defaults, Compose service labels, container names, and `.env.example` values from generic `app` names to `roberts_rules` names.
- [x] Rename `.gitea/workflows/template-check.yml` to `.gitea/workflows/verify.yml`; preserve its `make verify` job and update its displayed name to `verify`.
- [x] Replace the generated landing-page copy with an honest project overview, the simulator-first status, the public/private boundary, and `make verify`.
- [x] Update `README.md`, `AGENTS.md`, `SECURITY.md`, `CONTRIBUTING.md`, `docs/README.md`, and `docs/reference/stack.md`; remove template-maintenance and template-creation guidance that no longer applies.
- [x] Replace the repository license and all license references with AGPL-3.0-only after confirming the desired license text is present.
- [x] Preserve `.gitea/ISSUE_TEMPLATE/open-pilot-task.yaml` and `.gitea/PULL_REQUEST_TEMPLATE.md` unchanged except for project-specific examples where useful.
- [x] Run `make verify` and commit only this adaptation plus the roadmap and ADRs.

## Milestone 1: Deterministic Meeting Domain

**Outcome:** A pure package can replay a command transcript into the same canonical state and journal on every run.

### 1.1 Public Contract

- [x] Create `packages/meeting-domain/package.json`, `tsconfig.json`, and a Vitest configuration consistent with `backend` and `web`.
- [x] Define `RulesProfile` with `id`, `version`, `quorum`, `debate`, `voteMethods`, `tiePolicy`, and organization `overrides` fields. Rules data is an input, never a hidden global.
- [x] Define `MeetingState` with `phase`, `version`, `agenda`, `attendance`, `quorum`, `motions`, `recognitionQueues`, `debate`, `pointsOfOrder`, `votes`, `outcomes`, and processed-command decisions.
- [x] Define the closed `MeetingRole` union: `administrator`, `chair`, `parliamentarian`, `secretary`, `teller`, `delegate`, `alternate`, `participant`, `observer`, and `technicalOperator`.
- [x] Define `CommandEnvelope` as `{ id, expectedVersion, actorId, role, occurredAt, command }`. Define commands as a discriminated union with a literal `type` field.
- [x] Define `MeetingEvent` as `{ id, type, aggregateVersion, occurredAt, causationId, payload }`. Define `Decision` as either `{ accepted: true, events }` or `{ accepted: false, code, explanation }`.
- [x] Export a stable rejection-code union including `STALE_VERSION`, `DUPLICATE_COMMAND`, `ROLE_FORBIDDEN`, `INVALID_PHASE`, `QUORUM_REQUIRED`, `NO_ACTIVE_QUESTION`, `ACTIVE_QUESTION_EXISTS`, `INVALID_PARENT`, `ALREADY_QUEUED`, `ALREADY_VOTED`, and `INVALID_COMMAND`.

### 1.2 Commands and Events

- [x] Support meeting lifecycle commands: `InitializeMeeting`, `OpenMeeting`, `RecessMeeting`, `ResumeMeeting`, and `AdjournMeeting`.
- [x] Support agenda commands: `AdoptAgenda` and `AdvanceAgenda`.
- [x] Support attendance commands: `CheckInParticipant`, `CheckOutParticipant`, and `ActivateAlternate`.
- [x] Support floor commands: `JoinRecognitionQueue`, `WithdrawRecognitionQueue`, `ReorderRecognitionQueue`, `IntroduceMotion`, `SecondMotion`, `AmendMotion`, `WithdrawMotion`, `TableMotion`, and `DisposeMotion`.
- [x] Support debate and parliamentary commands: `OpenDebate`, `CloseDebate`, `RaisePointOfOrder`, `RuleOnPointOfOrder`, `AppealRuling`, and `RecordAppealOutcome`.
- [x] Support non-secret simulator vote commands: `OpenVote`, `CastVote`, `CloseVote`, and `RecordVoteOutcome`.
- [x] Support `ApplyChairCorrection` only for a chair or parliamentarian and require a non-empty reason plus a semantically matching affected-event reference in the command payload.
- [x] For every currently supported accepted command, emit one or more immutable events with strictly consecutive aggregate versions. Include a `QuorumChanged` event when attendance changes whether quorum is met.

### 1.3 Reducer and Decision Rules

- [x] Implement `createInitialState(profile)` and `reduce(state, event)` without database access, HTTP calls, random IDs, or `Date.now()`.
- [x] Implement `decide(profile, state, envelope)` to first return the previously stored accepted decision for an already processed command ID, then reject a mismatched expected version before applying command-specific checks. Durable rejected-attempt deduplication belongs to the future command store because rejections do not enter the meeting journal.
- [x] Require the appropriate role and phase for every command. Require an in-quorum state for agenda adoption, floor recognition, motion handling, debate, and voting; allow reasoned compensating corrections after initialization without quorum.
- [x] Allow only one active floor question, debate session, and vote at a time. An amendment must refer to an active motion and must not create a parent cycle.
- [x] Allow one active recognition-queue entry per participant per queue and one accepted ballot per participant per vote question.
- [x] Store debate timing as timezone-qualified ISO-8601 deadlines from the command payload. Clients calculate display countdowns only; decisions compare recorded timestamps without ambient time or timezone state.
- [x] Implement chair corrections as new compensating events. A correction must name a semantically matching affected event or prior same-target correction and preserve the original event journal unchanged.

### 1.4 CLI and Fixtures

- [x] Add `pnpm --silent --filter @subculture/roberts-rules-meeting-domain replay <fixture>` to read an explicit profile header followed by one JSON command envelope per line and write canonical `state`, `events`, and `decisions` JSON to standard output.
- [x] Reject malformed transcripts with a non-zero exit code and a line-numbered error on standard error; never write partial JSON output after a malformed input line.
- [x] Add fixtures for an ordinary main motion with counted vote, amendment plus debate, point of order plus appeal, quorum loss and restoration, alternate activation, a reasoned correction, invalid/stale rejection, and completed-meeting replay.

### 1.5 Tests and Acceptance

- [x] Add behavior-driven Vitest coverage across every command family, with shared rejection coverage for phase, role, quorum, stale versions, malformed input, and procedural invariants.
- [x] Add `fast-check` properties proving: replay of a fixed journal yields byte-equivalent canonical state; accepted aggregate versions are strictly monotonic; motion parents are acyclic; queue entries are unique; duplicate command IDs are idempotent; and a participant receives at most one accepted vote per question.
- [x] Assert substantive final behavior for every fixture and run each fixture twice to prove byte-identical canonical output.
- [x] Run `make verify`. A passing result is required before merging the milestone.

## Milestone 2: Private Authority and Public Approved Artifacts

**Outcome:** Organization identity and approved meeting artifacts have clear AT Protocol records without exposing private meeting data.

The executable task sequence, file map, contracts, tests, and production-release gate are in [the Milestone 2 implementation plan](plans/2026-07-10-milestone-2-public-artifacts.md).

- [x] Define and locally validate experimental Lexicons for a public rule profile, meeting manifest, approved outcome, and shared strong references.
- [x] Add a pure allowlist-based projection package and prove private meeting sentinels cannot enter serialized public artifacts.
- [x] Require chair or secretary approval of the exact immutable projection before creating an idempotent publication job.
- [x] Add an AT Protocol repository adapter with collection-specific permissions, required validation, fake-transport integration tests, and an opt-in local-PDS smoke harness.
- [x] Record the production namespace/release gate and the private credential handoff; do not contact a production PDS in this milestone.
- [x] Run `make verify` after every slice and mark the milestone complete only when the linked acceptance gate passes.

## Milestone 3: Live Floor

**Outcome:** A private real-time PWA and API submit domain commands and project the authoritative event stream.

Milestone 3 is intentionally split into independently verified vertical slices. Begin with [Milestone 3A: Durable Private Command API](plans/2026-07-10-milestone-3a-durable-command-api.md); plan resumable delivery and the role-specific PWA only after that journal boundary is merged.

The next slice is [Milestone 3B: Resumable Meeting Event Stream](plans/2026-07-10-milestone-3b-resumable-event-stream.md).

- [x] Add a meeting command API that loads the latest journal, calls `decide`, appends accepted events atomically, and returns the decision through a deny-by-default principal boundary.
- [x] Add a WebSocket event stream that is resumable from aggregate version and treats reconnect delivery as at-least-once.
- [ ] Add chair, secretary, parliamentarian, delegate, alternate, observer, and operator views that render projected state only.
- [ ] Implement presence, quorum display, recognition queues, motions, timers, and non-secret votes as clients of the event journal.
- [ ] Add optimistic-concurrency and reconnect tests. The client must refresh from the authoritative journal after a stale-version response.

## Milestone 4: Voting and Cryptographic Ballots

**Outcome:** Voting methods are introduced in increasing assurance order; secret ballots are not represented as secure until independently reviewed.

- [ ] Add counted, weighted, roll-call, threshold, plurality, and ranked-choice vote strategies behind the domain's `voteMethods` profile field.
- [ ] Keep tally inputs and outcome computation auditable through private event records and deterministic test vectors.
- [ ] Design an ElectionGuard-compatible secret-ballot boundary, threat model, ceremony, recovery process, and independent security-review gate before implementing secret ballots.

## Milestone 5: LAN Appliance and Optional WAN Gateway

**Outcome:** Deployment is designed and load-tested for a primary/standby local appliance serving at least 1,500 connected clients.

- [ ] Define primary/standby replication, failover, backup, restore, and audit-retention runbooks.
- [ ] Build a reproducible load test for 1,500 simultaneous event-stream clients and publish measured limits, host specification, and failure behavior.
- [ ] Treat the WAN gateway as optional and isolate it from private LAN meeting authority.

## Architecture Decision Records

- [x] Add `docs/adr/0001-public-atproto-private-meeting-authority.md` with status `Accepted`. Record that public organization identity, rule profiles, manifests, and approved aggregate outcomes may use AT Protocol; rosters, participation, credentials, deliberation, and ballots remain private.
- [x] Add `docs/adr/0002-event-sourced-chair-controlled-procedure.md` with status `Accepted`. Record one deterministic meeting aggregate, append-only events, chair authority, reasoned compensating corrections, and replayable state.
- [x] Update `docs/adr/README.md` with links to both accepted records.

## Delivery Checklist

- [x] Make each implementation slice a separate branch and focused pull request. Do not mix a later milestone into an earlier one.
- [x] Preserve Open Pilot issue and PR templates on every branch.
- [x] Run `make verify` locally before each pull-request handoff and report the exact result.
- [x] Wait for Gitea Actions before merging. If the runner is unavailable, leave the verified PR open and report the operational blocker; do not bypass CI.
- [x] After merge, confirm the remote default branch, repository metadata, public visibility, labels, active verification workflow, and non-force-push protection on `main`.
