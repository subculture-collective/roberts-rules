import type {
  AcceptedDecision,
  AttendanceRecord,
  CommandEnvelope,
  Decision,
  MeetingEvent,
  MeetingEventOf,
  MeetingEventPayloadMap,
  MeetingEventType,
  MeetingState,
  RulesProfile,
} from './types.js'

export function decide(profile: RulesProfile, state: MeetingState, envelope: CommandEnvelope): Decision {
  const prior = state.processedCommands[envelope.id]
  if (prior !== undefined) return prior

  if (envelope.expectedVersion !== state.version) {
    return reject('STALE_VERSION', `Expected aggregate version ${envelope.expectedVersion}, received ${state.version}`)
  }

  switch (envelope.command.type) {
    case 'InitializeMeeting':
      if (!hasRole(envelope, ['administrator', 'chair'])) {
        return reject('ROLE_FORBIDDEN', 'Only an administrator or chair may initialize a meeting')
      }
      if (state.phase !== 'uninitialized') {
        return reject('INVALID_PHASE', 'A meeting may only be initialized once')
      }
      if (envelope.command.meetingId.trim() === '') {
        return reject('INVALID_COMMAND', 'Meeting ID must not be empty')
      }
      return accept([
        event(envelope, state.version + 1, 0, 'MeetingInitialized', {
          meetingId: envelope.command.meetingId,
          rulesProfileId: profile.id,
          rulesProfileVersion: profile.version,
        }),
      ])
    case 'OpenMeeting':
      return chairPhaseTransition(state, envelope, 'initialized', 'MeetingOpened')
    case 'RecessMeeting':
      return chairPhaseTransition(state, envelope, 'open', 'MeetingRecessed')
    case 'ResumeMeeting':
      return chairPhaseTransition(state, envelope, 'recessed', 'MeetingResumed')
    case 'AdjournMeeting':
      if (!hasRole(envelope, ['chair'])) return reject('ROLE_FORBIDDEN', 'Only the chair may adjourn the meeting')
      if (state.phase !== 'open' && state.phase !== 'recessed') {
        return reject('INVALID_PHASE', 'A meeting may only be adjourned while open or recessed')
      }
      return accept([event(envelope, state.version + 1, 0, 'MeetingAdjourned', {})])
    case 'CheckInParticipant': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      if (state.attendance[envelope.command.participantId]?.checkedIn === true) {
        return reject('INVALID_COMMAND', 'Participant is already checked in')
      }
      if (envelope.command.participantRole === 'alternate' && envelope.command.alternateFor === undefined) {
        return reject('INVALID_COMMAND', 'An alternate must identify the delegate they may replace')
      }
      const record: AttendanceRecord = {
        participantId: envelope.command.participantId,
        role: envelope.command.participantRole,
        checkedIn: true,
        active: envelope.command.participantRole === 'delegate',
        ...(envelope.command.alternateFor === undefined ? {} : { alternateFor: envelope.command.alternateFor }),
      }
      const deactivatedAlternates = envelope.command.participantRole === 'delegate'
        ? activeAlternatesFor(state, envelope.command.participantId)
        : []
      return attendanceDecision(state, envelope, 'ParticipantCheckedIn', {
        record,
        deactivatedAlternateIds: deactivatedAlternates.map((alternate) => alternate.participantId),
      }, {
        ...state.attendance,
        ...Object.fromEntries(deactivatedAlternates.map((alternate) => [
          alternate.participantId,
          { ...alternate, active: false },
        ])),
        [record.participantId]: record,
      })
    }
    case 'CheckOutParticipant': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      const current = state.attendance[envelope.command.participantId]
      if (current?.checkedIn !== true) return reject('INVALID_COMMAND', 'Participant is not checked in')
      const record = { ...current, checkedIn: false, active: false }
      return attendanceDecision(state, envelope, 'ParticipantCheckedOut', { participantId: record.participantId }, {
        ...state.attendance,
        [record.participantId]: record,
      })
    }
    case 'ActivateAlternate': {
      const invalid = validateAttendanceCommand(state, envelope)
      if (invalid !== undefined) return invalid
      const alternate = state.attendance[envelope.command.alternateId]
      const delegate = state.attendance[envelope.command.delegateId]
      if (alternate?.checkedIn !== true || alternate.role !== 'alternate' || alternate.alternateFor !== envelope.command.delegateId) {
        return reject('INVALID_COMMAND', 'Alternate is not checked in for the named delegate')
      }
      if (delegate?.checkedIn === true && delegate.active) {
        return reject('INVALID_COMMAND', 'Cannot activate an alternate while the delegate is active')
      }
      const attendance = {
        ...state.attendance,
        ...Object.fromEntries(activeAlternatesFor(state, envelope.command.delegateId)
          .filter((record) => record.participantId !== alternate.participantId)
          .map((record) => [record.participantId, { ...record, active: false }])),
        [alternate.participantId]: { ...alternate, active: true },
        ...(delegate === undefined ? {} : { [delegate.participantId]: { ...delegate, active: false } }),
      }
      const deactivatedAlternateIds = activeAlternatesFor(state, envelope.command.delegateId)
        .filter((record) => record.participantId !== alternate.participantId)
        .map((record) => record.participantId)
      return attendanceDecision(state, envelope, 'AlternateActivated', {
        alternateId: alternate.participantId,
        delegateId: envelope.command.delegateId,
        deactivatedAlternateIds,
      }, attendance)
    }
    default:
      return reject('INVALID_COMMAND', 'Command is not implemented')
  }
}

