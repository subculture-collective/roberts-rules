import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';

const migrationUrl = new URL('../migrations/001_meeting_journal.sql', import.meta.url);

export async function migrate(pool: Pool): Promise<void> {
  const sql = await readFile(migrationUrl, 'utf8');
  await withTransaction(pool, async (client) => {
    await client.query(sql);
  });
}

export async function withTransaction<T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
