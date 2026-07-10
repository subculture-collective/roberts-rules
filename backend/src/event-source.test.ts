import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, withTransaction } from './db.js';
import { PostgresMeetingEventSource } from './event-source.js';
import { PostgresMeetingStore } from './meeting-store.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration('PostgresMeetingEventSource', () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const source = new PostgresMeetingEventSource(pool);
  beforeAll(async () => { await migrate(pool); await pool.query('TRUNCATE command_decisions, meeting_events, meetings CASCADE'); await source.start(); });
  afterAll(async () => { await source.stop(); await pool.end(); });

  it('emits only a meeting-ID wake-up after the event transaction commits', async () => {
    const id = '00000000-0000-4000-8000-000000000040';
    const wakeup = new Promise<string>((resolve) => source.subscribe(resolve));
    await withTransaction(pool, async (client) => {
      const store = new PostgresMeetingStore(client);
      await store.createMeeting(id, { id: 'p', version: 1, quorum: { type: 'fixed', minimum: 1 }, debate: { defaultDurationSeconds: 1 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } });
      await store.appendEvents(id, 0, [{ id: 'e1', type: 'MeetingInitialized', aggregateVersion: 1, occurredAt: '2026-07-10T20:00:00.000Z', causationId: 'c1', payload: { meetingId: id, rulesProfileId: 'p', rulesProfileVersion: 1 } }]);
    });
    await expect(wakeup).resolves.toBe(id);
  });
});
