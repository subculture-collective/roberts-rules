import { readFile, readdir } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';

const migrationsUrl = new URL('../migrations/', import.meta.url);

export async function migrate(pool: Pool): Promise<void> {
  const files = (await readdir(migrationsUrl)).filter((file) => file.endsWith('.sql')).sort();
  await withTransaction(pool, async (client) => {
    for (const file of files) await client.query(await readFile(new URL(file, migrationsUrl), 'utf8'));
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
