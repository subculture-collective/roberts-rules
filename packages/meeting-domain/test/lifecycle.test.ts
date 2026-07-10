import { describe, expect, it } from 'vitest'

import {
  createInitialState,
  decide,
  reduce,
  type CommandEnvelope,
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

describe('meeting lifecycle', () => {
  it('initializes a meeting through the public command API', () => {
    const state = createInitialState(profile)
    const envelope: CommandEnvelope = {
      id: 'command-1',
      expectedVersion: 0,
      actorId: 'admin-1',
      role: 'administrator',
      occurredAt: '2026-07-10T15:00:00.000Z',
      command: { type: 'InitializeMeeting', meetingId: 'meeting-1' },
    }

    const decision = decide(profile, state, envelope)

    expect(decision).toEqual({
      accepted: true,
      events: [
        {
          id: 'command-1:0',
          type: 'MeetingInitialized',
          aggregateVersion: 1,
          occurredAt: envelope.occurredAt,
          causationId: envelope.id,
          payload: { meetingId: 'meeting-1', rulesProfileId: 'standard', rulesProfileVersion: 1 },
        },
      ],
    })
    expect(reduce(state, decision.accepted ? decision.events[0] : neverEvent())).toMatchObject({
      meetingId: 'meeting-1',
      phase: 'initialized',
      version: 1,
    })
  })

  it('opens, recesses, resumes, and adjourns a meeting in order', () => {
    let state = createInitialState(profile)
    const commandTypes = [
      { type: 'InitializeMeeting', meetingId: 'meeting-1' } as const,
      { type: 'OpenMeeting' } as const,
      { type: 'RecessMeeting' } as const,
      { type: 'ResumeMeeting' } as const,
      { type: 'AdjournMeeting' } as const,
    ]

    for (const [index, command] of commandTypes.entries()) {
      const decision = decide(profile, state, {
        id: `lifecycle-${index}`,
        expectedVersion: state.version,
        actorId: index === 0 ? 'admin-1' : 'chair-1',
        role: index === 0 ? 'administrator' : 'chair',
        occurredAt: `2026-07-10T15:0${index}:00.000Z`,
        command,
      })
      expect(decision.accepted).toBe(true)
      if (decision.accepted) {
        for (const event of decision.events) state = reduce(state, event)
      }
    }

    expect(state.phase).toBe('adjourned')
    expect(state.version).toBe(5)
  })
})

function neverEvent(): never {
  throw new Error('expected an accepted decision')
}
