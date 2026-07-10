import { describe, expect, it } from 'vitest'

import { createInitialState, reduce, type MeetingEvent, type RulesProfile } from '../src/index.js'

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

describe('journal replay', () => {
  it('rejects skipped, duplicate, and out-of-order aggregate versions', () => {
    const initial = createInitialState(profile)
    const first: MeetingEvent = {
      id: 'initialize:0',
      type: 'MeetingInitialized',
      aggregateVersion: 1,
      occurredAt: '2026-07-10T15:00:00.000Z',
      causationId: 'initialize',
      payload: { meetingId: 'meeting-1', rulesProfileId: profile.id, rulesProfileVersion: profile.version },
    }

    expect(() => reduce(initial, { ...first, aggregateVersion: 2 })).toThrow(
      'Invalid aggregate version: expected 1, received 2',
    )

    const afterFirst = reduce(initial, first)
    expect(() => reduce(afterFirst, first)).toThrow('Invalid aggregate version: expected 2, received 1')
    expect(() => reduce(afterFirst, { ...first, aggregateVersion: 0 })).toThrow(
      'Invalid aggregate version: expected 2, received 0',
    )
  })

  it('rejects an invalid payload received at an untrusted journal boundary', () => {
    const malformed = {
      id: 'quorum:0',
      type: 'QuorumChanged',
      aggregateVersion: 1,
      occurredAt: '2026-07-10T15:00:00.000Z',
      causationId: 'quorum',
      payload: { present: 'two', required: 2, met: true },
    } as unknown as MeetingEvent

    expect(() => reduce(createInitialState(profile), malformed)).toThrow('Invalid event payload')
  })
})
