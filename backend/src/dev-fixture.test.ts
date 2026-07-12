import { mkdtemp,readFile,stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { describe,expect,it } from 'vitest';
import { migrate } from './db.js';
import { cleanupDevFixture,createDevFixture,parseDevFixtureConfig,writeDevFixture } from './dev-fixture.js';

describe('development fixture safeguards',()=>{
  it('requires exact confirmation and a local database',()=>{expect(()=>parseDevFixtureConfig({DATABASE_URL:'postgres://localhost/db'})).toThrow();expect(()=>parseDevFixtureConfig({DATABASE_URL:'postgres://db.example/db',CONFIRM_DEV_FIXTURE:'local-only'})).toThrow('local database');});
  it('writes an explicitly requested token file with owner-only permissions',async()=>{const directory=await mkdtemp(join(tmpdir(),'rr-fixture-'));const path=join(directory,'fixture.json');const fixture={meetingId:'m',meetingUrl:'http://localhost/meetings/m',enrollments:{chair:'secret'}};await writeDevFixture(path,fixture);expect(JSON.parse(await readFile(path,'utf8'))).toEqual(fixture);expect((await stat(path)).mode&0o777).toBe(0o600);});
});

const integration=process.env.TEST_DATABASE_URL?describe:describe.skip;
integration('development fixture integration',()=>{const pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});
  it('creates an open scoped meeting with representative enrollments and cleans up only that meeting',async()=>{await migrate(pool);const fixture=await createDevFixture(pool,'http://localhost:5173');try{expect(fixture.meetingUrl).toContain(fixture.meetingId);expect(Object.keys(fixture.enrollments).sort()).toEqual(['chair','delegate','observer','secretary']);const row=await pool.query('SELECT aggregate_version FROM meetings WHERE id=$1',[fixture.meetingId]);expect(Number(row.rows[0]?.aggregate_version)).toBeGreaterThanOrEqual(5);}finally{await cleanupDevFixture(pool,fixture.meetingId);await pool.end();}});
});
