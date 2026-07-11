import type { BallotRecord, VoteResult, VoteRuleSnapshot } from './types.js'

export interface BinaryVoteTally {
  yes: number
  no: number
  abstain: number
  result: VoteResult
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