function validateAttendanceCommand(state: MeetingState, envelope: CommandEnvelope): Decision | undefined {
  if (!hasRole(envelope, ['chair', 'secretary', 'technicalOperator'])) {
    return reject('ROLE_FORBIDDEN', 'Only the chair, secretary, or technical operator may manage attendance')
  }
  if (state.phase === 'uninitialized' || state.phase === 'adjourned') {
    return reject('INVALID_PHASE', 'Attendance may only change during an initialized meeting')
  }
  return undefined
}

function attendanceDecision<T extends 'ParticipantCheckedIn' | 'ParticipantCheckedOut' | 'AlternateActivated'>(
  state: MeetingState,
  envelope: CommandEnvelope,
  type: T,
  payload: MeetingEventPayloadMap[T],
  attendance: MeetingState['attendance'],
): Decision {
  const events: MeetingEvent[] = [event(envelope, state.version + 1, 0, type, payload)]
  const present = countPresent(attendance)
  const met = present >= state.quorum.required
  if (met !== state.quorum.met) {
    events.push(event(envelope, state.version + 2, 1, 'QuorumChanged', {
      present,
      required: state.quorum.required,
      met,
    }))
  }
  return accept(events)
}

function activeAlternatesFor(state: MeetingState, delegateId: string): AttendanceRecord[] {
  return Object.values(state.attendance).filter((record) =>
    record.role === 'alternate' && record.alternateFor === delegateId && record.active)
}

function countPresent(attendance: MeetingState['attendance']): number {
  return Object.values(attendance).filter((record) =>
    record.checkedIn && record.active && (record.role === 'delegate' || record.role === 'alternate')).length
}

function chairPhaseTransition(
  state: MeetingState,
  envelope: CommandEnvelope,
  requiredPhase: MeetingState['phase'],
  type: 'MeetingOpened' | 'MeetingRecessed' | 'MeetingResumed',
): Decision {
  if (!hasRole(envelope, ['chair'])) return reject('ROLE_FORBIDDEN', 'Only the chair may change the meeting phase')
  if (state.phase !== requiredPhase) return reject('INVALID_PHASE', `Meeting must be ${requiredPhase}`)
  return accept([event(envelope, state.version + 1, 0, type, {})])
}

function hasRole(envelope: CommandEnvelope, roles: readonly CommandEnvelope['role'][]): boolean {
  return roles.includes(envelope.role)
}

export function event<T extends MeetingEventType>(
  envelope: CommandEnvelope,
  aggregateVersion: number,
  eventIndex: number,
  type: T,
  payload: MeetingEventPayloadMap[T],
): MeetingEventOf<T> {
  return {
    id: `${envelope.id}:${eventIndex}`,
    type,
    aggregateVersion,
    occurredAt: envelope.occurredAt,
    causationId: envelope.id,
    payload: { ...payload },
  } as MeetingEventOf<T>
}

function accept(events: readonly MeetingEvent[]): AcceptedDecision {
  return { accepted: true, events }
}

function reject(code: Exclude<Decision, AcceptedDecision>['code'], explanation: string): Decision {
  return { accepted: false, code, explanation }
}
