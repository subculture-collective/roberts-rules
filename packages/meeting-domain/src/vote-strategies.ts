import type { BallotRecord, CandidateBallotRecord, RankedBallotRecord, RankedChoiceRound, VoteResult, VoteRuleSnapshot } from './types.js'

export interface BinaryVoteTally {
  yes: number
  no: number
  abstain: number
  result: VoteResult
}

export interface WeightedVoteTally extends BinaryVoteTally {
  ballotCount: number
}

export type PluralityVoteTally =
  | { totals: Readonly<Record<string, number>>; ballotCount: number; result: 'selected'; winnerOptionId: string }
  | { totals: Readonly<Record<string, number>>; ballotCount: number; result: 'tied'; tiedOptionIds: readonly string[] }

export type RankedChoiceVoteTally =
  | { ballotCount: number; result: 'selected'; winnerOptionId: string; rounds: readonly RankedChoiceRound[] }
  | { ballotCount: number; result: 'tied'; tiedOptionIds: readonly string[]; rounds: readonly RankedChoiceRound[] }

export function tallyBinaryVote(
  ballots: Readonly<Record<string, BallotRecord>>,
  rule: VoteRuleSnapshot,
): BinaryVoteTally {
  const choices = Object.values(ballots).map((ballot) => ballot.choice)
  const yes = choices.filter((choice) => choice === 'yes').length
  const no = choices.filter((choice) => choice === 'no').length
  const abstain = choices.filter((choice) => choice === 'abstain').length
  const tied = yes === no
  const result = tied
    ? rule.tiePolicy === 'chairDecides' ? 'tied' : 'rejected'
    : yes * rule.threshold.denominator >= (yes + no) * rule.threshold.numerator
      ? 'adopted'
      : 'rejected'

  return { yes, no, abstain, result }
}

export function tallyWeightedVote(
  ballots: Readonly<Record<string, BallotRecord>>,
  weights: Readonly<Record<string, number>>,
  rule: VoteRuleSnapshot,
): WeightedVoteTally {
  let yes = 0
  let no = 0
  let abstain = 0

  for (const [voterId, ballot] of Object.entries(ballots)) {
    const weight = weights[voterId]
    if (!Number.isSafeInteger(weight) || weight <= 0) throw new Error(`Missing valid weight for ballot voter ${voterId}`)
    if (ballot.choice === 'yes') yes += weight
    else if (ballot.choice === 'no') no += weight
    else abstain += weight
  }

  const tied = yes === no
  const result = tied
    ? rule.tiePolicy === 'chairDecides' ? 'tied' : 'rejected'
    : yes * rule.threshold.denominator >= (yes + no) * rule.threshold.numerator
      ? 'adopted'
      : 'rejected'

  return { yes, no, abstain, ballotCount: Object.keys(ballots).length, result }
}

export function tallyPluralityVote(
  ballots: Readonly<Record<string, CandidateBallotRecord>>,
  optionIds: readonly string[],
): PluralityVoteTally {
  const totals: Record<string, number> = Object.fromEntries(optionIds.map((optionId) => [optionId, 0]))
  for (const ballot of Object.values(ballots)) {
    if (totals[ballot.optionId] === undefined) throw new Error(`Unknown plurality option ${ballot.optionId}`)
    totals[ballot.optionId] += 1
  }
  const highest = Math.max(...Object.values(totals))
  const leaders = optionIds.filter((optionId) => totals[optionId] === highest)
  const common = { totals, ballotCount: Object.keys(ballots).length }
  return leaders.length === 1
    ? { ...common, result: 'selected', winnerOptionId: leaders[0]! }
    : { ...common, result: 'tied', tiedOptionIds: leaders }
}

export function tallyRankedChoiceVote(
  ballots: Readonly<Record<string, RankedBallotRecord>>,
  optionIds: readonly string[],
): RankedChoiceVoteTally {
  let activeOptionIds = [...optionIds]
  const rounds: RankedChoiceRound[] = []

  for (let round = 1; ; round += 1) {
    const active = new Set(activeOptionIds)
    const totals: Record<string, number> = Object.fromEntries(activeOptionIds.map((optionId) => [optionId, 0]))
    let exhausted = 0
    for (const ballot of Object.values(ballots)) {
      const preference = ballot.ranking.find((optionId) => active.has(optionId))
      if (preference === undefined) exhausted += 1
      else totals[preference] += 1
    }

    const activeBallots = Object.values(totals).reduce((sum, total) => sum + total, 0)
    const winnerOptionId = activeOptionIds.find((optionId) => totals[optionId]! * 2 > activeBallots)
    if (winnerOptionId !== undefined) {
      rounds.push({ round, activeOptionIds, totals, exhausted, eliminatedOptionIds: [] })
      return { ballotCount: Object.keys(ballots).length, result: 'selected', winnerOptionId, rounds }
    }

    const lowest = Math.min(...activeOptionIds.map((optionId) => totals[optionId]!))
    const eliminatedOptionIds = activeOptionIds.filter((optionId) => totals[optionId] === lowest)
    if (eliminatedOptionIds.length === activeOptionIds.length) {
      rounds.push({ round, activeOptionIds, totals, exhausted, eliminatedOptionIds: [] })
      return { ballotCount: Object.keys(ballots).length, result: 'tied', tiedOptionIds: activeOptionIds, rounds }
    }
    rounds.push({ round, activeOptionIds, totals, exhausted, eliminatedOptionIds })
    const eliminated = new Set(eliminatedOptionIds)
    activeOptionIds = activeOptionIds.filter((optionId) => !eliminated.has(optionId))
  }
}
