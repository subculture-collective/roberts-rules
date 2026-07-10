import type { Decision, MeetingEvent, RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, withTransaction } from './db.js';
import { PostgresMeetingStore } from './meeting-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const meetingId = '00000000-0000-4000-8000-000000000010';
const profile: RulesProfile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 2 }, debate: { defaultDurationSeconds: 300 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } };
const event: MeetingEvent = { id: 'event-1', type: 'MeetingInitialized', aggregateVersion: 1, occurredAt: '2026-07-10T20:00:00.000Z', causationId: 'command-1', payload: { meetingId, rulesProfileId: 'standard', rulesProfileVersion: 1 } };

integration('PostgresMeetingStore', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  beforeAll(async () => { await migrate(pool); await pool.query('TRUNCATE command_decisions, meeting_events, meetings CASCADE'); });
  afterAll(async () => pool.end());

  it('stores an ordered journal and durable command decision atomically', async () => {
    const decision: Decision = { accepted: true, events: [event] };
    await withTransaction(pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      await store.createMeeting(meetingId, profile);
      await store.lockMeeting(meetingId);
      await store.appendEvents(meetingId, 0, [event]);
      await store.storeDecision(meetingId, 'command-1', 'hash-1', decision);
    });

    await withTransaction(pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      expect((await store.lockMeeting(meetingId))?.aggregateVersion).toBe(1);
      expect(await store.loadEvents(meetingId)).toEqual([event]);
      expect(await store.loadEventsAfter(meetingId, 0)).toEqual([event]);
      expect(await store.loadEventsAfter(meetingId, 1)).toEqual([]);
      expect(await store.findDecision(meetingId, 'command-1')).toEqual({ requestHash: 'hash-1', decision });
    });
  });

  it('rolls back the journal when an append is not consecutive', async () => {
    await expect(withTransaction(pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      await store.lockMeeting(meetingId);
      await store.appendEvents(meetingId, 1, [{ ...event, id: 'event-3', aggregateVersion: 3 }]);
    })).rejects.toThrow('NON_CONSECUTIVE_EVENTS');
    expect((await pool.query('SELECT aggregate_version FROM meetings WHERE id = $1', [meetingId])).rows[0]?.aggregate_version).toBe('1');
  });
});
