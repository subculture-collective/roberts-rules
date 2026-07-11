import { describe, expect, it } from 'vitest'
import { validateMeetingCommand } from '../src/validation.js'

describe('validateMeetingCommand', () => {
  it('accepts a complete known command', () => expect(validateMeetingCommand({ type: 'IntroduceMotion', motionId: 'm1', text: 'Adopt budget' })).toEqual({ type: 'IntroduceMotion', motionId: 'm1', text: 'Adopt budget' }))
  it('rejects unknown variants', () => expect(() => validateMeetingCommand({ type: 'InventProcedure' })).toThrow('command.type is invalid'))
  it('rejects unknown fields', () => expect(() => validateMeetingCommand({ type: 'OpenMeeting', actorId: 'forged' })).toThrow('command.actorId is not allowed'))
  it('rejects missing required fields', () => expect(() => validateMeetingCommand({ type: 'IntroduceMotion', motionId: 'm1' })).toThrow('command.text'))
  it('validates weighted vote configuration at the command boundary', () => {
    const command = { type: 'OpenVote', voteId: 'v1', motionId: 'm1', method: 'weighted', weights: { d1: 3, d2: 1 } }
    expect(validateMeetingCommand(command)).toEqual(command)
    expect(() => validateMeetingCommand({ ...command, weights: { d1: 0 } })).toThrow('command.weights is invalid')
    expect(() => validateMeetingCommand({ ...command, method: 'counted' })).toThrow('command.weights is not allowed')
  })
});
