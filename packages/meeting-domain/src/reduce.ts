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
    recognitionQueues: {},
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
    default:
      return assertNever(event)
  }
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
