import type { MeetingCommand, MeetingRole } from './types.js'

const roles = new Set<MeetingRole>(['administrator','chair','parliamentarian','secretary','teller','delegate','alternate','participant','observer','technicalOperator'])
const fields: Record<MeetingCommand['type'], readonly string[]> = {
  InitializeMeeting:['meetingId'], OpenMeeting:[], RecessMeeting:[], ResumeMeeting:[], AdjournMeeting:[],
  CheckInParticipant:['participantId','participantRole','alternateFor'], CheckOutParticipant:['participantId'], ActivateAlternate:['alternateId','delegateId'],
  AdoptAgenda:['items'], AdvanceAgenda:[], JoinRecognitionQueue:['side'], WithdrawRecognitionQueue:['side'], ReorderRecognitionQueue:['side','participantIds'],
  IntroduceMotion:['motionId','text'], SecondMotion:['motionId'], AmendMotion:['motionId','text','parentId'], WithdrawMotion:['motionId','reason'],
  TableMotion:['motionId','reason'], DisposeMotion:['motionId','disposition'], OpenDebate:['motionId','closesAt'], CloseDebate:['motionId','reason'],
  RaisePointOfOrder:['pointId','text'], RuleOnPointOfOrder:['pointId','ruling','reason'], AppealRuling:['pointId','appealId','grounds'],
  RecordAppealOutcome:['pointId','appealId','outcome','reason'], OpenVote:['voteId','motionId','method','weights'], CastVote:['voteId','choice'],
  CloseVote:['voteId'], RecordVoteOutcome:['voteId'], ApplyChairCorrection:['correctionId','affectedEventId','reason','patch'],
}
const requiredStrings: Partial<Record<MeetingCommand['type'], readonly string[]>> = {
  InitializeMeeting:['meetingId'], CheckOutParticipant:['participantId'], ActivateAlternate:['alternateId','delegateId'], IntroduceMotion:['motionId','text'],
  SecondMotion:['motionId'], AmendMotion:['motionId','text','parentId'], WithdrawMotion:['motionId'], TableMotion:['motionId','reason'], DisposeMotion:['motionId','disposition'],
  OpenDebate:['motionId','closesAt'], CloseDebate:['motionId'], RaisePointOfOrder:['pointId','text'], RuleOnPointOfOrder:['pointId','ruling','reason'],
  AppealRuling:['pointId','appealId'], RecordAppealOutcome:['pointId','appealId','outcome','reason'], OpenVote:['voteId','motionId','method'],
  CastVote:['voteId','choice'], CloseVote:['voteId'], RecordVoteOutcome:['voteId'], ApplyChairCorrection:['correctionId','affectedEventId','reason'],
}

export function validateMeetingCommand(value: unknown): MeetingCommand {
  const command = object(value, 'command')
  if (typeof command.type !== 'string' || !(command.type in fields)) throw new Error('command.type is invalid')
  const type = command.type as MeetingCommand['type']
  const allowed = new Set(['type', ...fields[type]])
  for (const key of Object.keys(command)) if (!allowed.has(key)) throw new Error(`command.${key} is not allowed`)
  for (const key of requiredStrings[type] ?? []) string(command[key], `command.${key}`)
  optionalString(command.reason, 'command.reason'); optionalString(command.grounds, 'command.grounds')
  if (type === 'CheckInParticipant') {
    string(command.participantId, 'command.participantId')
    if (typeof command.participantRole !== 'string' || !roles.has(command.participantRole as MeetingRole)) throw new Error('command.participantRole is invalid')
    optionalString(command.alternateFor, 'command.alternateFor')
  } else if (type === 'AdoptAgenda') {
    if (!Array.isArray(command.items)) throw new Error('command.items must be an array')
    for (const item of command.items) { const entry = object(item, 'command item'); exact(entry, ['id','title'], 'command item'); string(entry.id, 'command item.id'); string(entry.title, 'command item.title') }
  } else if (type === 'JoinRecognitionQueue' || type === 'WithdrawRecognitionQueue') side(command.side)
  else if (type === 'ReorderRecognitionQueue') { side(command.side); stringArray(command.participantIds, 'command.participantIds') }
  else if (type === 'OpenVote') validateOpenVote(command)
  else if (type === 'CastVote' && !['yes','no','abstain'].includes(String(command.choice))) throw new Error('command.choice is invalid')
  else if (type === 'RuleOnPointOfOrder' && !['upheld','denied'].includes(String(command.ruling))) throw new Error('command.ruling is invalid')
  else if (type === 'RecordAppealOutcome' && !['sustained','overturned'].includes(String(command.outcome))) throw new Error('command.outcome is invalid')
  else if (type === 'ApplyChairCorrection') validatePatch(command.patch)
  return value as MeetingCommand
}

function validatePatch(value: unknown) {
  const patch = object(value, 'command.patch'); string(patch.type, 'command.patch.type')
  const variants: Record<string, readonly string[]> = { motionText:['motionId','correctedText'], agendaTitle:['itemId','correctedTitle'], motionDisposition:['motionId','correctedDisposition'] }
  const keys = variants[patch.type as string]; if (!keys) throw new Error('command.patch.type is invalid')
  exact(patch, ['type', ...keys], 'command.patch'); for (const key of keys) string(patch[key], `command.patch.${key}`)
}
function validateOpenVote(command: Record<string, unknown>) {
  if (!['counted','rollCall','weighted'].includes(String(command.method))) throw new Error('command.method is invalid')
  if (command.method !== 'weighted') {
    if (command.weights !== undefined) throw new Error('command.weights is not allowed')
    return
  }
  const weights = object(command.weights, 'command.weights')
  for (const [participantId, weight] of Object.entries(weights)) {
    if (!participantId || !Number.isSafeInteger(weight) || Number(weight) <= 0) throw new Error('command.weights is invalid')
  }
}
function object(value: unknown, name: string): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`); return value as Record<string, unknown> }
function exact(value: Record<string, unknown>, keys: readonly string[], name: string) { const allowed = new Set(keys); for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${name}.${key} is not allowed`) }
function string(value: unknown, name: string): asserts value is string { if (typeof value !== 'string') throw new Error(`${name} must be a string`) }
function optionalString(value: unknown, name: string) { if (value !== undefined && typeof value !== 'string') throw new Error(`${name} must be a string when present`) }
function stringArray(value: unknown, name: string): asserts value is string[] { if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) throw new Error(`${name} must be a string array`) }
function side(value: unknown) { if (value !== 'pro' && value !== 'con') throw new Error('command.side is invalid') }
