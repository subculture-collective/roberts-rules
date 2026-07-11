# Milestone 4A Auditable Voting Implementation Plan

> **For agentic workers:** Execute this plan task-by-task. Recommended path:
> dispatch a fresh subagent per task, review each result with `review-quality`,
> then continue. For complex multi-agent splits, use
> `parallel-feature-development`, `team-composition-patterns`, and
> `team-communication-protocols`. Steps use checkbox (`- [ ]`) syntax for
> tracking.

**Goal:** Add deterministic, auditable non-secret simulator voting for binary, weighted, roll-call, plurality, and ranked-choice decisions without implying ballot secrecy or production election assurance.

**Architecture:** Treat threshold as a snapshotted binary decision rule, not a ballot method. Put deterministic tallying behind a pure domain module; journal events retain the exact non-secret ballot inputs and computed outcome. Binary counted, weighted, and roll-call modes share yes/no/abstain ballots, while plurality and ranked-choice use explicitly configured candidate options and ranked ballots.

**Tech Stack:** TypeScript 5.9, Vitest 4, the existing event-sourced meeting aggregate, Node.js 22+

---

## File Structure

- Create `packages/meeting-domain/src/vote-strategies.ts`: pure validation and tally functions with no clock, storage, or aggregate dependencies.
- Create `packages/meeting-domain/test/vote-strategies.test.ts`: deterministic input/output vectors for every strategy and its critical tie behavior.
- Modify `packages/meeting-domain/src/types.ts`: closed vote-method, ballot, configuration, tally, and outcome unions.
- Modify `packages/meeting-domain/src/decide.ts`: validate profile permission and vote configuration, snapshot inputs, and call the pure tally module.
- Modify `packages/meeting-domain/src/reduce.ts`: project strategy-specific outcomes without recomputation.
- Modify `packages/meeting-domain/src/validation.ts`: deny unknown fields and validate each command variant at the HTTP/transcript boundary.
- Modify `packages/meeting-domain/src/index.ts`: export public vote strategy types and functions.
- Modify `packages/meeting-domain/test/voting.test.ts`: observable aggregate behavior for each new vote mode.
- Modify `packages/meeting-domain/test/invariants.property.test.ts`: preserve one-ballot-per-representative and replay determinism across the expanded ballot union.
- Modify `packages/meeting-domain/fixtures/*.jsonl`: retain the existing counted-vote compatibility vector and add focused weighted and ranked-choice transcripts only when the CLI exercises the new public commands.
- Modify `docs/PLAN.md`: link this plan, track completed slices, and preserve the separate secret-ballot security gate.

### Task 1: Extract the existing binary threshold tally

- [x] Add a failing deterministic vector in `packages/meeting-domain/test/vote-strategies.test.ts` that supplies yes/no/abstain ballot records plus the snapshotted two-thirds threshold and expects `{ yes: 2, no: 1, abstain: 1, result: 'adopted' }`.
- [x] Run `pnpm --filter @subculture/roberts-rules-meeting-domain test -- vote-strategies.test.ts`; expect failure because `tallyBinaryVote` does not exist.
- [x] Create `packages/meeting-domain/src/vote-strategies.ts` with `tallyBinaryVote(ballots, rule)`. Use integer multiplication for the threshold, exclude abstentions from `votesCast`, and preserve `motionFails` versus `chairDecides` tie behavior.
- [x] Export the function from `packages/meeting-domain/src/index.ts`, replace inline counted tallying in `decide.ts`, and keep existing event payloads byte-for-byte compatible.
- [x] Run the focused strategy and voting tests; expect all tests to pass.
- [x] Commit as `refactor: isolate deterministic binary vote tally`.

### Task 2: Add typed counted and roll-call modes

