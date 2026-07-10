import { decide } from './decide.js'
import { createInitialState, reduce } from './reduce.js'
import type { CommandEnvelope, Decision, MeetingEvent, MeetingState, RulesProfile } from './types.js'

export interface ReplayResult {
  readonly state: MeetingState
  readonly events: readonly MeetingEvent[]
  readonly decisions: readonly Decision[]
}

export function replay(profile: RulesProfile, commands: readonly CommandEnvelope[]): ReplayResult {
  let state = createInitialState(profile)
  const events: MeetingEvent[] = []
  const decisions: Decision[] = []

  for (const envelope of commands) {
    const decision = decide(profile, state, envelope)
    decisions.push(decision)
    if (!decision.accepted) continue
    for (const event of decision.events) {
      state = reduce(state, event)
      events.push(event)
    }
  }

  return { state, events, decisions }
}
