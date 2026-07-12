#!/usr/bin/env node
import { Pool } from 'pg';
import { migrate } from './db.js';
import { createLoadFixture, parseLoadFixtureConfig } from './load-fixture.js';

const config = parseLoadFixtureConfig(process.env);
const pool = new Pool({ connectionString: config.databaseUrl, connectionTimeoutMillis: 2_000, query_timeout: 5_000 });
try {
  await migrate(pool);
  await createLoadFixture(pool, config);
  process.stdout.write(`${JSON.stringify({ meetingId: config.meetingId, sessions: config.sessionCount, sessionFile: config.sessionFile })}\n`);
} finally {
  await pool.end();
}
