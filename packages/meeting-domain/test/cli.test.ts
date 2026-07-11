import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { canonicalStringify, type ReplayResult } from '../src/index.js'

const packageDirectory = fileURLToPath(new URL('..', import.meta.url))
const repositoryRoot = resolve(packageDirectory, '../..')
const fixtures = [
  ['ordinary-main-motion-counted-vote.jsonl', 'VoteOutcomeRecorded'],
  ['weighted-vote.jsonl', 'VoteOutcomeRecorded'],
  ['ranked-choice-vote.jsonl', 'VoteOutcomeRecorded'],
  ['amendment-debate-disposition.jsonl', 'MotionAmended'],
  ['point-ruling-appeal.jsonl', 'AppealOutcomeRecorded'],
  ['quorum-loss-restoration.jsonl', 'QuorumChanged'],
  ['alternate-activation.jsonl', 'AlternateActivated'],
  ['reasoned-correction.jsonl', 'ChairCorrectionApplied'],
  ['invalid-stale-rejection.jsonl', 'MeetingOpened'],
  ['completed-meeting.jsonl', 'MeetingAdjourned'],
] as const
const invalidFixtures = [
  ['malformed-line.jsonl', 2, /invalid JSON/],
  ['malformed-header.jsonl', 1, /format must be/],
  ['malformed-envelope.jsonl', 2, /command envelope must be an object/],
  ['invalid-common-field.jsonl', 2, /expectedVersion must be a nonnegative integer/],
  ['invalid-role.jsonl', 2, /role is invalid/],
  ['invalid-command-enum.jsonl', 2, /command.choice is invalid/],
  ['invalid-command-payload.jsonl', 2, /command.meetingId must be a string/],
  ['missing-correction-patch.jsonl', 2, /command.patch must be an object/],
  ['invalid-profile-threshold.jsonl', 1, /profile.motionThreshold.numerator must be a positive integer/],
] as const

describe('JSONL replay CLI', () => {
  for (const [fixture, namedEvent] of fixtures) {
    it(`replays ${fixture} canonically and deterministically`, () => {
      const first = runFixture(`packages/meeting-domain/fixtures/${fixture}`)
      const second = runFixture(`packages/meeting-domain/fixtures/${fixture}`)

      expect(first.status).toBe(0)
      expect(first.stderr).toBe('')
      expect(() => JSON.parse(first.stdout)).not.toThrow()
      expect(second.stdout).toBe(first.stdout)
      const result = JSON.parse(first.stdout) as ReplayResult
      expect(first.stdout).toBe(`${canonicalStringify(result)}\n`)
      expect(result.events.some((event) => event.type === namedEvent)).toBe(true)
      expectFixtureBehavior(fixture, result)
    })
  }

  it.each(invalidFixtures)('rejects %s without partial stdout', (fixture, line, message) => {
    const result = runFixture(`packages/meeting-domain/test/fixtures/${fixture}`)

    expect(result.status).not.toBe(0)
    expect(result.stdout).toBe('')
    expect(result.stderr).toContain(`packages/meeting-domain/test/fixtures/${fixture}:`)
    expect(result.stderr).toContain(`:${line}:`)
    expect(result.stderr).toMatch(message)
  })
})

function runFixture(fixture: string) {
  return spawnSync('pnpm', [
    '--silent', '--filter', '@subculture/roberts-rules-meeting-domain', 'replay', fixture,
  ], { cwd: repositoryRoot, encoding: 'utf8' })
}

function expectFixtureBehavior(fixture: typeof fixtures[number][0], result: ReplayResult): void {
  const rejected = result.decisions.filter((decision) => !decision.accepted)
  if (fixture === 'invalid-stale-rejection.jsonl') {
    expect(rejected.map((decision) => decision.code)).toEqual([
      'ROLE_FORBIDDEN', 'STALE_VERSION',
    ])
    return
  }
  expect(rejected).toEqual([])
  if (fixture === 'quorum-loss-restoration.jsonl') {
    expect(result.events.filter((event) => event.type === 'QuorumChanged')).toHaveLength(3)
    expect(result.state.quorum.met).toBe(true)
  } else if (fixture === 'completed-meeting.jsonl') {
    expect(result.state.phase).toBe('adjourned')
  } else if (fixture === 'amendment-debate-disposition.jsonl') {
    expect(result.events.some((event) => event.type === 'DebateOpened')).toBe(true)
    expect(result.state.motions['main-1']?.disposition).toBe('adopted as amended')
  } else if (fixture === 'ordinary-main-motion-counted-vote.jsonl') {
    expect(result.state.outcomes).toEqual([expect.objectContaining({
      yes: 1, no: 1, abstain: 0, result: 'rejected', visibility: 'nonSecretSimulator',
    })])
  } else if (fixture === 'weighted-vote.jsonl') {
    expect(result.state.outcomes).toEqual([expect.objectContaining({
      method: 'weighted', weights: { 'delegate-1': 3, 'delegate-2': 2, 'delegate-3': 1 },
      yes: 3, no: 2, abstain: 1, ballotCount: 3, result: 'adopted', visibility: 'nonSecretSimulator',
    })])
  } else if (fixture === 'ranked-choice-vote.jsonl') {
    expect(result.state.outcomes).toEqual([expect.objectContaining({
      method: 'rankedChoice', result: 'selected', winnerOptionId: 'north', ballotCount: 5,
      rounds: [
        expect.objectContaining({ round: 1, totals: { north: 2, south: 2, east: 1 }, eliminatedOptionIds: ['east'] }),
        expect.objectContaining({ round: 2, totals: { north: 3, south: 2 }, eliminatedOptionIds: [] }),
      ],
      visibility: 'nonSecretSimulator',
    })])
  } else if (fixture === 'alternate-activation.jsonl') {
    expect(result.state.attendance['alternate-2']).toMatchObject({ active: true, alternateFor: 'delegate-2' })
    expect(result.state.quorum).toEqual({ met: true, present: 2, required: 2 })
  } else if (fixture === 'point-ruling-appeal.jsonl') {
    expect(result.state.pointsOfOrder['point-1']).toMatchObject({ status: 'final', appeal: { outcome: 'overturned', status: 'decided' } })
  } else if (fixture === 'reasoned-correction.jsonl') {
    expect(result.state.motions['main-1']?.text).toBe('Fund the garden')
    expect(result.state.corrections).toEqual([expect.objectContaining({
      correctionId: 'correction-1', affectedEventId: 'main:0', reason: 'Correct a clerical transcription error',
    })])
  }
}
