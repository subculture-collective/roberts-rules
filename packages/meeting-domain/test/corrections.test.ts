import { describe, expect, it } from 'vitest'
import { createInitialState, decide, reduce, type CommandEnvelope, type MeetingCommand, type MeetingState, type RulesProfile } from '../src/index.js'

const profile: RulesProfile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 2 }, debate: { defaultDurationSeconds: 600 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } }
const NOW = '2026-07-10T15:00:00.000Z'

describe('reasoned compensating corrections', () => {
  it('corrects projected motion text without rewriting the affected event', () => {
    let state = disposedState()
    const affected = state.processedCommands.dispose?.events[0]
    const snapshot = structuredClone(affected)
    ;({ state } = run(state, 'correction', 'chair-1', 'chair', { type: 'ApplyChairCorrection', correctionId: ' correction-1 ', affectedEventId: 'main:0', reason: '  Clerical transcription error  ', patch: { type: 'motionText', motionId: ' main-1 ', correctedText: '  Corrected motion text  ' } }))
    expect(state.motions['main-1']?.text).toBe('Corrected motion text')
    expect(state.corrections).toEqual([{ correctionId: 'correction-1', affectedEventId: 'main:0', reason: 'Clerical transcription error', actorId: 'chair-1', actorRole: 'chair', correctedAt: NOW, patch: { type: 'motionText', motionId: 'main-1', correctedText: 'Corrected motion text' } }])
    expect(state.processedCommands.dispose?.events[0]).toEqual(snapshot)
    expect(state.processedCommands.dispose?.events[0]).toBe(affected)
  })

  it('lets a parliamentarian correct agenda title and disposed-motion disposition after adjournment without quorum', () => {
    let state = disposedState()
    ;({ state } = run(state, 'out-1', 'secretary', 'secretary', { type: 'CheckOutParticipant', participantId: 'delegate-1' }))
    ;({ state } = run(state, 'out-2', 'secretary', 'secretary', { type: 'CheckOutParticipant', participantId: 'delegate-2' }))
    ;({ state } = run(state, 'adjourn', 'chair-1', 'chair', { type: 'AdjournMeeting' }))
    expect(state.quorum.met).toBe(false)
    ;({ state } = run(state, 'agenda-correction', 'parliamentarian-1', 'parliamentarian', { type: 'ApplyChairCorrection', correctionId: 'agenda-fix', affectedEventId: 'agenda:0', reason: 'Minutes review', patch: { type: 'agendaTitle', itemId: ' business ', correctedTitle: '  New business  ' } }))
    ;({ state } = run(state, 'disposition-correction', 'parliamentarian-1', 'parliamentarian', { type: 'ApplyChairCorrection', correctionId: 'disposition-fix', affectedEventId: 'dispose:0', reason: 'Teller report', patch: { type: 'motionDisposition', motionId: 'main-1', correctedDisposition: ' adopted as amended ' } }))
    expect(state.agenda[0]?.title).toBe('New business')
    expect(state.motions['main-1']?.disposition).toBe('adopted as amended')
    expect(state.corrections).toHaveLength(2)
  })

  it('rejects invalid authority, references, IDs, reasons, values, and targets', () => {
    const state = disposedState()
    expect(reject(state, 'wrong-role', 'secretary', 'secretary', correction({ correctionId: 'c', affectedEventId: 'dispose:0' })).code).toBe('ROLE_FORBIDDEN')
    expect(reject(state, 'unknown-event', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'missing:0' })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-id', 'chair-1', 'chair', correction({ correctionId: '  ', affectedEventId: 'dispose:0' })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-reason', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'dispose:0', reason: '  ' })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'blank-value', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'dispose:0', patch: { type: 'motionText', motionId: 'main-1', correctedText: '  ' } })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'missing-target', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'dispose:0', patch: { type: 'agendaTitle', itemId: 'missing', correctedTitle: 'Title' } })).code).toBe('INVALID_COMMAND')
    expect(reject(activeState(), 'wrong-status', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'main:0', patch: { type: 'motionDisposition', motionId: 'main-1', correctedDisposition: 'adopted' } })).code).toBe('INVALID_COMMAND')
    expect(reject(createInitialState(profile), 'uninitialized', 'chair-1', 'chair', correction({ correctionId: 'c', affectedEventId: 'dispose:0' })).code).toBe('INVALID_PHASE')
    const invalidTime = decide(profile, state, { id: 'invalid-time', expectedVersion: state.version, actorId: 'chair-1', role: 'chair', occurredAt: 'not-a-time', command: correction({ correctionId: 'c', affectedEventId: 'dispose:0' }) })
    expect(invalidTime).toMatchObject({ accepted: false, code: 'INVALID_COMMAND' })
  })

  it('deduplicates accepted corrections and replays their event deterministically', () => {
    const base = disposedState()
    const command = correction({ correctionId: 'c-1', affectedEventId: 'main:0' })
    const envelope = { id: 'correction', expectedVersion: base.version, actorId: 'chair-1', role: 'chair' as const, occurredAt: NOW, command }
    const decision = decide(profile, base, envelope)
    expect(decision.accepted).toBe(true)
    if (!decision.accepted) throw new Error(decision.explanation)
    const projected = reduce(base, decision.events[0]!)
    expect(decide(profile, projected, { ...envelope, expectedVersion: -1 })).toEqual(decision)
    expect(projected.corrections).toHaveLength(1)
    expect(reduce(base, decision.events[0]!)).toEqual(projected)
    expect(reject(projected, 'other-command', 'chair-1', 'chair', correction({ correctionId: 'c-1', affectedEventId: 'dispose:0' })).code).toBe('INVALID_COMMAND')
  })

  it('rejects unrelated existing events for every patch kind', () => {
    const state = disposedState()
    expect(reject(state, 'wrong-motion-event', 'chair-1', 'chair', correction({ correctionId: 'c1', affectedEventId: 'agenda:0', patch: { type: 'motionText', motionId: 'main-1', correctedText: 'Text' } })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'wrong-agenda-event', 'chair-1', 'chair', correction({ correctionId: 'c2', affectedEventId: 'main:0', patch: { type: 'agendaTitle', itemId: 'business', correctedTitle: 'Title' } })).code).toBe('INVALID_COMMAND')
    expect(reject(state, 'wrong-disposition-event', 'chair-1', 'chair', correction({ correctionId: 'c3', affectedEventId: 'main:0', patch: { type: 'motionDisposition', motionId: 'main-1', correctedDisposition: 'rejected' } })).code).toBe('INVALID_COMMAND')
  })

  it('chains corrections through prior correction events and preserves all prior decisions', () => {
    let state = disposedState()
    const prior = Object.fromEntries(Object.entries(state.processedCommands).map(([id, decision]) => [id, { identity: decision, snapshot: structuredClone(decision) }]))
    ;({ state } = run(state, 'correction-1', 'chair-1', 'chair', correction({ correctionId: 'c1', affectedEventId: 'main:0', patch: { type: 'motionText', motionId: 'main-1', correctedText: 'First correction' } })))
    ;({ state } = run(state, 'correction-2', 'parliamentarian-1', 'parliamentarian', correction({ correctionId: 'c2', affectedEventId: 'correction-1:0', patch: { type: 'motionText', motionId: 'main-1', correctedText: 'Latest correction' } })))
    expect(state.motions['main-1']?.text).toBe('Latest correction')
    expect(state.corrections.map((record) => record.correctionId)).toEqual(['c1', 'c2'])
    for (const [id, expected] of Object.entries(prior)) {
      expect(state.processedCommands[id]).toBe(expected.identity)
      expect(state.processedCommands[id]).toEqual(expected.snapshot)
    }
  })
})

