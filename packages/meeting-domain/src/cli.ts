#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'

import { canonicalStringify } from './canonical.js'
import { replay } from './replay.js'
import type { CommandEnvelope, MeetingCommand, MeetingRole, RulesProfile } from './types.js'

const FORMAT = 'roberts-rules-transcript-v1'
const roles = new Set<MeetingRole>([
  'administrator', 'chair', 'parliamentarian', 'secretary', 'teller', 'delegate',
  'alternate', 'participant', 'observer', 'technicalOperator',
])
const commandTypes = new Set<MeetingCommand['type']>([
  'InitializeMeeting', 'OpenMeeting', 'RecessMeeting', 'ResumeMeeting', 'AdjournMeeting',
  'CheckInParticipant', 'CheckOutParticipant', 'ActivateAlternate', 'AdoptAgenda', 'AdvanceAgenda',
  'JoinRecognitionQueue', 'WithdrawRecognitionQueue', 'ReorderRecognitionQueue', 'IntroduceMotion',
  'SecondMotion', 'AmendMotion', 'WithdrawMotion', 'TableMotion', 'DisposeMotion', 'OpenDebate',
  'CloseDebate', 'RaisePointOfOrder', 'RuleOnPointOfOrder', 'AppealRuling', 'RecordAppealOutcome',
  'OpenVote', 'CastVote', 'CloseVote', 'RecordVoteOutcome', 'ApplyChairCorrection',
])

interface TranscriptHeader { format: typeof FORMAT; profile: RulesProfile }

async function main(args: readonly string[]): Promise<void> {
  if (args.length !== 1) throw new Error('usage: replay <fixture>')
  const fixture = args[0]!
  const fixturePath = isAbsolute(fixture) ? fixture : resolve(process.env.INIT_CWD ?? process.cwd(), fixture)
  let source: string
  try {
    source = await readFile(fixturePath, 'utf8')
  } catch (error) {
    throw new Error(`${fixture}: ${errorMessage(error)}`)
  }
  const lines = source.split(/\r?\n/)
  if (lines[0]?.trim() === '') fail(fixture, 1, 'expected a versioned transcript header')
  const header = parseAt(fixture, 1, lines[0] ?? '')
  assertHeader(fixture, header)

  const commands: CommandEnvelope[] = []
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]!
    if (line.trim() === '') continue
    const value = parseAt(fixture, index + 1, line)
    try {
      commands.push(validateEnvelope(value))
    } catch (error) {
      fail(fixture, index + 1, errorMessage(error))
    }
  }

  let result
  try {
    result = replay(header.profile, commands)
  } catch (error) {
    throw new Error(`${fixture}:1: replay failed: ${errorMessage(error)}`)
  }
  process.stdout.write(`${canonicalStringify(result)}\n`)
}

function parseAt(fixture: string, line: number, source: string): unknown {
  try {
    return JSON.parse(source) as unknown
  } catch (error) {
    fail(fixture, line, `invalid JSON: ${errorMessage(error)}`)
  }
}

function assertHeader(fixture: string, value: unknown): asserts value is TranscriptHeader {
  try {
    const header = object(value, 'header')
    if (header.format !== FORMAT) throw new Error(`format must be ${FORMAT}`)
    validateProfile(header.profile)
  } catch (error) {
    fail(fixture, 1, errorMessage(error))
  }
}

function validateProfile(value: unknown): asserts value is RulesProfile {
  const profile = object(value, 'profile')
  string(profile.id, 'profile.id')
  positiveInteger(profile.version, 'profile.version')
  const quorum = object(profile.quorum, 'profile.quorum')
  if (quorum.type !== 'fixed') throw new Error('profile.quorum.type must be fixed')
  nonnegativeInteger(quorum.minimum, 'profile.quorum.minimum')
  const debate = object(profile.debate, 'profile.debate')
  nonnegativeNumber(debate.defaultDurationSeconds, 'profile.debate.defaultDurationSeconds')
  stringArray(profile.voteMethods, 'profile.voteMethods')
  const threshold = object(profile.motionThreshold, 'profile.motionThreshold')
  positiveInteger(threshold.numerator, 'profile.motionThreshold.numerator')
  positiveInteger(threshold.denominator, 'profile.motionThreshold.denominator')
  if (threshold.basis !== 'votesCast') throw new Error('profile.motionThreshold.basis must be votesCast')
  if (profile.tiePolicy !== 'motionFails' && profile.tiePolicy !== 'chairDecides') {
    throw new Error('profile.tiePolicy is invalid')
  }
  const overrides = object(profile.overrides, 'profile.overrides')
  stringArray(overrides.quorumIndependentActions, 'profile.overrides.quorumIndependentActions')
}

function validateEnvelope(value: unknown): CommandEnvelope {
  const envelope = object(value, 'command envelope')
  string(envelope.id, 'id')
  nonnegativeInteger(envelope.expectedVersion, 'expectedVersion')
  string(envelope.actorId, 'actorId')
  if (typeof envelope.role !== 'string' || !roles.has(envelope.role as MeetingRole)) throw new Error('role is invalid')
  string(envelope.occurredAt, 'occurredAt')
  const command = object(envelope.command, 'command')
  if (typeof command.type !== 'string' || !commandTypes.has(command.type as MeetingCommand['type'])) {
    throw new Error('command.type is invalid')
  }
  validateCommand(command)
  return value as CommandEnvelope
}

