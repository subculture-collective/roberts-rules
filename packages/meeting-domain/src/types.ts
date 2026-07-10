export type MeetingRole =
  | 'administrator'
  | 'chair'
  | 'parliamentarian'
  | 'secretary'
  | 'teller'
  | 'delegate'
  | 'alternate'
  | 'participant'
  | 'observer'
  | 'technicalOperator'

export type MeetingPhase = 'uninitialized' | 'initialized' | 'open' | 'recessed' | 'adjourned'

export interface RulesProfile {
  id: string
  version: number
  quorum: { type: 'fixed'; minimum: number }
  debate: { defaultDurationSeconds: number }
  voteMethods: readonly string[]
  tiePolicy: 'motionFails' | 'chairDecides'
  overrides: { quorumIndependentActions: readonly string[] }
}

export interface AttendanceRecord {
  participantId: string
  role: MeetingRole
  checkedIn: boolean
  active: boolean
  alternateFor?: string
}

export interface MeetingState {
  meetingId?: string
  rulesProfileId: string
  rulesProfileVersion: number
  phase: MeetingPhase
  version: number
  agenda: readonly unknown[]
  attendance: Readonly<Record<string, AttendanceRecord>>
  quorum: { present: number; required: number; met: boolean }
  motions: Readonly<Record<string, unknown>>
  recognitionQueues: Readonly<Record<string, readonly unknown[]>>
  debate: unknown | null
  pointsOfOrder: Readonly<Record<string, unknown>>
  votes: Readonly<Record<string, unknown>>
  outcomes: readonly unknown[]
  // Accepted decisions are journal-derived. Rejected attempts require durable
  // deduplication at the future command-store boundary because they emit no events.
  processedCommands: Readonly<Record<string, AcceptedDecision>>
}

export type MeetingCommand =
  | { type: 'InitializeMeeting'; meetingId: string }
  | { type: 'OpenMeeting' }
  | { type: 'RecessMeeting' }
  | { type: 'ResumeMeeting' }
  | { type: 'AdjournMeeting' }
  | { type: 'CheckInParticipant'; participantId: string; participantRole: MeetingRole; alternateFor?: string }
  | { type: 'CheckOutParticipant'; participantId: string }
  | { type: 'ActivateAlternate'; alternateId: string; delegateId: string }

export interface CommandEnvelope {
  id: string
  expectedVersion: number
  actorId: string
  role: MeetingRole
  occurredAt: string
  command: MeetingCommand
}

export type MeetingEventType =
  | 'MeetingInitialized'
  | 'MeetingOpened'
  | 'MeetingRecessed'
  | 'MeetingResumed'
  | 'MeetingAdjourned'
  | 'ParticipantCheckedIn'
  | 'ParticipantCheckedOut'
  | 'AlternateActivated'
  | 'QuorumChanged'

export interface MeetingEventPayloadMap {
  MeetingInitialized: { meetingId: string; rulesProfileId: string; rulesProfileVersion: number }
  MeetingOpened: Record<string, never>
  MeetingRecessed: Record<string, never>
  MeetingResumed: Record<string, never>
  MeetingAdjourned: Record<string, never>
  ParticipantCheckedIn: { record: AttendanceRecord; deactivatedAlternateIds: readonly string[] }
  ParticipantCheckedOut: { participantId: string }
  AlternateActivated: { alternateId: string; delegateId: string; deactivatedAlternateIds: readonly string[] }
  QuorumChanged: { present: number; required: number; met: boolean }
}

export type MeetingEventOf<T extends MeetingEventType> = T extends MeetingEventType ? {
  readonly id: string
  readonly type: T
  readonly aggregateVersion: number
  readonly occurredAt: string
  readonly causationId: string
  readonly payload: Readonly<MeetingEventPayloadMap[T]>
} : never

export type MeetingEvent = {
  [T in MeetingEventType]: MeetingEventOf<T>
}[MeetingEventType]

export interface AcceptedDecision {
  accepted: true
  events: readonly MeetingEvent[]
}

export type RejectionCode =
  | 'STALE_VERSION'
  | 'DUPLICATE_COMMAND'
  | 'ROLE_FORBIDDEN'
  | 'INVALID_PHASE'
  | 'QUORUM_REQUIRED'
  | 'NO_ACTIVE_QUESTION'
  | 'ACTIVE_QUESTION_EXISTS'
  | 'INVALID_PARENT'
  | 'ALREADY_QUEUED'
  | 'ALREADY_VOTED'
  | 'INVALID_COMMAND'

export interface RejectedDecision {
  accepted: false
  code: RejectionCode
  explanation: string
}

export type Decision = AcceptedDecision | RejectedDecision
