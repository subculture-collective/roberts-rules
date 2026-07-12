import { createHash, randomBytes } from 'node:crypto';
import { link, open, rm } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTransaction } from './db.js';

const schema = z.object({
  TEST_DATABASE_URL: z.string().min(1),
  LOAD_MEETING_ID: z.string().uuid(),
  LOAD_SESSION_FILE: z.string().min(1).refine(isAbsolute, 'LOAD_SESSION_FILE must be absolute'),
  LOAD_SESSION_COUNT: z.coerce.number().int().min(1).max(5000),
  CONFIRM_LOAD_FIXTURE: z.string().min(1),
});

export function parseLoadFixtureConfig(env: NodeJS.ProcessEnv) {
  const value = schema.parse(env);
  if (value.CONFIRM_LOAD_FIXTURE !== value.LOAD_MEETING_ID) throw new Error('CONFIRM_LOAD_FIXTURE must exactly match LOAD_MEETING_ID');
  return { databaseUrl: value.TEST_DATABASE_URL, meetingId: value.LOAD_MEETING_ID, sessionFile: value.LOAD_SESSION_FILE, sessionCount: value.LOAD_SESSION_COUNT };
}

export async function createLoadFixture(pool: Pool, config: ReturnType<typeof parseLoadFixtureConfig>): Promise<void> {
  const tokens = Array.from({ length: config.sessionCount }, () => randomBytes(32).toString('base64url'));
  const expiresAt = new Date(Date.now() + 2 * 60 * 60_000).toISOString();
  await withTransaction(pool, async (client) => {
    const existing = await client.query<{ count: string }>('SELECT count(*) FROM meeting_events WHERE meeting_id=$1', [config.meetingId]);
    if (Number(existing.rows[0]?.count ?? 0) > 0) throw new Error('refusing to replace a fixture meeting with journal events');
    await client.query('DELETE FROM meetings WHERE id=$1', [config.meetingId]);
    const profile = { id: 'load-test', version: 1, quorum: { type: 'fixed', minimum: 1 }, debate: { defaultDurationSeconds: 60 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } };
    await client.query('INSERT INTO meetings(id,profile) VALUES($1,$2::jsonb)', [config.meetingId, JSON.stringify(profile)]);
    for (const [index, token] of tokens.entries()) {
      const tokenHash = createHash('sha256').update(token).digest('hex');
      await client.query('INSERT INTO meeting_sessions(token_hash,meeting_id,participant_id,role,expires_at) VALUES($1,$2,$3,$4,$5)', [tokenHash, config.meetingId, `load-observer-${index + 1}`, 'observer', expiresAt]);
    }
  });
  const temporary = `${config.sessionFile}.partial.${process.pid}`;
  const handle = await open(temporary, 'wx', 0o600);
  try {
    await handle.writeFile(tokens.map((token) => JSON.stringify({ token })).join('\n') + '\n', 'utf8');
  } finally {
    await handle.close();
  }
  try {
    await link(temporary, config.sessionFile);
    await rm(temporary);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
