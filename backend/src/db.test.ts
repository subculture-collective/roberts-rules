import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, withTransaction } from './db.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);

integration('PostgreSQL meeting journal foundation', () => {
  const pool = new Pool({ connectionString: databaseUrl });

  beforeAll(async () => {
    await pool.query('DROP TABLE IF EXISTS command_decisions, meeting_events, meetings CASCADE');
  });

  afterAll(async () => pool.end());

  it('applies the meeting journal schema idempotently', async () => {
    await migrate(pool);
    await migrate(pool);

    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('meetings', 'meeting_events', 'command_decisions')
       ORDER BY table_name`,
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      'command_decisions',
      'meeting_events',
      'meetings',
    ]);
  });

  it('rolls back a failed transaction', async () => {
    await expect(
      withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO meetings (id, profile) VALUES ($1, $2::jsonb)`,
          ['00000000-0000-4000-8000-000000000001', '{}'],
        );
        throw new Error('stop');
      }),
    ).rejects.toThrow('stop');

    const result = await pool.query('SELECT id FROM meetings');
    expect(result.rowCount).toBe(0);
  });
});