- [x] Add a failing aggregate test proving a profile that permits `rollCall` can open it, retain voter-keyed yes/no/abstain records, and produce the same threshold result as `counted`.
- [x] Run the focused voting test; expect `INVALID_COMMAND` for `rollCall`.
- [x] Add `BinaryVoteMethod = 'counted' | 'rollCall'`, close `RulesProfile.voteMethods` over supported methods, and carry the selected method through `VoteState` and `VoteOutcome`.
- [x] Permit only profile-enabled methods in `OpenVote`; keep `visibility: 'nonSecretSimulator'` for both methods and reject `secret` or unknown strings at validation.
- [x] Run meeting-domain tests; expect the new test and all counted compatibility tests to pass.
- [x] Commit as `feat: add auditable roll-call voting`.

### Task 3: Add weighted binary votes with snapshotted weights

- [x] Add a failing pure vector where three disclosed ballots have weights 3, 2, and 1 and the weighted totals determine the threshold result.
- [x] Add a failing aggregate test where `OpenVote` receives a complete positive-integer weight map for active eligible representatives, snapshots it in the private vote event, and rejects missing, zero, negative, fractional, or unknown-participant entries.
- [x] Add `weighted` to the binary vote methods and a weighted configuration variant on `OpenVote`; represent tally totals as integers and preserve the unweighted ballot count for audit display.
- [x] Ensure the teller cannot change weights when recording the outcome because computation uses the `VoteOpened` snapshot.
- [x] Run meeting-domain tests; expect deterministic weighted totals after replay.
- [x] Commit as `feat: add snapshotted weighted voting`.

### Task 4: Add plurality candidate selection

- [x] Add a failing pure vector for three non-empty unique candidate IDs, including a deterministic tied result that lists tied candidates in configured option order.
- [x] Add a failing command-validation test for duplicate/blank options and ballots naming an option outside the snapshotted set.
- [x] Add a plurality configuration with two or more option IDs, a single-choice candidate ballot, and an outcome containing per-option totals plus either one winner or an ordered tie.
- [x] Keep plurality outcomes distinct from motion `adopted`/`rejected`; do not auto-dispose a motion based on a candidate-selection result.
- [x] Run meeting-domain tests; expect validation, replay, and deterministic vectors to pass.
- [x] Commit as `feat: add auditable plurality voting`.

### Task 5: Add deterministic ranked-choice selection

- [ ] Add failing vectors covering a first-round majority, elimination and transfer, exhausted ballots, and a final tie. Each expected result includes ordered round totals and eliminated candidates.
- [ ] Add failing validation tests rejecting duplicate candidate IDs within a ranking, unknown candidates, empty rankings, and rankings longer than the configured option list.
- [ ] Implement instant-runoff tallying with configured-option order as the deterministic serialization order. A strict majority of active non-exhausted ballots wins; eliminate the lowest candidate each round; if all remaining candidates share the lowest total, return a tie rather than inventing a winner.
- [ ] Store every round in `VoteOutcome` so replay and independent recomputation can compare exact inputs and outputs.
- [ ] Run meeting-domain tests; expect all vectors and aggregate flows to pass.
- [ ] Commit as `feat: add auditable ranked-choice voting`.

### Task 6: Complete Milestone 4A integration and documentation

- [ ] Add or update CLI transcript fixtures to demonstrate one weighted and one ranked-choice journal replay through public commands.
- [ ] Run `CI=true make verify`; expect formatting, lint, build, unit, integration, and fixture checks to pass.
- [ ] Run `git diff --check`; expect no whitespace errors.
- [ ] Mark the two non-secret voting checklist items complete in `docs/PLAN.md`, explicitly state that journal ballot records are private and non-secret, and leave the ElectionGuard-compatible security item unchecked.
- [ ] Commit as `docs: complete auditable voting milestone`.

## Explicitly Separate Follow-up

Milestone 4B is documentation and security architecture, not an extension of these simulator methods. It will define the secret-ballot trust boundary, ElectionGuard compatibility assumptions, key ceremony, spoiled/challenged ballot handling, recovery, operational roles, threat model, and an independent-review acceptance gate. No `secret` vote method may be added to the command API until that gate is satisfied.
