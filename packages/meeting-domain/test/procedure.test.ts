import { describe, expect, it } from 'vitest'

import { createInitialState, decide, reduce, type CommandEnvelope, type MeetingCommand, type MeetingState, type RulesProfile } from '../src/index.js'

const profile: RulesProfile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 2 }, debate: { defaultDurationSeconds: 600 }, voteMethods: ['counted'], tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } }

describe('debate deadlines', () => {
  it('opens debate on the active question and requires an early-close reason', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'open-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }))
    expect(state.debate).toEqual({ motionId: 'main-1', openedAt: NOW, closesAt: '2026-07-10T16:00:00.000Z', status: 'open' })
    expect(reject(state, 'early-no-reason', 'chair-1', 'chair', { type: 'CloseDebate', motionId: 'main-1' }, '2026-07-10T15:30:00.000Z').code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'early-close', 'chair-1', 'chair', { type: 'CloseDebate', motionId: 'main-1', reason: '  debate exhausted  ' }, '2026-07-10T15:30:00.000Z'))
    expect(state.debate).toMatchObject({ status: 'closed', closedAt: '2026-07-10T15:30:00.000Z', reason: 'debate exhausted' })
  })

  it('rejects invalid deadlines, duplicate debate, and clears stale debate on motion completion', () => {
    let state = activeMainState()
    expect(reject(state, 'bad-date', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: 'later' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'past', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: NOW }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'open-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }))
    expect(reject(state, 'second-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T17:00:00.000Z' }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'dispose', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }))
    expect(state.debate).toBeNull()
  })

  it('requires real, timezone-qualified timestamps and never closes before debate opened', () => {
    const state = activeMainState()
    for (const occurredAt of ['2026-07-10T15:00:00', '2026-02-30T15:00:00.000Z', '2026-13-01T15:00:00.000Z']) {
      expect(reject(state, `bad-${occurredAt}`, 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }, occurredAt).code).toBe('INVALID_COMMAND')
    }
    expect(reject(state, 'timezone-less-deadline', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00' }).code).toBe('INVALID_COMMAND')
    const opened = run(state, 'open-offset', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T12:00:00.000-04:00' }, '2026-07-10T10:00:00.000-04:00').state
    expect(reject(opened, 'before-open', 'chair-1', 'chair', { type: 'CloseDebate', motionId: 'main-1', reason: 'Correction' }, '2026-07-10T09:59:59.999-04:00').code).toBe('INVALID_COMMAND')
  })

  it('does not reopen closed debate until the question leaves and returns to the floor', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'open-debate', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }))
    ;({ state } = run(state, 'close-debate', 'chair-1', 'chair', { type: 'CloseDebate', motionId: 'main-1' }, '2026-07-10T16:00:00.000Z'))
    expect(reject(state, 'reopen-same', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T17:00:00.000Z' }, '2026-07-10T16:01:00.000Z').code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Cap it' }))
    ;({ state } = run(state, 'second-amend', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'amend-1' }))
    ;({ state } = run(state, 'dispose-amend', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'amend-1', disposition: 'adopted' }))
    ;({ state } = run(state, 'reopen-restored', 'chair-1', 'chair', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T17:00:00.000Z' }, '2026-07-10T16:01:00.000Z'))
    expect(state.debate?.status).toBe('open')
  })
})

