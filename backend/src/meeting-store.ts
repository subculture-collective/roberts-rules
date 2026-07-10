import type { Decision, MeetingEvent, RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import type { PoolClient } from 'pg';

export interface StoredMeeting { id: string; profile: RulesProfile; aggregateVersion: number }
export interface StoredCommandDecision { requestHash: string; decision: Decision }

export class PostgresMeetingStore {
  constructor(private readonly client: PoolClient) {}

  async createMeeting(id: string, profile: RulesProfile): Promise<void> {
    await this.client.query('INSERT INTO meetings (id, profile) VALUES ($1, $2::jsonb)', [id, JSON.stringify(profile)]);
  }

  async lockMeeting(id: string): Promise<StoredMeeting | null> {
    const result = await this.client.query<{ id: string; profile: RulesProfile; aggregate_version: string }>(
      'SELECT id, profile, aggregate_version FROM meetings WHERE id = $1 FOR UPDATE', [id],
    );
    const row = result.rows[0];
    return row ? { id: row.id, profile: row.profile, aggregateVersion: Number(row.aggregate_version) } : null;
  }

  async loadEvents(id: string): Promise<MeetingEvent[]> {
    const result = await this.client.query<{ event: MeetingEvent }>(
      'SELECT event FROM meeting_events WHERE meeting_id = $1 ORDER BY aggregate_version', [id],
    );
    return result.rows.map((row) => row.event);
  }

  async findDecision(id: string, commandId: string): Promise<StoredCommandDecision | null> {
    const result = await this.client.query<{ request_hash: string; decision: Decision }>(
      'SELECT request_hash, decision FROM command_decisions WHERE meeting_id = $1 AND command_id = $2', [id, commandId],
    );
    const row = result.rows[0];
    return row ? { requestHash: row.request_hash, decision: row.decision } : null;
  }

  async appendEvents(id: string, expectedVersion: number, events: readonly MeetingEvent[]): Promise<void> {
    let version = expectedVersion;
    for (const event of events) {
      version += 1;
      if (event.aggregateVersion !== version) throw new Error('NON_CONSECUTIVE_EVENTS');
      await this.client.query(
        'INSERT INTO meeting_events (meeting_id, aggregate_version, event) VALUES ($1, $2, $3::jsonb)',
        [id, event.aggregateVersion, JSON.stringify(event)],
      );
    }
    const result = await this.client.query(
      'UPDATE meetings SET aggregate_version = $3 WHERE id = $1 AND aggregate_version = $2', [id, expectedVersion, version],
    );
    if (result.rowCount !== 1) throw new Error('MEETING_VERSION_CONFLICT');
  }

  async storeDecision(id: string, commandId: string, requestHash: string, decision: Decision): Promise<void> {
    await this.client.query(
      'INSERT INTO command_decisions (meeting_id, command_id, request_hash, decision) VALUES ($1, $2, $3, $4::jsonb)',
      [id, commandId, requestHash, JSON.stringify(decision)],
    );
  }
}
