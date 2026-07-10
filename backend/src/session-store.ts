import type { MeetingRole } from '@subculture/roberts-rules-meeting-domain';
import type { PoolClient } from 'pg';

export interface MeetingSession { meetingId: string; participantId: string; role: MeetingRole; expiresAt: string }

export class PostgresSessionStore {
  constructor(private readonly client: PoolClient) {}

  async createEnrollment(input: MeetingSession & { tokenHash: string }): Promise<void> {
    await this.client.query('INSERT INTO meeting_enrollments (token_hash, meeting_id, participant_id, role, expires_at) VALUES ($1,$2,$3,$4,$5)', [input.tokenHash, input.meetingId, input.participantId, input.role, input.expiresAt]);
  }

  async consumeEnrollment(enrollmentHash: string, sessionHash: string, now: string, sessionExpiresAt: string): Promise<MeetingSession | null> {
    const found = await this.client.query<{ meeting_id: string; participant_id: string; role: MeetingRole; expires_at: Date }>(
      `SELECT meeting_id, participant_id, role, expires_at FROM meeting_enrollments
       WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at > $2 FOR UPDATE`, [enrollmentHash, now],
    );
    const row = found.rows[0]; if (!row) return null;
    await this.client.query('UPDATE meeting_enrollments SET consumed_at=$2 WHERE token_hash=$1', [enrollmentHash, now]);
    await this.client.query('INSERT INTO meeting_sessions (token_hash,meeting_id,participant_id,role,expires_at) VALUES ($1,$2,$3,$4,$5)', [sessionHash,row.meeting_id,row.participant_id,row.role,sessionExpiresAt]);
    return { meetingId: row.meeting_id, participantId: row.participant_id, role: row.role, expiresAt: sessionExpiresAt };
  }

  async findSession(tokenHash: string, meetingId: string, now: string): Promise<MeetingSession | null> {
    const result = await this.client.query<{ meeting_id: string; participant_id: string; role: MeetingRole; expires_at: Date }>(
      'SELECT meeting_id,participant_id,role,expires_at FROM meeting_sessions WHERE token_hash=$1 AND meeting_id=$2 AND revoked_at IS NULL AND expires_at > $3', [tokenHash,meetingId,now],
    );
    const row=result.rows[0]; return row ? { meetingId:row.meeting_id, participantId:row.participant_id, role:row.role, expiresAt:row.expires_at.toISOString() } : null;
  }

  async revokeSession(tokenHash: string, now: string): Promise<void> { await this.client.query('UPDATE meeting_sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL', [tokenHash,now]); }
}