function validateCommand(command: Record<string, unknown>): void {
  const type = command.type as MeetingCommand['type']
  const requiredStrings: Partial<Record<MeetingCommand['type'], readonly string[]>> = {
    InitializeMeeting: ['meetingId'], CheckOutParticipant: ['participantId'],
    ActivateAlternate: ['alternateId', 'delegateId'], IntroduceMotion: ['motionId', 'text'],
    SecondMotion: ['motionId'], AmendMotion: ['motionId', 'text', 'parentId'],
    TableMotion: ['motionId', 'reason'], DisposeMotion: ['motionId', 'disposition'],
    OpenDebate: ['motionId', 'closesAt'], RaisePointOfOrder: ['pointId', 'text'],
    RuleOnPointOfOrder: ['pointId', 'ruling', 'reason'], AppealRuling: ['pointId', 'appealId'],
    RecordAppealOutcome: ['pointId', 'appealId', 'outcome', 'reason'],
    OpenVote: ['voteId', 'motionId', 'method'], CastVote: ['voteId', 'choice'],
    CloseVote: ['voteId'], RecordVoteOutcome: ['voteId'],
    ApplyChairCorrection: ['correctionId', 'affectedEventId', 'reason'],
    WithdrawMotion: ['motionId'], CloseDebate: ['motionId'],
  }
  for (const field of requiredStrings[type] ?? []) string(command[field], `command.${field}`)

  if (type === 'CheckInParticipant') {
    string(command.participantId, 'command.participantId')
    if (typeof command.participantRole !== 'string' || !roles.has(command.participantRole as MeetingRole)) {
      throw new Error('command.participantRole is invalid')
    }
    optionalString(command.alternateFor, 'command.alternateFor')
  } else if (type === 'AdoptAgenda') {
    if (!Array.isArray(command.items)) throw new Error('command.items must be an array')
    for (const [index, item] of command.items.entries()) {
      const record = object(item, `command.items[${index}]`)
      string(record.id, `command.items[${index}].id`)
      string(record.title, `command.items[${index}].title`)
    }
  } else if (type === 'JoinRecognitionQueue' || type === 'WithdrawRecognitionQueue') {
    side(command.side)
  } else if (type === 'ReorderRecognitionQueue') {
    side(command.side)
    stringArray(command.participantIds, 'command.participantIds')
  } else if (type === 'CastVote' && !['yes', 'no', 'abstain'].includes(command.choice as string)) {
    throw new Error('command.choice is invalid')
  } else if (type === 'RuleOnPointOfOrder' && !['upheld', 'denied'].includes(command.ruling as string)) {
    throw new Error('command.ruling is invalid')
  } else if (type === 'RecordAppealOutcome' && !['sustained', 'overturned'].includes(command.outcome as string)) {
    throw new Error('command.outcome is invalid')
  } else if (type === 'ApplyChairCorrection') {
    const patch = object(command.patch, 'command.patch')
    string(patch.type, 'command.patch.type')
    if (patch.type === 'motionText') {
      string(patch.motionId, 'command.patch.motionId'); string(patch.correctedText, 'command.patch.correctedText')
    } else if (patch.type === 'agendaTitle') {
      string(patch.itemId, 'command.patch.itemId'); string(patch.correctedTitle, 'command.patch.correctedTitle')
    } else if (patch.type === 'motionDisposition') {
      string(patch.motionId, 'command.patch.motionId'); string(patch.correctedDisposition, 'command.patch.correctedDisposition')
    } else throw new Error('command.patch.type is invalid')
  }
  optionalString(command.reason, 'command.reason')
  optionalString(command.grounds, 'command.grounds')
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
  return value as Record<string, unknown>
}
function string(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string') throw new Error(`${name} must be a string`)
}
function optionalString(value: unknown, name: string): void {
  if (value !== undefined && typeof value !== 'string') throw new Error(`${name} must be a string when present`)
}
function stringArray(value: unknown, name: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((item: unknown) => typeof item !== 'string')) throw new Error(`${name} must be a string array`)
}
function nonnegativeInteger(value: unknown, name: string): void {
  if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${name} must be a nonnegative integer`)
}
function positiveInteger(value: unknown, name: string): void {
  if (!Number.isInteger(value) || (value as number) <= 0) throw new Error(`${name} must be a positive integer`)
}
function nonnegativeNumber(value: unknown, name: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`${name} must be nonnegative`)
}
function side(value: unknown): void {
  if (value !== 'pro' && value !== 'con') throw new Error('command.side is invalid')
}
function fail(fixture: string, line: number, message: string): never {
  throw new Error(`${fixture}:${line}: ${message}`)
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

main(process.argv.slice(2)).catch((error: unknown) => {
  process.stderr.write(`${errorMessage(error)}\n`)
  process.exitCode = 1
})
