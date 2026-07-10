import { describe, expect, it } from 'vitest'

import {
  canonicalStringify,
  replay,
  type CommandEnvelope,
  type RulesProfile,
} from '../src/index.js'

const profile: RulesProfile = {
  id: 'fixture-rules',
  version: 1,
  quorum: { type: 'fixed', minimum: 1 },
  debate: { defaultDurationSeconds: 600 },
  voteMethods: ['counted'],
  motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' },
  tiePolicy: 'motionFails',
  overrides: { quorumIndependentActions: [] },
}

describe('command transcript replay', () => {
  it('returns byte-equivalent results for the same transcript', () => {
    const commands: readonly CommandEnvelope[] = [initialize(), {
      id: 'open-stale',
      expectedVersion: 0,
      actorId: 'chair-1',
      role: 'chair',
      occurredAt: '2026-07-10T15:01:00.000Z',
      command: { type: 'OpenMeeting' },
    }]

    const first = replay(profile, commands)
    const second = replay(profile, commands)

    expect(canonicalStringify(first)).toBe(canonicalStringify(second))
    expect(first.events).toHaveLength(1)
    expect(first.decisions).toHaveLength(2)
    expect(first.decisions[1]).toMatchObject({ accepted: false, code: 'STALE_VERSION' })
    expect(first.state.version).toBe(1)
  })
})

function initialize(): CommandEnvelope {
  return {
    id: 'initialize',
    expectedVersion: 0,
    actorId: 'admin-1',
    role: 'administrator',
    occurredAt: '2026-07-10T15:00:00.000Z',
    command: { type: 'InitializeMeeting', meetingId: 'fixture-meeting' },
  }
}
