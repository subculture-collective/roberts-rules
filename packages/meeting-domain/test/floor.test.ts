import { describe, expect, it } from 'vitest'

import {
  createInitialState,
  decide,
  reduce,
  type CommandEnvelope,
  type MeetingCommand,
  type MeetingState,
  type RulesProfile,
} from '../src/index.js'

const profile: RulesProfile = {
  id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 2 },
  debate: { defaultDurationSeconds: 600 }, voteMethods: ['counted'],
  motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' },
  tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] },
}

describe('agenda control', () => {
  it('lets the chair adopt a non-empty agenda and advance through it', () => {
    let state = openQuorateState()
    ;({ state } = run(state, 'adopt', 'chair-1', 'chair', {
      type: 'AdoptAgenda', items: [
        { id: 'reports', title: 'Reports' },
        { id: 'business', title: 'New business' },
      ],
    }))
    expect(state.agenda).toEqual([
      { id: 'reports', title: 'Reports', status: 'current' },
      { id: 'business', title: 'New business', status: 'pending' },
    ])

    ;({ state } = run(state, 'advance-1', 'chair-1', 'chair', { type: 'AdvanceAgenda' }))
    expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'current'])
    ;({ state } = run(state, 'advance-2', 'chair-1', 'chair', { type: 'AdvanceAgenda' }))
    expect(state.agenda.map((item) => item.status)).toEqual(['completed', 'completed'])
  })

  it('rejects invalid agenda authority, quorum, item IDs, and phase', () => {
    const state = openQuorateState()
    expect(reject(state, 'wrong-role', 'delegate-1', 'delegate', { type: 'AdoptAgenda', items: [{ id: 'one', title: 'One' }] }).code).toBe('ROLE_FORBIDDEN')
    expect(reject(state, 'duplicates', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: 'one', title: 'One' }, { id: 'one', title: 'Again' }] }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'empty', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [] }).code).toBe('INVALID_COMMAND')
    const noQuorum = { ...state, quorum: { ...state.quorum, met: false } }
    expect(reject(noQuorum, 'no-quorum', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: 'one', title: 'One' }] }).code).toBe('QUORUM_REQUIRED')
    const recessed = { ...state, phase: 'recessed' as const }
    expect(reject(recessed, 'recessed', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: 'one', title: 'One' }] }).code).toBe('INVALID_PHASE')
  })

  it('normalizes agenda IDs and titles before uniqueness and storage', () => {
    let state = openQuorateState()
    expect(reject(state, 'normalized-duplicate', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [
      { id: ' one ', title: 'One' }, { id: 'one', title: 'Again' },
    ] }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-title', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: 'one', title: '   ' }] }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'normalized-agenda', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: ' one ', title: '  Opening business  ' }] }))
    expect(state.agenda[0]).toMatchObject({ id: 'one', title: 'Opening business' })
  })
})

