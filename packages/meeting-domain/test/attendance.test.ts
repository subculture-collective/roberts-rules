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
  id: 'standard',
  version: 1,
  quorum: { type: 'fixed', minimum: 2 },
  debate: { defaultDurationSeconds: 600 },
  voteMethods: ['counted'],
  tiePolicy: 'motionFails',
  overrides: { quorumIndependentActions: [] },
}

describe('attendance and quorum', () => {
  it('emits quorum transitions and activates a checked-in alternate for an absent delegate', () => {
    let state = initializedState()

    ;({ state } = run(state, 'check-in-1', {
      type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate',
    }))
    expect(state.quorum).toEqual({ present: 1, required: 2, met: false })

    const reached = run(state, 'check-in-2', {
      type: 'CheckInParticipant', participantId: 'delegate-2', participantRole: 'delegate',
    })
    state = reached.state
    expect(reached.eventTypes).toEqual(['ParticipantCheckedIn', 'QuorumChanged'])
    expect(reached.eventVersions).toEqual([3, 4])
    expect(state.quorum.met).toBe(true)

    const lost = run(state, 'check-out-2', { type: 'CheckOutParticipant', participantId: 'delegate-2' })
    state = lost.state
    expect(lost.eventTypes).toEqual(['ParticipantCheckedOut', 'QuorumChanged'])
    expect(state.quorum.met).toBe(false)

    ;({ state } = run(state, 'alternate-check-in', {
      type: 'CheckInParticipant', participantId: 'alternate-2', participantRole: 'alternate', alternateFor: 'delegate-2',
    }))
    const restored = run(state, 'activate-alternate', {
      type: 'ActivateAlternate', alternateId: 'alternate-2', delegateId: 'delegate-2',
    })

    expect(restored.eventTypes).toEqual(['AlternateActivated', 'QuorumChanged'])
    expect(restored.state.quorum).toEqual({ present: 2, required: 2, met: true })
    expect(restored.state.attendance['alternate-2']).toMatchObject({ active: true, alternateFor: 'delegate-2' })
  })

  it('deactivates the prior alternate when another alternate takes the same seat', () => {
    let state = initializedState()
    ;({ state } = run(state, 'alternate-a-in', {
      type: 'CheckInParticipant', participantId: 'alternate-a', participantRole: 'alternate', alternateFor: 'delegate-1',
    }))
    ;({ state } = run(state, 'alternate-b-in', {
      type: 'CheckInParticipant', participantId: 'alternate-b', participantRole: 'alternate', alternateFor: 'delegate-1',
    }))
    ;({ state } = run(state, 'activate-a', {
      type: 'ActivateAlternate', alternateId: 'alternate-a', delegateId: 'delegate-1',
    }))

    const replaced = run(state, 'activate-b', {
      type: 'ActivateAlternate', alternateId: 'alternate-b', delegateId: 'delegate-1',
    })

    expect(replaced.state.attendance['alternate-a']?.active).toBe(false)
    expect(replaced.state.attendance['alternate-b']?.active).toBe(true)
    expect(replaced.state.quorum.present).toBe(1)
  })

  it('deactivates active alternates when their delegate checks back in', () => {
    let state = initializedState()
    ;({ state } = run(state, 'delegate-in', {
      type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate',
    }))
    ;({ state } = run(state, 'delegate-out', { type: 'CheckOutParticipant', participantId: 'delegate-1' }))
    ;({ state } = run(state, 'alternate-in', {
      type: 'CheckInParticipant', participantId: 'alternate-1', participantRole: 'alternate', alternateFor: 'delegate-1',
    }))
    ;({ state } = run(state, 'alternate-active', {
      type: 'ActivateAlternate', alternateId: 'alternate-1', delegateId: 'delegate-1',
    }))

    const returned = run(state, 'delegate-returned', {
      type: 'CheckInParticipant', participantId: 'delegate-1', participantRole: 'delegate',
    })

    expect(returned.state.attendance['delegate-1']?.active).toBe(true)
    expect(returned.state.attendance['alternate-1']?.active).toBe(false)
    expect(returned.state.quorum.present).toBe(1)
  })
})

function initializedState(): MeetingState {
  const state = createInitialState(profile)
  return run(state, 'initialize', { type: 'InitializeMeeting', meetingId: 'meeting-1' }, 'administrator').state
}

function run(state: MeetingState, id: string, command: MeetingCommand, role: CommandEnvelope['role'] = 'secretary') {
  const decision = decide(profile, state, {
    id,
    expectedVersion: state.version,
    actorId: `${role}-1`,
    role,
    occurredAt: '2026-07-10T15:00:00.000Z',
    command,
  })
  expect(decision.accepted).toBe(true)
  if (!decision.accepted) throw new Error(decision.explanation)
  let next = state
  for (const event of decision.events) next = reduce(next, event)
  return {
    state: next,
    eventTypes: decision.events.map((event) => event.type),
    eventVersions: decision.events.map((event) => event.aggregateVersion),
  }
}