describe('points of order and appeals', () => {
  it('records a ruling, appeal, and overturning outcome without replacing the original ruling', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: '  The amendment is out of scope  ' }))
    expect(state.pointsOfOrder['point-1']).toMatchObject({ text: 'The amendment is out of scope', raiserId: 'delegate-1', motionId: 'main-1', status: 'pending' })
    ;({ state } = run(state, 'ruling', 'chair-1', 'chair', { type: 'RuleOnPointOfOrder', pointId: 'point-1', ruling: 'denied', reason: '  Germane to funding  ' }))
    ;({ state } = run(state, 'appeal', 'delegate-2', 'delegate', { type: 'AppealRuling', pointId: 'point-1', appealId: 'appeal-1', grounds: '  Scope remains unclear  ' }))
    ;({ state } = run(state, 'outcome', 'secretary', 'secretary', { type: 'RecordAppealOutcome', pointId: 'point-1', appealId: 'appeal-1', outcome: 'overturned', reason: '  Assembly disagreed  ' }))
    expect(state.pointsOfOrder['point-1']).toMatchObject({
      status: 'final', ruling: 'denied', rulingReason: 'Germane to funding', rulerId: 'chair-1',
      appeal: { id: 'appeal-1', appellantId: 'delegate-2', grounds: 'Scope remains unclear', status: 'decided', outcome: 'overturned', reason: 'Assembly disagreed', deciderId: 'secretary' },
    })
  })

  it('enforces one pending point, one appeal, and mandatory ruling and outcome reasons', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Out of scope' }))
    expect(reject(state, 'other-point', 'delegate-2', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-2', text: 'Another point' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-ruling', 'chair-1', 'chair', { type: 'RuleOnPointOfOrder', pointId: 'point-1', ruling: 'upheld', reason: '   ' }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'ruling', 'chair-1', 'chair', { type: 'RuleOnPointOfOrder', pointId: 'point-1', ruling: 'upheld', reason: 'Valid point' }))
    ;({ state } = run(state, 'appeal', 'delegate-2', 'delegate', { type: 'AppealRuling', pointId: 'point-1', appealId: 'appeal-1' }))
    expect(reject(state, 'other-appeal', 'delegate-1', 'delegate', { type: 'AppealRuling', pointId: 'point-1', appealId: 'appeal-2' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-outcome', 'chair-1', 'chair', { type: 'RecordAppealOutcome', pointId: 'point-1', appealId: 'appeal-1', outcome: 'sustained', reason: '  ' }).code).toBe('INVALID_COMMAND')
  })

  it('applies role, phase, quorum, and current-question gates', () => {
    const state = activeMainState()
    expect(reject(state, 'delegate-open', 'delegate-1', 'delegate', { type: 'OpenDebate', motionId: 'main-1', closesAt: '2026-07-10T16:00:00.000Z' }).code).toBe('ROLE_FORBIDDEN')
    expect(reject({ ...state, phase: 'recessed' }, 'recessed-point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Point' }).code).toBe('INVALID_PHASE')
    expect(reject({ ...state, quorum: { ...state.quorum, met: false } }, 'no-quorum-point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Point' }).code).toBe('QUORUM_REQUIRED')
    const noQuestion = { ...state, motionStack: [] }
    expect(reject(noQuestion, 'no-question-point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Point' }).code).toBe('NO_ACTIVE_QUESTION')
  })

  it('blocks question changes while procedure is unresolved and rejects historical appeals', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Out of scope' }))
    expect(reject(state, 'blocked-amend', 'delegate-2', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Change it' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blocked-dispose', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'ruling', 'chair-1', 'chair', { type: 'RuleOnPointOfOrder', pointId: 'point-1', ruling: 'denied', reason: 'In scope' }))
    ;({ state } = run(state, 'amend', 'delegate-2', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Change it' }))
    expect(reject(state, 'historical-appeal', 'delegate-1', 'delegate', { type: 'AppealRuling', pointId: 'point-1', appealId: 'appeal-1' }).code).toBe('INVALID_COMMAND')
    expect(state.pointsOfOrder['point-1']?.status).toBe('final')
  })

  it('blocks terminal motion commands while an appeal is pending', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'point', 'delegate-1', 'delegate', { type: 'RaisePointOfOrder', pointId: 'point-1', text: 'Out of scope' }))
    ;({ state } = run(state, 'ruling', 'chair-1', 'chair', { type: 'RuleOnPointOfOrder', pointId: 'point-1', ruling: 'denied', reason: 'In scope' }))
    ;({ state } = run(state, 'appeal', 'delegate-2', 'delegate', { type: 'AppealRuling', pointId: 'point-1', appealId: 'appeal-1' }))
    expect(reject(state, 'blocked-table', 'chair-1', 'chair', { type: 'TableMotion', motionId: 'main-1', reason: 'Later' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blocked-withdraw', 'chair-1', 'chair', { type: 'WithdrawMotion', motionId: 'main-1', reason: 'Later' }).code).toBe('INVALID_COMMAND')
  })
})

const NOW = '2026-07-10T15:00:00.000Z'
function activeMainState(): MeetingState {
  let state = createInitialState(profile)
  ;({ state } = run(state, 'init', 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'm' }))
  ;({ state } = run(state, 'in-1', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate' }))
  ;({ state } = run(state, 'in-2', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-2', participantRole: 'delegate' }))
  ;({ state } = run(state, 'open', 'chair-1', 'chair', { type: 'OpenMeeting' }))
  ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund it' }))
  ;({ state } = run(state, 'second', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
  return state
}
function run(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand, occurredAt = NOW) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt, command })
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) throw new Error(decision.explanation)
  let next = state
  for (const event of decision.events) next = reduce(next, event)
  return { state: next, events: decision.events }
}
function reject(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand, occurredAt = NOW) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt, command })
  expect(decision.accepted).toBe(false)
  if (decision.accepted) throw new Error('Expected rejection')
  return decision
}