describe('traceable motion stack', () => {
  it('seconds with a different representative and restores a parent after disposing its amendment', () => {
    let state = openQuorateState()
    ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund the garden' }))
    expect(state.motionStack).toEqual(['main-1'])
    expect(state.motions['main-1']).toMatchObject({ status: 'pendingSecond', moverId: 'delegate-1' })
    ;({ state } = run(state, 'second-main', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
    ;({ state } = run(state, 'amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Cap funding at 500' }))
    expect(state.motionStack).toEqual(['main-1', 'amend-1'])
    expect(state.motions['amend-1']).toMatchObject({ parentId: 'main-1', status: 'pendingSecond' })
    ;({ state } = run(state, 'second-amend', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'amend-1' }))
    ;({ state } = run(state, 'dispose-amend', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'amend-1', disposition: 'adopted' }))
    expect(state.motionStack).toEqual(['main-1'])
    expect(state.motions['main-1']?.status).toBe('active')
    ;({ state } = run(state, 'dispose-main', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }))
    expect(state.motionStack).toEqual([])
  })

  it('rejects self-seconding, a second main question, and non-current amendment parents', () => {
    let state = openQuorateState()
    ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund the garden' }))
    expect(reject(state, 'self-second', 'delegate-1', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'other-main', 'delegate-2', 'delegate', { type: 'IntroduceMotion', motionId: 'main-2', text: 'Another question' }).code).toBe('ACTIVE_QUESTION_EXISTS')
    ;({ state } = run(state, 'second', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
    ;({ state } = run(state, 'amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Cap it' }))
    expect(reject(state, 'cycle-shape', 'delegate-2', 'delegate', { type: 'AmendMotion', motionId: 'amend-2', parentId: 'main-1', text: 'Skip current parent' }).code).toBe('INVALID_PARENT')
  })

  it('lets a mover withdraw pending-second and the chair table the current question with trace data', () => {
    let state = openQuorateState()
    ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund the garden' }))
    ;({ state } = run(state, 'withdraw', 'delegate-1', 'delegate', { type: 'WithdrawMotion', motionId: 'main-1', reason: 'Needs revision' }))
    expect(state.motions['main-1']).toMatchObject({ status: 'withdrawn', completionReason: 'Needs revision' })
    ;({ state } = run(state, 'main-2', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-2', text: 'Revised proposal' }))
    ;({ state } = run(state, 'second-2', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-2' }))
    ;({ state } = run(state, 'table', 'chair-1', 'chair', { type: 'TableMotion', motionId: 'main-2', reason: 'Awaiting report' }))
    expect(state.motions['main-2']).toMatchObject({ status: 'tabled', completionReason: 'Awaiting report' })
  })

  it('requires and records a non-blank reason when the chair withdraws the current motion', () => {
    let state = activeMainState()
    expect(reject(state, 'chair-no-reason', 'chair-1', 'chair', { type: 'WithdrawMotion', motionId: 'main-1' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'chair-blank-reason', 'chair-1', 'chair', { type: 'WithdrawMotion', motionId: 'main-1', reason: '   ' }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'chair-withdraw', 'chair-1', 'chair', { type: 'WithdrawMotion', motionId: 'main-1', reason: '  ruled out of order  ' }))
    expect(state.motions['main-1']).toMatchObject({ status: 'withdrawn', completionReason: 'ruled out of order' })
  })

  it('preserves accepted-command idempotency and checks stale versions first for new commands', () => {
    const state = openQuorateState()
    const envelope = { id: 'main', expectedVersion: state.version, actorId: 'delegate-1', role: 'delegate' as const, occurredAt: '2026-07-10T15:00:00.000Z', command: { type: 'IntroduceMotion' as const, motionId: 'main-1', text: 'Fund it' } }
    const accepted = decide(profile, state, envelope)
    expect(accepted.accepted).toBe(true)
    if (!accepted.accepted) throw new Error(accepted.explanation)
    let projected = state
    for (const event of accepted.events) projected = reduce(projected, event)
    expect(decide(profile, projected, { ...envelope, expectedVersion: -1 })).toEqual(accepted)
    const stale = decide(profile, projected, { ...envelope, id: 'new-command', expectedVersion: 0 })
    expect(stale).toMatchObject({ accepted: false, code: 'STALE_VERSION' })
  })

  it('normalizes motion IDs and text before uniqueness and storage', () => {
    let state = openQuorateState()
    ;({ state } = run(state, 'normalized-motion', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: ' main-1 ', text: '  Fund it  ' }))
    expect(state.motionStack).toEqual(['main-1'])
    expect(state.motions['main-1']).toMatchObject({ id: 'main-1', text: 'Fund it' })
    ;({ state } = run(state, 'withdraw-normalized', 'delegate-1', 'delegate', { type: 'WithdrawMotion', motionId: 'main-1' }))
    expect(reject(state, 'duplicate-normalized', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: ' main-1 ', text: 'Different text' }).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-motion', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-2', text: '   ' }).code).toBe('INVALID_COMMAND')
  })
})

