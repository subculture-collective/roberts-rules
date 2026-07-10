import { describe, expect, it } from 'vitest'
import { validateMeetingCommand } from '../src/validation.js'

describe('validateMeetingCommand', () => {
  it('accepts a complete known command', () => expect(validateMeetingCommand({ type: 'IntroduceMotion', motionId: 'm1', text: 'Adopt budget' })).toEqual({ type: 'IntroduceMotion', motionId: 'm1', text: 'Adopt budget' }))
  it('rejects unknown variants', () => expect(() => validateMeetingCommand({ type: 'InventProcedure' })).toThrow('command.type is invalid'))
  it('rejects unknown fields', () => expect(() => validateMeetingCommand({ type: 'OpenMeeting', actorId: 'forged' })).toThrow('command.actorId is not allowed'))
  it('rejects missing required fields', () => expect(() => validateMeetingCommand({ type: 'IntroduceMotion', motionId: 'm1' })).toThrow('command.text'))
});
