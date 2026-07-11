import { describe, expect, it } from 'vitest'
import { tallyBinaryVote, tallyPluralityVote, tallyRankedChoiceVote, tallyWeightedVote, type BallotRecord, type CandidateBallotRecord, type RankedBallotRecord, type VoteRuleSnapshot } from '../src/index.js'

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

  it('applies disclosed integer weights before evaluating the threshold', () => {
    const ballots: Record<string, BallotRecord> = {
      'delegate-1': { choice: 'yes', castAt: '2026-07-10T15:00:00.000Z' },
      'delegate-2': { choice: 'no', castAt: '2026-07-10T15:00:01.000Z' },
      'delegate-3': { choice: 'abstain', castAt: '2026-07-10T15:00:02.000Z' },
    }
    const weights = { 'delegate-1': 3, 'delegate-2': 2, 'delegate-3': 1 }
    const rule: VoteRuleSnapshot = {
      rulesProfileId: 'weighted',
      rulesProfileVersion: 1,
      threshold: { numerator: 1, denominator: 2, basis: 'votesCast' },
      tiePolicy: 'motionFails',
    }

    expect(tallyWeightedVote(ballots, weights, rule)).toEqual({
      yes: 3,
      no: 2,
      abstain: 1,
      ballotCount: 3,
      result: 'adopted',
    })
  })
})

describe('plurality vote tally', () => {
  it('reports tied candidates in configured option order', () => {
    const ballots: Record<string, CandidateBallotRecord> = {
      'delegate-1': { optionId: 'north', castAt: '2026-07-10T15:00:00.000Z' },
      'delegate-2': { optionId: 'south', castAt: '2026-07-10T15:00:01.000Z' },
      'delegate-3': { optionId: 'east', castAt: '2026-07-10T15:00:02.000Z' },
      'delegate-4': { optionId: 'south', castAt: '2026-07-10T15:00:03.000Z' },
      'delegate-5': { optionId: 'north', castAt: '2026-07-10T15:00:04.000Z' },
    }

    expect(tallyPluralityVote(ballots, ['east', 'north', 'south'])).toEqual({
      totals: { east: 1, north: 2, south: 2 },
      ballotCount: 5,
      result: 'tied',
      tiedOptionIds: ['north', 'south'],
    })
  })
})

describe('ranked-choice vote tally', () => {
  it('selects a candidate with a first-round majority', () => {
    const ballots: Record<string, RankedBallotRecord> = {
      'delegate-1': { ranking: ['north', 'south', 'east'], castAt: '2026-07-10T15:00:00.000Z' },
      'delegate-2': { ranking: ['north', 'east', 'south'], castAt: '2026-07-10T15:00:01.000Z' },
      'delegate-3': { ranking: ['south', 'north', 'east'], castAt: '2026-07-10T15:00:02.000Z' },
    }

    expect(tallyRankedChoiceVote(ballots, ['north', 'south', 'east'])).toEqual({
      ballotCount: 3,
      result: 'selected',
      winnerOptionId: 'north',
      rounds: [{
        round: 1,
        activeOptionIds: ['north', 'south', 'east'],
        totals: { north: 2, south: 1, east: 0 },
        exhausted: 0,
        eliminatedOptionIds: [],
      }],
    })
  })

  it('eliminates the lowest option and transfers its ballot', () => {
    const ballots: Record<string, RankedBallotRecord> = {
      n1: { ranking: ['north'], castAt: '2026-07-10T15:00:00.000Z' },
      n2: { ranking: ['north'], castAt: '2026-07-10T15:00:01.000Z' },
      s1: { ranking: ['south'], castAt: '2026-07-10T15:00:02.000Z' },
      s2: { ranking: ['south'], castAt: '2026-07-10T15:00:03.000Z' },
      e1: { ranking: ['east', 'north'], castAt: '2026-07-10T15:00:04.000Z' },
    }

    expect(tallyRankedChoiceVote(ballots, ['north', 'south', 'east'])).toEqual({
      ballotCount: 5,
      result: 'selected',
      winnerOptionId: 'north',
      rounds: [
        { round: 1, activeOptionIds: ['north', 'south', 'east'], totals: { north: 2, south: 2, east: 1 }, exhausted: 0, eliminatedOptionIds: ['east'] },
        { round: 2, activeOptionIds: ['north', 'south'], totals: { north: 3, south: 2 }, exhausted: 0, eliminatedOptionIds: [] },
      ],
    })
  })

  it('records exhausted ballots after elimination', () => {
    const ballots: Record<string, RankedBallotRecord> = {
      n1: { ranking: ['north'], castAt: '2026-07-10T15:00:00.000Z' },
      n2: { ranking: ['north'], castAt: '2026-07-10T15:00:01.000Z' },
      s1: { ranking: ['south'], castAt: '2026-07-10T15:00:02.000Z' },
      s2: { ranking: ['south'], castAt: '2026-07-10T15:00:03.000Z' },
      e1: { ranking: ['east'], castAt: '2026-07-10T15:00:04.000Z' },
    }

    expect(tallyRankedChoiceVote(ballots, ['north', 'south', 'east'])).toEqual({
      ballotCount: 5,
      result: 'tied',
      tiedOptionIds: ['north', 'south'],
      rounds: [
        { round: 1, activeOptionIds: ['north', 'south', 'east'], totals: { north: 2, south: 2, east: 1 }, exhausted: 0, eliminatedOptionIds: ['east'] },
        { round: 2, activeOptionIds: ['north', 'south'], totals: { north: 2, south: 2 }, exhausted: 1, eliminatedOptionIds: [] },
      ],
    })
  })

  it('reports a final tie without inventing a tie-break winner', () => {
    const ballots: Record<string, RankedBallotRecord> = {
      n1: { ranking: ['north', 'south'], castAt: '2026-07-10T15:00:00.000Z' },
      s1: { ranking: ['south', 'north'], castAt: '2026-07-10T15:00:01.000Z' },
    }

    expect(tallyRankedChoiceVote(ballots, ['north', 'south'])).toEqual({
      ballotCount: 2,
      result: 'tied',
      tiedOptionIds: ['north', 'south'],
      rounds: [{ round: 1, activeOptionIds: ['north', 'south'], totals: { north: 1, south: 1 }, exhausted: 0, eliminatedOptionIds: [] }],
    })
  })
})
