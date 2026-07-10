import type { RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from './db.js';
import { MeetingService } from './meeting-service.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
const id = '00000000-0000-4000-8000-000000000020';
const profile: RulesProfile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 1 }, debate: { defaultDurationSeconds: 300 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } };
const chair = { actorId: 'chair-1', role: 'chair' as const };

integration('MeetingService', () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  const service = new MeetingService(pool);
  beforeAll(async () => { await migrate(pool); await pool.query('TRUNCATE command_decisions, meeting_events, meetings CASCADE'); await service.createMeeting(id, profile); });
  afterAll(async () => pool.end());

  it('decides, stores, and replays an initialized meeting idempotently', async () => {
    const input = { meetingId: id, commandId: 'initialize-1', expectedVersion: 0, occurredAt: '2026-07-10T20:00:00.000Z', command: { type: 'InitializeMeeting' as const, meetingId: id } };
    const first = await service.submitCommand(chair, input);
    expect(first.accepted).toBe(true);
    expect(await service.submitCommand(chair, input)).toEqual(first);
    expect((await service.snapshot(id)).version).toBe(1);
  });

  it('rejects reuse of a command ID with different content', async () => {
    await expect(service.submitCommand(chair, { meetingId: id, commandId: 'initialize-1', expectedVersion: 1, occurredAt: '2026-07-10T20:00:00.000Z', command: { type: 'OpenMeeting' } })).rejects.toMatchObject({ code: 'COMMAND_ID_CONFLICT' });
  });

  it('serializes same-version commands so one becomes stale', async () => {
    const results = await Promise.all([
      service.submitCommand(chair, { meetingId: id, commandId: 'open-1', expectedVersion: 1, occurredAt: '2026-07-10T20:01:00.000Z', command: { type: 'OpenMeeting' } }),
      service.submitCommand(chair, { meetingId: id, commandId: 'open-2', expectedVersion: 1, occurredAt: '2026-07-10T20:01:01.000Z', command: { type: 'OpenMeeting' } }),
    ]);
    expect(results.filter((result) => result.accepted)).toHaveLength(1);
    expect(results.find((result) => !result.accepted)).toMatchObject({ code: 'STALE_VERSION' });
  });

  it('durably deduplicates rejections without appending events', async () => {
    const input = { meetingId: id, commandId: 'observer-adjourn', expectedVersion: 2, occurredAt: '2026-07-10T20:02:00.000Z', command: { type: 'AdjournMeeting' as const } };
    const first = await service.submitCommand({ actorId: 'observer-1', role: 'observer' }, input);
    expect(first).toMatchObject({ accepted: false, code: 'ROLE_FORBIDDEN' });
    expect(await service.submitCommand({ actorId: 'observer-1', role: 'observer' }, input)).toEqual(first);
    expect((await service.snapshot(id)).version).toBe(2);
  });

  it('rejects commands for missing meetings', async () => {
    await expect(service.submitCommand(chair, { meetingId: '00000000-0000-4000-8000-000000000099', commandId: 'missing', expectedVersion: 0, occurredAt: '2026-07-10T20:00:00.000Z', command: { type: 'OpenMeeting' } })).rejects.toMatchObject({ code: 'MEETING_NOT_FOUND' });
  });
});
