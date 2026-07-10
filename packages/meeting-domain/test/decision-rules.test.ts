import { describe, expect, it } from 'vitest'

import {
  createInitialState,
  decide,
  reduce,
  type CommandEnvelope,
  type MeetingState,
  type RulesProfile,
} from '../src/index.js'

const profile: RulesProfile = {
  id: 'standard',
  version: 1,
  quorum: { type: 'fixed', minimum: 2 },
  debate: { defaultDurationSeconds: 600 },
  voteMethods: ['counted'],
  motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' },
  tiePolicy: 'motionFails',
  overrides: { quorumIndependentActions: [] },
}

describe('decision rules', () => {
  it('replays an accepted decision for a duplicate command ID without adding events', () => {
    const initial = createInitialState(profile)
    const envelope = initializeEnvelope()
    const original = decide(profile, initial, envelope)
    expect(original.accepted).toBe(true)
    if (!original.accepted) throw new Error(original.explanation)
    const state = apply(initial, original.events)

    const duplicate = decide(profile, state, envelope)

    expect(duplicate).toEqual(original)
    expect(state.version).toBe(1)
  })

  it('replays the complete original decision for a duplicate two-event command', () => {
    let state = createInitialState(profile)
    const initialized = decide(profile, state, initializeEnvelope())
    if (!initialized.accepted) throw new Error(initialized.explanation)
    state = apply(state, initialized.events)

    const firstCheckIn = attendanceEnvelope('check-in-1', state.version, 'delegate-1')
    const firstDecision = decide(profile, state, firstCheckIn)
    if (!firstDecision.accepted) throw new Error(firstDecision.explanation)
    state = apply(state, firstDecision.events)

    const quorumChangingEnvelope = attendanceEnvelope('check-in-2', state.version, 'delegate-2')
    const original = decide(profile, state, quorumChangingEnvelope)
    expect(original.accepted && original.events.map((event) => event.type)).toEqual([
      'ParticipantCheckedIn',
      'QuorumChanged',
    ])
    if (!original.accepted) throw new Error(original.explanation)
    state = apply(state, original.events)

    expect(decide(profile, state, quorumChangingEnvelope)).toEqual(original)
    expect(state.version).toBe(4)
  })

  it('returns the same rejection when a rejected envelope is retried against unchanged state', () => {
    const state = createInitialState(profile)
    const envelope: CommandEnvelope = {
      ...initializeEnvelope(),
      id: 'forbidden-initialize',
      role: 'observer',
      actorId: 'observer-1',
    }

    const first = decide(profile, state, envelope)
    const retry = decide(profile, state, envelope)

    expect(first).toEqual({
      accepted: false,
      code: 'ROLE_FORBIDDEN',
      explanation: 'Only an administrator or chair may initialize a meeting',
    })
    expect(retry).toEqual(first)
    expect(state.processedCommands).toEqual({})
  })

  it('rejects a stale command before command-specific checks', () => {
    const initial = createInitialState(profile)
    const initialized = decide(profile, initial, initializeEnvelope())
    if (!initialized.accepted) throw new Error(initialized.explanation)
    const state = apply(initial, initialized.events)

    expect(decide(profile, state, { ...initializeEnvelope(), id: 'stale', role: 'observer' })).toEqual({
      accepted: false,
      code: 'STALE_VERSION',
      explanation: 'Expected aggregate version 0, received 1',
    })
  })

  it('rejects lifecycle commands with the wrong role or phase', () => {
    const initial = createInitialState(profile)
    const initialized = decide(profile, initial, initializeEnvelope())
    if (!initialized.accepted) throw new Error(initialized.explanation)
    const state = apply(initial, initialized.events)
    const base = {
      expectedVersion: state.version,
      occurredAt: '2026-07-10T15:01:00.000Z',
      command: { type: 'OpenMeeting' } as const,
    }

    expect(decide(profile, state, { ...base, id: 'wrong-role', actorId: 'secretary-1', role: 'secretary' })).toMatchObject({
      accepted: false,
      code: 'ROLE_FORBIDDEN',
    })
    expect(decide(profile, createInitialState(profile), {
      ...base, id: 'wrong-phase', expectedVersion: 0, actorId: 'chair-1', role: 'chair',
    })).toMatchObject({ accepted: false, code: 'INVALID_PHASE' })
  })
})

function initializeEnvelope(): CommandEnvelope {
  return {
    id: 'initialize',
    expectedVersion: 0,
    actorId: 'admin-1',
    role: 'administrator',
    occurredAt: '2026-07-10T15:00:00.000Z',
    command: { type: 'InitializeMeeting', meetingId: 'meeting-1' },
  }
}

function attendanceEnvelope(id: string, expectedVersion: number, participantId: string): CommandEnvelope {
  return {
    id,
    expectedVersion,
    actorId: 'secretary-1',
    role: 'secretary',
    occurredAt: '2026-07-10T15:01:00.000Z',
    command: { type: 'CheckInParticipant', participantId, participantRole: 'delegate' },
  }
}

function apply(state: MeetingState, events: readonly Parameters<typeof reduce>[1][]): MeetingState {
  return events.reduce(reduce, state)
}
