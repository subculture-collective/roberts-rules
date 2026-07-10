import { describe, expect, it } from 'vitest'
import fc from 'fast-check'

import {
  canonicalStringify,
  createInitialState,
  decide,
  reduce,
  replay,
  type CommandEnvelope,
  type Decision,
  type MeetingCommand,
  type MeetingEvent,
  type MeetingRole,
  type MeetingState,
  type RulesProfile,
} from '../src/index.js'

const profile: RulesProfile = {
  id: 'property-rules',
  version: 1,
  quorum: { type: 'fixed', minimum: 1 },
  debate: { defaultDurationSeconds: 600 },
  voteMethods: ['counted'],
  motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' },
  tiePolicy: 'motionFails',
  overrides: { quorumIndependentActions: [] },
}
const options = { numRuns: 75, seed: 20260710 }

interface Context {
  state: MeetingState
  commands: CommandEnvelope[]
  events: MeetingEvent[]
  decisions: Decision[]
  nextId: number
}

describe('meeting-domain invariants', () => {
  it('replays generated ordered command journals to byte-equivalent state', () => {
    fc.assert(fc.property(
      fc.array(fc.record({ participant: fc.constantFrom('delegate-1', 'delegate-2', 'delegate-3'), checkIn: fc.boolean() }), { minLength: 1, maxLength: 30 }),
      (operations) => {
        const context = emptyContext()
        issue(context, 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'property-meeting' })
        for (const operation of operations) {
          issue(context, 'secretary', 'secretary', operation.checkIn
            ? { type: 'CheckInParticipant', participantId: operation.participant, participantRole: 'delegate' }
            : { type: 'CheckOutParticipant', participantId: operation.participant })
        }

        const first = replay(profile, context.commands)
        const second = replay(profile, context.commands)
        expect(canonicalStringify(first.state)).toBe(canonicalStringify(second.state))
        expect(canonicalStringify(first)).toBe(canonicalStringify(second))
      },
    ), options)
  })

  it('keeps all accepted aggregate versions strictly consecutive', () => {
    fc.assert(fc.property(fc.array(fc.constantFrom('delegate-1', 'delegate-2', 'delegate-3'), { minLength: 1, maxLength: 30 }), (participants) => {
      const context = emptyContext()
      issue(context, 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'versions' })
      for (const participantId of participants) {
        issue(context, 'secretary', 'secretary', { type: 'CheckInParticipant', participantId, participantRole: 'delegate' })
      }
      expect(context.events.map((event) => event.aggregateVersion)).toEqual(
        Array.from({ length: context.events.length }, (_, index) => index + 1),
      )
    }), options)
  })

  it('keeps generated amendment parents acyclic and traceable to the main motion', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 12 }), (depth) => {
      const context = openQuestion(['delegate-1', 'delegate-2'])
      let parentId = 'main-1'
      for (let index = 1; index <= depth; index += 1) {
        const motionId = `amend-${index}`
        expect(issue(context, 'delegate-1', 'delegate', {
          type: 'AmendMotion', motionId, parentId, text: `Generated amendment ${index}`,
        }).accepted).toBe(true)
        expect(issue(context, 'delegate-2', 'delegate', { type: 'SecondMotion', motionId }).accepted).toBe(true)
        parentId = motionId
      }

      for (const motion of Object.values(context.state.motions)) {
        const visited = new Set<string>()
        let current = motion
        while (current.parentId !== undefined) {
          expect(visited.has(current.id)).toBe(false)
          visited.add(current.id)
          const parent = context.state.motions[current.parentId]
          expect(parent).toBeDefined()
          current = parent!
        }
        expect(current.id).toBe('main-1')
      }
    }), options)
  })

  it('never duplicates a generated member within a recognition queue', () => {
    const operation = fc.record({
      participant: fc.constantFrom('delegate-1', 'delegate-2', 'delegate-3'),
      side: fc.constantFrom('pro' as const, 'con' as const),
      join: fc.boolean(),
    })
    fc.assert(fc.property(fc.array(operation, { minLength: 1, maxLength: 50 }), (operations) => {
      const context = openQuestion(['delegate-1', 'delegate-2', 'delegate-3'])
      for (const selected of operations) {
        issue(context, selected.participant, 'delegate', selected.join
          ? { type: 'JoinRecognitionQueue', side: selected.side }
          : { type: 'WithdrawRecognitionQueue', side: selected.side })
        for (const queue of Object.values(context.state.recognitionQueues)) {
          expect(new Set(queue).size).toBe(queue.length)
        }
      }
    }), options)
  })

  it('returns the exact accepted decision for generated duplicate command IDs without new events', () => {
    fc.assert(fc.property(fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/), (participantId) => {
      const context = emptyContext()
      issue(context, 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'duplicates' })
      const envelope = envelopeFor(context, 'duplicate-command', 'secretary', 'secretary', {
        type: 'CheckInParticipant', participantId, participantRole: 'delegate',
      })
      const original = decide(profile, context.state, envelope)
      expect(original.accepted).toBe(true)
      if (!original.accepted) return
      for (const event of original.events) {
        context.state = reduce(context.state, event)
        context.events.push(event)
      }
      const before = canonicalStringify(context.state)
      const eventCount = context.events.length

      expect(decide(profile, context.state, envelope)).toEqual(original)
      expect(canonicalStringify(context.state)).toBe(before)
      expect(context.events).toHaveLength(eventCount)
    }), options)
  })

  it('accepts at most one ballot per participant and question despite fresh command and vote IDs', () => {
    fc.assert(fc.property(
      fc.stringMatching(/^delegate-[a-z][a-z0-9]{0,8}$/),
      fc.constantFrom('yes' as const, 'no' as const, 'abstain' as const),
      fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/),
      (participantId, firstChoice, voteIdBase) => {
        const firstVoteId = `vote-${voteIdBase}-1`
        const secondVoteId = `vote-${voteIdBase}-2`
        const seconderId = `${participantId}-seconder`
        const context = openQuestion([participantId, seconderId])
        expect(issue(context, 'chair-1', 'chair', {
          type: 'OpenVote', voteId: firstVoteId, motionId: 'main-1', method: 'counted',
        }).accepted).toBe(true)
        expect(issue(context, participantId, 'delegate', {
          type: 'CastVote', voteId: firstVoteId, choice: firstChoice,
        }).accepted).toBe(true)
        expect(issue(context, 'chair-1', 'chair', { type: 'CloseVote', voteId: firstVoteId }).accepted).toBe(true)
        expect(issue(context, 'teller-1', 'teller', { type: 'RecordVoteOutcome', voteId: firstVoteId }).accepted).toBe(true)

        const secondVote = issue(context, 'chair-1', 'chair', {
          type: 'OpenVote', voteId: secondVoteId, motionId: 'main-1', method: 'counted',
        })

        expect(secondVote).toMatchObject({ accepted: false, code: 'INVALID_COMMAND' })

        const recordedVote = context.state.votes[firstVoteId]!
        const defensiveState: MeetingState = {
          ...context.state,
          votes: {
            ...context.state.votes,
            [secondVoteId]: {
              id: secondVoteId,
              motionId: recordedVote.motionId,
              method: recordedVote.method,
              visibility: recordedVote.visibility,
              rule: recordedVote.rule,
              status: 'open',
              openedAt: recordedVote.openedAt,
              ballots: {},
            },
          },
        }
        const before = canonicalStringify(defensiveState)
        const defensiveDecision = decide(profile, defensiveState, {
          id: `defensive-cast-${voteIdBase}`,
          expectedVersion: defensiveState.version,
          actorId: participantId,
          role: 'delegate',
          occurredAt: '2026-07-10T15:00:00.000Z',
          command: { type: 'CastVote', voteId: secondVoteId, choice: firstChoice },
        })

        expect(defensiveDecision).toMatchObject({ accepted: false, code: 'ALREADY_VOTED' })
        expect(Object.values(defensiveState.votes).filter((vote) => vote.motionId === 'main-1'
          && vote.ballots[participantId] !== undefined)).toHaveLength(1)
        expect(context.events.filter((event) => event.type === 'VoteCast'
          && event.payload.voterId === participantId
          && defensiveState.votes[event.payload.voteId]?.motionId === 'main-1')).toHaveLength(1)
        expect(canonicalStringify(defensiveState)).toBe(before)
      },
    ), options)
  })
})

