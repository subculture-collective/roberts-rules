import { describe, expect, it } from 'vitest'
import { createInitialState, decide, reduce, type CommandEnvelope, type MeetingCommand, type MeetingState, type RulesProfile } from '../src/index.js'

const profile: RulesProfile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 2 }, debate: { defaultDurationSeconds: 600 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } }
const NOW = '2026-07-10T15:00:00.000Z'

describe('non-secret simulator voting', () => {
  it('records a counted vote and typed simulator outcome', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'open-vote', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }))
    expect(state.votes['vote-1']).toMatchObject({ status: 'open', method: 'counted', visibility: 'nonSecretSimulator', ballots: {} })
    ;({ state } = run(state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state } = run(state, 'no', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'no' }))
    ;({ state } = run(state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    ;({ state } = run(state, 'outcome', 'teller-1', 'teller', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(state.votes['vote-1']).toMatchObject({ status: 'recorded', yes: 1, no: 1, abstain: 0, result: 'rejected' })
    expect(state.outcomes).toEqual([{ voteId: 'vote-1', motionId: 'main-1', method: 'counted', visibility: 'nonSecretSimulator', rule: { rulesProfileId: 'standard', rulesProfileVersion: 1, threshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails' }, yes: 1, no: 1, abstain: 0, result: 'rejected', recordedAt: NOW, recorderId: 'teller-1' }])
  })

  it('rejects a second ballot and ballots after close', () => {
    let state = openVoteState(profile)
    ;({ state } = run(state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    expect(reject(state, 'yes-again', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'no' }).code).toBe('ALREADY_VOTED')
    ;({ state } = run(state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    expect(reject(state, 'late', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }).code).toBe('INVALID_COMMAND')
  })

  it('excludes abstentions and applies threshold with integer math', () => {
    const thresholdProfile = { ...profile, motionThreshold: { numerator: 2, denominator: 3, basis: 'votesCast' as const } }
    let state = openVoteState(thresholdProfile)
    ;({ state } = runP(thresholdProfile, state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state } = runP(thresholdProfile, state, 'abstain', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'abstain' }))
    ;({ state } = runP(thresholdProfile, state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    ;({ state } = runP(thresholdProfile, state, 'outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(state.votes['vote-1']).toMatchObject({ yes: 1, no: 0, abstain: 1, result: 'adopted' })

    let boundary = openVoteState(thresholdProfile)
    ;({ state: boundary } = runP(thresholdProfile, boundary, 'yes-1', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state: boundary } = runP(thresholdProfile, boundary, 'yes-2', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state: boundary } = runP(thresholdProfile, boundary, 'no-1', 'delegate-3', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'no' }))
    ;({ state: boundary } = runP(thresholdProfile, boundary, 'close-boundary', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    ;({ state: boundary } = runP(thresholdProfile, boundary, 'outcome-boundary', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(boundary.votes['vote-1']).toMatchObject({ yes: 2, no: 1, result: 'adopted' })
  })

  it('reports a tie for chairDecides without inventing a chair selection', () => {
    const tieProfile = { ...profile, tiePolicy: 'chairDecides' as const }
    let state = openVoteState(tieProfile)
    ;({ state } = runP(tieProfile, state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state } = runP(tieProfile, state, 'no', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'no' }))
    ;({ state } = runP(tieProfile, state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    ;({ state } = runP(tieProfile, state, 'outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(state.votes['vote-1']?.result).toBe('tied')
  })

  it('enforces method and procedure gates and allows disposal only after outcome', () => {
    const state = activeMainState()
    expect(reject(state, 'bad-method', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'secret' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'wrong-role', 'delegate-1', 'delegate', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }).code).toBe('ROLE_FORBIDDEN')
    expect(reject({ ...state, quorum: { ...state.quorum, met: false } }, 'no-quorum', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }).code).toBe('QUORUM_REQUIRED')
    expect(reject({ ...state, phase: 'recessed' }, 'recessed', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }).code).toBe('INVALID_PHASE')
    expect(reject({ ...state, motionStack: [] }, 'no-question', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }).code).toBe('NO_ACTIVE_QUESTION')
    let voting = openVoteState(profile)
    expect(reject(voting, 'blocked-amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'a', parentId: 'main-1', text: 'Change' }).code).toBe('INVALID_COMMAND')
    expect(reject(voting, 'blocked-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }).code).toBe('INVALID_COMMAND')
    expect(reject(voting, 'premature-outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }).code).toBe('INVALID_COMMAND')
    ;({ state: voting } = run(voting, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    expect(reject(voting, 'blocked-dispose', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }).code).toBe('INVALID_COMMAND')
    ;({ state: voting } = run(voting, 'outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(run(voting, 'dispose', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }).state.motionStack).toEqual([])
  })

  it('rejects invalid thresholds and preserves accepted-command idempotency', () => {
    const invalidProfile = { ...profile, motionThreshold: { numerator: 0, denominator: 2, basis: 'votesCast' as const } }
    const state = activeMainStateFor(invalidProfile)
    const command = { type: 'OpenVote' as const, voteId: 'vote-1', motionId: 'main-1', method: 'counted' }
    const invalid = decide(invalidProfile, state, { id: 'open-vote', expectedVersion: state.version, actorId: 'chair-1', role: 'chair', occurredAt: NOW, command })
    expect(invalid).toMatchObject({ accepted: false, code: 'INVALID_COMMAND' })
    const accepted = decide(profile, activeMainState(), { id: 'open-vote', expectedVersion: state.version, actorId: 'chair-1', role: 'chair', occurredAt: NOW, command })
    expect(accepted.accepted).toBe(true)
    if (!accepted.accepted) throw new Error(accepted.explanation)
    let projected = activeMainState()
    for (const event of accepted.events) projected = reduce(projected, event)
    expect(decide(profile, projected, { id: 'open-vote', expectedVersion: -1, actorId: 'chair-1', role: 'chair', occurredAt: NOW, command })).toEqual(accepted)
  })

  it('allows only one vote per question and blocks later amendment or debate', () => {
    let state = openVoteState(profile)
    ;({ state } = run(state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    ;({ state } = run(state, 'outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(reject(state, 'second-vote', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-2', motionId: 'main-1', method: 'counted' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'post-vote-amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'a', parentId: 'main-1', text: 'Change' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'post-vote-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }).code).toBe('INVALID_COMMAND')
  })

  it('snapshots vote rules and rejects profile identity drift after duplicate/stale checks', () => {
    let state = openVoteState(profile)
    expect(state.votes['vote-1']?.rule).toEqual({ rulesProfileId: 'standard', rulesProfileVersion: 1, threshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails' })
    ;({ state } = run(state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }))
    ;({ state } = run(state, 'no', 'delegate-2', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'no' }))
    ;({ state } = run(state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
    const drifted = { ...profile, id: 'other', version: 2, motionThreshold: { numerator: 1, denominator: 1, basis: 'votesCast' as const } }
    const duplicate = decide(drifted, state, { id: 'open-vote', expectedVersion: -1, actorId: 'chair-1', role: 'chair', occurredAt: NOW, command: { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' } })
    expect(duplicate.accepted).toBe(true)
    const mismatch = decide(drifted, state, { id: 'outcome', expectedVersion: state.version, actorId: 'chair-1', role: 'chair', occurredAt: NOW, command: { type: 'RecordVoteOutcome', voteId: 'vote-1' } })
    expect(mismatch).toMatchObject({ accepted: false, code: 'INVALID_COMMAND' })
    const changedRules = { ...profile, tiePolicy: 'chairDecides' as const, motionThreshold: { numerator: 1, denominator: 1, basis: 'votesCast' as const } }
    ;({ state } = runP(changedRules, state, 'outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
    expect(state.votes['vote-1']?.result).toBe('rejected')
    expect(state.outcomes[0]?.rule).toEqual(state.votes['vote-1']?.rule)
  })

  it('enforces causal ballot, close, and outcome timestamps', () => {
    let state = activeMainState()
    ;({ state } = runAt(state, 'open-vote', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }, '2026-07-10T15:10:00.000Z'))
    expect(rejectAt(state, 'early-ballot', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }, NOW).code).toBe('INVALID_COMMAND')
    ;({ state } = runAt(state, 'yes', 'delegate-1', 'delegate', { type: 'CastVote', voteId: 'vote-1', choice: 'yes' }, '2026-07-10T15:20:00.000Z'))
    expect(state.votes['vote-1']?.ballots['delegate-1']).toEqual({ choice: 'yes', castAt: '2026-07-10T15:20:00.000Z' })
    expect(rejectAt(state, 'early-close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }, '2026-07-10T15:15:00.000Z').code).toBe('INVALID_COMMAND')
    ;({ state } = runAt(state, 'close', 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }, '2026-07-10T15:30:00.000Z'))
    expect(rejectAt(state, 'early-outcome', 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }, '2026-07-10T15:25:00.000Z').code).toBe('INVALID_COMMAND')
  })

  it('handles zero ballots according to the snapshotted tie policy', () => {
    for (const [tiePolicy, result] of [['motionFails', 'rejected'], ['chairDecides', 'tied']] as const) {
      const selected = { ...profile, tiePolicy }
      let state = openVoteState(selected)
      ;({ state } = runP(selected, state, `close-${tiePolicy}`, 'chair-1', 'chair', { type: 'CloseVote', voteId: 'vote-1' }))
      ;({ state } = runP(selected, state, `outcome-${tiePolicy}`, 'chair-1', 'chair', { type: 'RecordVoteOutcome', voteId: 'vote-1' }))
      expect(state.votes['vote-1']?.result).toBe(result)
    }
  })
})

function activeMainState(): MeetingState {
  return activeMainStateFor(profile)
}
function activeMainStateFor(selectedProfile: RulesProfile): MeetingState {
  let state = createInitialState(selectedProfile)
  ;({ state } = runP(selectedProfile, state, 'init', 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'm' }))
  ;({ state } = runP(selectedProfile, state, 'in-1', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate' }))
  ;({ state } = runP(selectedProfile, state, 'in-2', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-2', participantRole: 'delegate' }))
  ;({ state } = runP(selectedProfile, state, 'in-3', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-3', participantRole: 'delegate' }))
  ;({ state } = runP(selectedProfile, state, 'open', 'chair-1', 'chair', { type: 'OpenMeeting' }))
  ;({ state } = runP(selectedProfile, state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund it' }))
  ;({ state } = runP(selectedProfile, state, 'second', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
  return state
}
function openVoteState(selectedProfile: RulesProfile): MeetingState {
  const state = activeMainStateFor(selectedProfile)
  return runP(selectedProfile, state, 'open-vote', 'chair-1', 'chair', { type: 'OpenVote', voteId: 'vote-1', motionId: 'main-1', method: 'counted' }).state
}
function run(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  return runP(profile, state, id, actorId, role, command)
}
function runAt(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand, occurredAt: string) {
  return runP(profile, state, id, actorId, role, command, occurredAt)
}
function runP(selectedProfile: RulesProfile, state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand, occurredAt = NOW) {
  const decision = decide(selectedProfile, state, { id, expectedVersion: state.version, actorId, role, occurredAt, command })
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) throw new Error(decision.explanation)
  let next = state
  for (const event of decision.events) next = reduce(next, event)
  return { state: next, events: decision.events }
}
function reject(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  return rejectAt(state, id, actorId, role, command, NOW)
}
function rejectAt(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand, occurredAt: string) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt, command })
  expect(decision.accepted).toBe(false)
  if (decision.accepted) throw new Error('Expected rejection')
  return decision
}
