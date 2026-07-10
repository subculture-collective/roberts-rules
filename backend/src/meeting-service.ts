import { createHash } from 'node:crypto';
import { canonicalStringify, createInitialState, decide, reduce, type Decision, type MeetingCommand, type MeetingRole, type MeetingState, type RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import type { Pool } from 'pg';
import { withTransaction } from './db.js';
import { PostgresMeetingStore } from './meeting-store.js';

export interface MeetingPrincipal { actorId: string; role: MeetingRole }
export interface SubmitCommandInput { meetingId: string; commandId: string; expectedVersion: number; occurredAt: string; command: MeetingCommand }

export class MeetingServiceError extends Error {
  constructor(readonly code: 'MEETING_NOT_FOUND' | 'COMMAND_ID_CONFLICT') { super(code); }
}

export class MeetingService {
  constructor(private readonly pool: Pool) {}

  async createMeeting(id: string, profile: RulesProfile): Promise<void> {
    await withTransaction(this.pool, (client) => new PostgresMeetingStore(client).createMeeting(id, profile));
  }

  async submitCommand(principal: MeetingPrincipal, input: SubmitCommandInput): Promise<Decision> {
    return withTransaction(this.pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      const meeting = await store.lockMeeting(input.meetingId);
      if (!meeting) throw new MeetingServiceError('MEETING_NOT_FOUND');
      const hash = createHash('sha256').update(canonicalStringify({ principal, input })).digest('hex');
      const stored = await store.findDecision(input.meetingId, input.commandId);
      if (stored) {
        if (stored.requestHash !== hash) throw new MeetingServiceError('COMMAND_ID_CONFLICT');
        return stored.decision;
      }
      const events = await store.loadEvents(input.meetingId);
      let state = createInitialState(meeting.profile);
      for (const event of events) state = reduce(state, event);
      const decision = decide(meeting.profile, state, { id: input.commandId, expectedVersion: input.expectedVersion,
        actorId: principal.actorId, role: principal.role, occurredAt: input.occurredAt, command: input.command });
      if (decision.accepted) await store.appendEvents(input.meetingId, meeting.aggregateVersion, decision.events);
      await store.storeDecision(input.meetingId, input.commandId, hash, decision);
      return decision;
    });
  }

  async snapshot(id: string): Promise<MeetingState> {
    return withTransaction(this.pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      const meeting = await store.lockMeeting(id);
      if (!meeting) throw new MeetingServiceError('MEETING_NOT_FOUND');
      let state = createInitialState(meeting.profile);
      for (const event of await store.loadEvents(id)) state = reduce(state, event);
      return state;
    });
  }
}
