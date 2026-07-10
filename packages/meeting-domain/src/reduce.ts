import type { MeetingEvent, MeetingState, RulesProfile } from './types.js'

export function createInitialState(profile: RulesProfile): MeetingState {
  return {
    rulesProfileId: profile.id,
    rulesProfileVersion: profile.version,
    phase: 'uninitialized',
    version: 0,
    agenda: [],
    attendance: {},
    quorum: { present: 0, required: profile.quorum.minimum, met: profile.quorum.minimum === 0 },
    motions: {},
    motionStack: [],
    recognitionQueues: { pro: [], con: [] },
    debate: null,
    pointsOfOrder: {},
    votes: {},
    outcomes: [],
    processedCommands: {},
  }
}

export function reduce(state: MeetingState, event: MeetingEvent): MeetingState {
  const expectedVersion = state.version + 1
  if (event.aggregateVersion !== expectedVersion) {
    throw new Error(`Invalid aggregate version: expected ${expectedVersion}, received ${event.aggregateVersion}`)
  }
  const next = applyEvent(state, event)
  const priorEvents = state.processedCommands[event.causationId]?.events ?? []
  return {
    ...next,
    version: event.aggregateVersion,
    processedCommands: {
      ...state.processedCommands,
      [event.causationId]: { accepted: true, events: [...priorEvents, event] },
    },
  }
}

function applyEvent(state: MeetingState, event: MeetingEvent): MeetingState {
  switch (event.type) {
    case 'MeetingInitialized':
      validateInitializedPayload(event.payload)
      return {
        ...state,
        meetingId: event.payload.meetingId,
        phase: 'initialized',
      }
    case 'MeetingOpened':
    case 'MeetingResumed':
      return { ...state, phase: 'open' }
    case 'MeetingRecessed':
      return { ...state, phase: 'recessed' }
    case 'MeetingAdjourned':
      return { ...state, phase: 'adjourned' }
    case 'ParticipantCheckedIn': {
      const record = event.payload.record
      if (!isAttendanceRecord(record)) throw new Error('Invalid attendance event payload')
      validateStringArray(event.payload.deactivatedAlternateIds)
      return withAttendance(state, {
        ...deactivateParticipants(state.attendance, event.payload.deactivatedAlternateIds),
        [record.participantId]: { ...record },
      })
    }
    case 'ParticipantCheckedOut': {
      const participantId = asString(event.payload.participantId)
      const current = state.attendance[participantId]
      if (current === undefined) throw new Error('Cannot check out an unknown participant')
      return withAttendance(state, {
        ...state.attendance,
        [participantId]: { ...current, checkedIn: false, active: false },
      })
    }
    case 'AlternateActivated': {
      const { alternateId, delegateId, deactivatedAlternateIds } = event.payload
      if (typeof alternateId !== 'string' || typeof delegateId !== 'string') throw new Error('Invalid event payload')
      validateStringArray(deactivatedAlternateIds)
      const alternate = state.attendance[alternateId]
      if (alternate === undefined) throw new Error('Cannot activate an unknown alternate')
      const delegate = state.attendance[delegateId]
      return withAttendance(state, {
        ...deactivateParticipants(state.attendance, deactivatedAlternateIds),
        [alternateId]: { ...alternate, active: true },
        ...(delegate === undefined ? {} : { [delegateId]: { ...delegate, active: false } }),
      })
    }
    case 'QuorumChanged':
      validateQuorumPayload(event.payload)
      return {
        ...state,
        quorum: {
          present: event.payload.present,
          required: event.payload.required,
          met: event.payload.met,
        },
      }
    case 'AgendaAdopted':
      return { ...state, agenda: event.payload.items.map((item) => ({ ...item })) }
    case 'AgendaAdvanced':
      return {
        ...state,
        agenda: state.agenda.map((item) => {
          if (item.id === event.payload.completedItemId) return { ...item, status: 'completed' }
          if (item.id === event.payload.currentItemId) return { ...item, status: 'current' }
          return item
        }),
      }
    case 'RecognitionQueueJoined':
      return {
        ...state,
        recognitionQueues: {
          ...state.recognitionQueues,
          [event.payload.side]: [...state.recognitionQueues[event.payload.side], event.payload.participantId],
        },
      }
    case 'RecognitionQueueWithdrawn':
      return {
        ...state,
        recognitionQueues: {
          ...state.recognitionQueues,
          [event.payload.side]: state.recognitionQueues[event.payload.side]
            .filter((id) => id !== event.payload.participantId),
        },
      }
    case 'RecognitionQueueReordered':
      return {
        ...state,
        recognitionQueues: {
          ...state.recognitionQueues,
          [event.payload.side]: [...event.payload.participantIds],
        },
      }
    case 'MotionIntroduced':
    case 'MotionAmended':
      return {
        ...state,
        motions: { ...state.motions, [event.payload.motion.id]: { ...event.payload.motion } },
        motionStack: [...state.motionStack, event.payload.motion.id],
        recognitionQueues: emptyRecognitionQueues(),
        debate: null,
        pointsOfOrder: finalizeRuledPoints(state.pointsOfOrder, state.motionStack.at(-1)),
      }
    case 'MotionSeconded':
      return {
        ...state,
        motions: {
          ...state.motions,
          [event.payload.motionId]: {
            ...state.motions[event.payload.motionId]!,
            status: 'active',
            seconderId: event.payload.seconderId,
          },
        },
      }
    case 'MotionWithdrawn':
      return completeMotion(state, event.payload.motionId, 'withdrawn', event.payload.reason)
    case 'MotionTabled':
      return completeMotion(state, event.payload.motionId, 'tabled', event.payload.reason)
    case 'MotionDisposed':
      return completeMotion(state, event.payload.motionId, 'disposed', undefined, event.payload.disposition)
    case 'DebateOpened':
      return { ...state, debate: { ...event.payload.debate } }
    case 'DebateClosed':
      return {
        ...state,
        debate: state.debate === null ? null : {
          ...state.debate,
          status: 'closed',
          closedAt: event.payload.closedAt,
          ...(event.payload.reason === undefined ? {} : { reason: event.payload.reason }),
        },
      }
    case 'PointOfOrderRaised':
      return {
        ...state,
        pointsOfOrder: {
          ...state.pointsOfOrder,
          [event.payload.point.id]: { ...event.payload.point },
        },
      }
    case 'PointOfOrderRuled': {
      const point = state.pointsOfOrder[event.payload.pointId]!
      return {
        ...state,
        pointsOfOrder: {
          ...state.pointsOfOrder,
          [point.id]: {
            ...point,
            status: 'ruled',
            ruling: event.payload.ruling,
            rulingReason: event.payload.reason,
            ruledAt: event.payload.ruledAt,
            rulerId: event.payload.rulerId,
          },
        },
      }
    }
    case 'RulingAppealed': {
      const point = state.pointsOfOrder[event.payload.pointId]!
      return {
        ...state,
        pointsOfOrder: {
          ...state.pointsOfOrder,
          [point.id]: { ...point, appeal: { ...event.payload.appeal } },
        },
      }
    }
    case 'AppealOutcomeRecorded': {
      const point = state.pointsOfOrder[event.payload.pointId]!
      return {
        ...state,
        pointsOfOrder: {
          ...state.pointsOfOrder,
          [point.id]: {
            ...point,
            status: 'final',
            appeal: {
              ...point.appeal!,
              status: 'decided',
              outcome: event.payload.outcome,
              reason: event.payload.reason,
              decidedAt: event.payload.decidedAt,
              deciderId: event.payload.deciderId,
            },
          },
        },
      }
    }
    default:
      return assertNever(event)
  }
}