function correction(overrides: Partial<Extract<MeetingCommand, { type: 'ApplyChairCorrection' }>>): Extract<MeetingCommand, { type: 'ApplyChairCorrection' }> {
  return { type: 'ApplyChairCorrection', correctionId: 'c-1', affectedEventId: 'main:0', reason: 'Clerical error', patch: { type: 'motionText', motionId: 'main-1', correctedText: 'Corrected' }, ...overrides }
}

function disposedState(): MeetingState {
  let state = activeState()
  ;({ state } = run(state, 'dispose', 'chair-1', 'chair', { type: 'DisposeMotion', motionId: 'main-1', disposition: 'adopted' }))
  return state
}
function activeState(): MeetingState {
  let state = createInitialState(profile)
  ;({ state } = run(state, 'init', 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'm' }))
  ;({ state } = run(state, 'in-1', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate' }))
  ;({ state } = run(state, 'in-2', 'secretary', 'secretary', { type: 'CheckInParticipant', participantId: 'delegate-2', participantRole: 'delegate' }))
  ;({ state } = run(state, 'open', 'chair-1', 'chair', { type: 'OpenMeeting' }))
  ;({ state } = run(state, 'agenda', 'chair-1', 'chair', { type: 'AdoptAgenda', items: [{ id: 'business', title: 'Business' }] }))
  ;({ state } = run(state, 'main', 'delegate-1', 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Original text' }))
  ;({ state } = run(state, 'second', 'delegate-2', 'delegate', { type: 'SecondMotion', motionId: 'main-1' }))
  return state
}
function run(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt: NOW, command })
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) throw new Error(decision.explanation)
  let next = state
  for (const event of decision.events) next = reduce(next, event)
  return { state: next, events: decision.events }
}
function reject(state: MeetingState, id: string, actorId: string, role: CommandEnvelope['role'], command: MeetingCommand) {
  const decision = decide(profile, state, { id, expectedVersion: state.version, actorId, role, occurredAt: NOW, command })
  expect(decision.accepted).toBe(false)
  if (decision.accepted) throw new Error('Expected rejection')
  return decision
}
