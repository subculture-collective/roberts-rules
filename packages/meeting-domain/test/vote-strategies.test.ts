import { describe, expect, it } from 'vitest'
import { tallyBinaryVote, type BallotRecord, type VoteRuleSnapshot } from '../src/index.js'

describe('binary vote tally', () => {
  it('applies a snapshotted threshold with deterministic integer math', () => {
    const ballots: Record<string, BallotRecord> = {
      'delegate-1': { choice: 'yes', castAt: '2026-07-10T15:00:00.000Z' },
      'delegate-2': { choice: 'yes', castAt: '2026-07-10T15:00:01.000Z' },
      'delegate-3': { choice: 'no', castAt: '2026-07-10T15:00:02.000Z' },
      'delegate-4': { choice: 'abstain', castAt: '2026-07-10T15:00:03.000Z' },
    }
    const rule: VoteRuleSnapshot = {
      rulesProfileId: 'standard',
      rulesProfileVersion: 1,
      threshold: { numerator: 2, denominator: 3, basis: 'votesCast' },
      tiePolicy: 'motionFails',
    }

    expect(tallyBinaryVote(ballots, rule)).toEqual({
      yes: 2,
      no: 1,
      abstain: 1,
      result: 'adopted',
    })
  })
})