function completeMotion(state: MeetingState, motionId: string, status: 'withdrawn' | 'tabled' | 'disposed', reason?: string, disposition?: string): MeetingState {
  return {
    ...state,
    motions: {
      ...state.motions,
      [motionId]: {
        ...state.motions[motionId]!,
        status,
        ...(reason === undefined ? {} : { completionReason: reason }),
        ...(disposition === undefined ? {} : { disposition }),
      },
    },
    motionStack: state.motionStack.filter((id) => id !== motionId),
    recognitionQueues: emptyRecognitionQueues(),
    debate: null,
    pointsOfOrder: finalizeRuledPoints(state.pointsOfOrder, motionId),
  }
}

function finalizeRuledPoints(
  points: MeetingState['pointsOfOrder'],
  outgoingMotionId: string | undefined,
): MeetingState['pointsOfOrder'] {
  if (outgoingMotionId === undefined) return points
  return Object.fromEntries(Object.entries(points).map(([id, point]) => [
    id,
    point.motionId === outgoingMotionId && point.status === 'ruled' && point.appeal === undefined
      ? { ...point, status: 'final' as const }
      : point,
  ]))
}

function emptyRecognitionQueues(): MeetingState['recognitionQueues'] {
  return { pro: [], con: [] }
}

function deactivateParticipants(
  attendance: MeetingState['attendance'],
  participantIds: readonly string[],
): MeetingState['attendance'] {
  const next = { ...attendance }
  for (const participantId of participantIds) {
    const record = next[participantId]
    if (record === undefined) throw new Error(`Cannot deactivate unknown participant ${participantId}`)
    next[participantId] = { ...record, active: false }
  }
  return next
}

function withAttendance(state: MeetingState, attendance: MeetingState['attendance']): MeetingState {
  const present = Object.values(attendance).filter((record) =>
    record.checkedIn && record.active && (record.role === 'delegate' || record.role === 'alternate')).length
  return {
    ...state,
    attendance,
    quorum: { ...state.quorum, present, met: present >= state.quorum.required },
  }
}

function isAttendanceRecord(value: unknown): value is MeetingState['attendance'][string] {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.participantId === 'string' && typeof record.role === 'string'
    && typeof record.checkedIn === 'boolean' && typeof record.active === 'boolean'
}

function validateInitializedPayload(value: MeetingEvent['payload']): void {
  const payload = value as Record<string, unknown>
  if (typeof payload.meetingId !== 'string' || typeof payload.rulesProfileId !== 'string'
    || typeof payload.rulesProfileVersion !== 'number') throw new Error('Invalid event payload')
}

function validateStringArray(value: readonly string[]): void {
  if (!Array.isArray(value) || value.some((item: unknown) => typeof item !== 'string')) {
    throw new Error('Invalid event payload')
  }
}

function validateQuorumPayload(value: { present: number; required: number; met: boolean }): void {
  if (typeof value.present !== 'number' || typeof value.required !== 'number' || typeof value.met !== 'boolean') {
    throw new Error('Invalid event payload')
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown meeting event: ${String((value as { type?: unknown }).type)}`)
}

function asString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid event payload')
  return value
}