function emptyContext(): Context {
  return { state: createInitialState(profile), commands: [], events: [], decisions: [], nextId: 0 }
}

function openQuestion(participants: readonly string[]): Context {
  const context = emptyContext()
  issue(context, 'admin', 'administrator', { type: 'InitializeMeeting', meetingId: 'property-question' })
  for (const participantId of participants) {
    issue(context, 'secretary', 'secretary', { type: 'CheckInParticipant', participantId, participantRole: 'delegate' })
  }
  issue(context, 'chair-1', 'chair', { type: 'OpenMeeting' })
  issue(context, participants[0]!, 'delegate', { type: 'IntroduceMotion', motionId: 'main-1', text: 'Generated motion' })
  issue(context, participants[1]!, 'delegate', { type: 'SecondMotion', motionId: 'main-1' })
  return context
}

function issue(context: Context, actorId: string, role: MeetingRole, command: MeetingCommand): Decision {
  const envelope = envelopeFor(context, `generated-${context.nextId}`, actorId, role, command)
  context.nextId += 1
  context.commands.push(envelope)
  const decision = decide(profile, context.state, envelope)
  context.decisions.push(decision)
  if (decision.accepted) {
    for (const event of decision.events) {
      context.state = reduce(context.state, event)
      context.events.push(event)
    }
  }
  return decision
}

function envelopeFor(
  context: Context,
  id: string,
  actorId: string,
  role: MeetingRole,
  command: MeetingCommand,
): CommandEnvelope {
  return {
    id,
    expectedVersion: context.state.version,
    actorId,
    role,
    occurredAt: '2026-07-10T15:00:00.000Z',
    command,
  }
}