describe('recognition queues', () => {
  it('allows self join/withdraw and exact chair reordering for an active question', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'join-1', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'pro' }))
    ;({ state } = run(state, 'join-2', 'delegate-2', 'delegate', { type: 'JoinRecognitionQueue', side: 'pro' }))
    expect(state.recognitionQueues.pro).toEqual(['delegate-1', 'delegate-2'])
    expect(reject(state, 'duplicate', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'pro' }).code).toBe('ALREADY_QUEUED')
    ;({ state } = run(state, 'reorder', 'chair-1', 'chair', { type: 'ReorderRecognitionQueue', side: 'pro', participantIds: ['delegate-2', 'delegate-1'] }))
    expect(state.recognitionQueues.pro).toEqual(['delegate-2', 'delegate-1'])
    expect(reject(state, 'omit', 'chair-1', 'chair', { type: 'ReorderRecognitionQueue', side: 'pro', participantIds: ['delegate-2'] }).code).toBe('INVALID_COMMAND')
    ;({ state } = run(state, 'withdraw', 'delegate-1', 'delegate', { type: 'WithdrawRecognitionQueue', side: 'pro' }))
    expect(state.recognitionQueues.pro).toEqual(['delegate-2'])
  })

  it('requires actor seat, open phase, quorum, and an active question', () => {
    const open = openQuorateState()
    expect(reject(open, 'no-question', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'con' }).code).toBe('NO_ACTIVE_QUESTION')
    const active = activeMainState()
    expect(reject(active, 'impersonation', 'delegate-3', 'delegate', { type: 'JoinRecognitionQueue', side: 'con' }).code).toBe('ROLE_FORBIDDEN')
    expect(reject({ ...active, quorum: { ...active.quorum, met: false } }, 'no-quorum', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'con' }).code).toBe('QUORUM_REQUIRED')
    expect(reject({ ...active, phase: 'recessed' }, 'recessed', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'con' }).code).toBe('INVALID_PHASE')
  })

  it('clears queues whenever the authoritative question changes', () => {
    let state = activeMainState()
    ;({ state } = run(state, 'join-main', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'pro' }))
    ;({ state } = run(state, 'amend', 'delegate-1', 'delegate', { type: 'AmendMotion', motionId: 'amend-1', parentId: 'main-1', text: 'Cap it' }))
    expect(state.recognitionQueues).toEqual({ pro: [], con: [] })
    ;({ state } = run(state, 'second-amend', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'amend-1' }))
    ;({ state } = run(state, 'join-amend', 'delegate-2', 'delegate', { type: 'JoinRecognitionQueue', side: 'con' }))
    ;({ state } = run(state, 'dispose-amend', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'amend-1', disposition: 'adopted' }))
    expect(state.recognitionQueues).toEqual({ pro: [], con: [] })
    ;({ state } = run(state, 'join-restored', 'delegate-1', 'delegate', { type: 'JoinRecognitionQueue', side: 'pro' }))
    ;({ state } = run(state, 'dispose-main', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }))
    ;({ state } = run(state, 'new-main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-2', text: 'A new question' }))
    expect(state.recognitionQueues).toEqual({ pro: [], con: [] })
  })
})

function openQuorateState(): MeetingState {
  let state = createInitialState(profile)
  ;({ state } = run(state, 'initialize', 'admin-1', 'administrator', { type: 'InitializeMeeting', meetingId: 'meeting-1' }))
  ;({ state } = run(state, 'check-1', 'secretary-1', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate' }))
  ;({ state } = run(state, 'check-2', 'secretary-1', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-2', participantRole: 'delegate' }))
  ;({ state } = run(state, 'open', 'chair-1', 'chair', { type: 'OpenMeeting' }))
  return state
}

function activeMainState(): MeetingState {
  let state = openQuorateState()
  ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Fund the garden' }))
  ;({ state } = run(state, 'second', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
  return state
}

function run(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt: '2026-07-10T15:00:00.000Z', command })
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) throw new Error(decision.explanation)
  let next = state
  for (const event of decision.events) next = reduce(next, event)
  return { state: next, events: decision.events }
}

function reject(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt: '2026-07-10T15:00:00.000Z', command })
  expect(decision.accepted).toBe(false)
  if (decision.accepted) throw new Error('Expected rejection')
  return decision
}
