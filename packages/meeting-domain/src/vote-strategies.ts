import type { BallotRecord, VoteResult, VoteRuleSnapshot } from './types.js'

export interface BinaryVoteTally {
  yes: number
  no: number
  abstain: number
  result: VoteResult
}

export interface WeightedVoteTally extends BinaryVoteTally {
  ballotCount: number
}

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
