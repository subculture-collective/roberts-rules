#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { canonicalStringify, createInitialState, reduce, type MeetingEvent, type RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import { Pool } from 'pg';

interface MeetingRow { id: string; profile: RulesProfile; aggregate_version: string }
interface EventRow { meeting_id: string; event: MeetingEvent }

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });

try {
  const meetings = await pool.query<MeetingRow>('SELECT id, profile, aggregate_version FROM meetings ORDER BY id');
  const events = await pool.query<EventRow>('SELECT meeting_id, event FROM meeting_events ORDER BY meeting_id, aggregate_version');
  const byMeeting = new Map<string, MeetingEvent[]>();
  for (const row of events.rows) byMeeting.set(row.meeting_id, [...(byMeeting.get(row.meeting_id) ?? []), row.event]);
  const digests = meetings.rows.map((meeting) => {
    let state = createInitialState(meeting.profile);
    for (const event of byMeeting.get(meeting.id) ?? []) state = reduce(state, event);
    if (state.version !== Number(meeting.aggregate_version)) throw new Error(`aggregate version mismatch for ${meeting.id}`);
    return {
      meetingId: meeting.id,
      aggregateVersion: state.version,
      sha256: createHash('sha256').update(canonicalStringify(state)).digest('hex'),
    };
  });
  process.stdout.write(`${canonicalStringify(digests)}\n`);
} finally {
  await pool.end();
}
