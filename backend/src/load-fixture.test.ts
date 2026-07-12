import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it } from 'vitest';
import { migrate } from './db.js';
import { createLoadFixture, parseLoadFixtureConfig } from './load-fixture.js';

const meetingId = '00000000-0000-4000-8000-000000001500';

describe('parseLoadFixtureConfig', () => {
  it('accepts an explicitly confirmed disposable fixture', () => {
    expect(parseLoadFixtureConfig({
      TEST_DATABASE_URL: 'postgres://localhost/test', LOAD_MEETING_ID: meetingId,
      LOAD_SESSION_FILE: '/tmp/load-sessions.jsonl', LOAD_SESSION_COUNT: '1500', CONFIRM_LOAD_FIXTURE: meetingId,
    })).toEqual({ databaseUrl: 'postgres://localhost/test', meetingId, sessionFile: '/tmp/load-sessions.jsonl', sessionCount: 1500 });
  });

  it('rejects missing confirmation and unsafe counts', () => {
    expect(() => parseLoadFixtureConfig({ TEST_DATABASE_URL: 'x', LOAD_MEETING_ID: meetingId, LOAD_SESSION_FILE: '/tmp/x', LOAD_SESSION_COUNT: '0', CONFIRM_LOAD_FIXTURE: meetingId })).toThrow();
    expect(() => parseLoadFixtureConfig({ TEST_DATABASE_URL: 'x', LOAD_MEETING_ID: meetingId, LOAD_SESSION_FILE: '/tmp/x', LOAD_SESSION_COUNT: '5001', CONFIRM_LOAD_FIXTURE: meetingId })).toThrow();
    expect(() => parseLoadFixtureConfig({ TEST_DATABASE_URL: 'x', LOAD_MEETING_ID: meetingId, LOAD_SESSION_FILE: '/tmp/x', LOAD_SESSION_COUNT: '1', CONFIRM_LOAD_FIXTURE: 'wrong' })).toThrow();
  });
});

const integration = describe.skipIf(!process.env.TEST_DATABASE_URL);
integration('load fixture integration', () => {
  it('stores distinct hashes and a private token file', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'rr-load-fixture-'));
    const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const sessionFile = join(directory, 'sessions.jsonl');
    try {
      await migrate(pool);
      await createLoadFixture(pool, { databaseUrl: process.env.TEST_DATABASE_URL!, meetingId, sessionFile, sessionCount: 3 });
      const rows = await pool.query('SELECT token_hash FROM meeting_sessions WHERE meeting_id=$1 ORDER BY participant_id', [meetingId]);
      expect(rows.rows).toHaveLength(3);
      expect(new Set(rows.rows.map((row) => row.token_hash)).size).toBe(3);
      expect((await readFile(sessionFile, 'utf8')).trim().split('\n')).toHaveLength(3);
      expect((await stat(sessionFile)).mode & 0o777).toBe(0o600);
    } finally {
      await pool.query('DELETE FROM meetings WHERE id=$1', [meetingId]).catch(() => undefined);
      await pool.end();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
