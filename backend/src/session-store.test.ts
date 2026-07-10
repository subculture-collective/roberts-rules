import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate, withTransaction } from './db.js';
import { PostgresMeetingStore } from './meeting-store.js';
import { PostgresSessionStore } from './session-store.js';

const databaseUrl=process.env.TEST_DATABASE_URL; const integration=describe.skipIf(!databaseUrl);
integration('PostgresSessionStore',()=>{
  const pool=new Pool({connectionString:databaseUrl}); const meetingId='00000000-0000-4000-8000-000000000060';
  beforeAll(async()=>{await migrate(pool);await pool.query('TRUNCATE meeting_sessions,meeting_enrollments,command_decisions,meeting_events,meetings CASCADE');await withTransaction(pool,(client)=>new PostgresMeetingStore(client).createMeeting(meetingId,{id:'p',version:1,quorum:{type:'fixed',minimum:1},debate:{defaultDurationSeconds:1},voteMethods:['counted'],motionThreshold:{numerator:1,denominator:2,basis:'votesCast'},tiePolicy:'motionFails',overrides:{quorumIndependentActions:[]}}));});
  afterAll(()=>pool.end());
  it('consumes enrollment once, binds meeting, and revokes the session',async()=>{
    const enrollment='a'.repeat(64), session='b'.repeat(64), now='2026-07-10T20:00:00.000Z', expiry='2026-07-10T20:30:00.000Z';
    await withTransaction(pool,(client)=>new PostgresSessionStore(client).createEnrollment({tokenHash:enrollment,meetingId,participantId:'chair-1',role:'chair',expiresAt:'2026-07-10T20:15:00.000Z'}));
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).consumeEnrollment(enrollment,session,now,expiry))).resolves.toMatchObject({meetingId,participantId:'chair-1',role:'chair'});
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).consumeEnrollment(enrollment,'c'.repeat(64),now,expiry))).resolves.toBeNull();
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).findSession(session,meetingId,now))).resolves.toMatchObject({role:'chair'});
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).findSession(session,'00000000-0000-4000-8000-000000000061',now))).resolves.toBeNull();
    await withTransaction(pool,(client)=>new PostgresSessionStore(client).revokeSession(session,now));
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).findSession(session,meetingId,now))).resolves.toBeNull();
  });
  it('does not consume an expired enrollment',async()=>{
    const enrollment='d'.repeat(64); await withTransaction(pool,(client)=>new PostgresSessionStore(client).createEnrollment({tokenHash:enrollment,meetingId,participantId:'observer-1',role:'observer',expiresAt:'2026-07-10T19:59:00.000Z'}));
    await expect(withTransaction(pool,(client)=>new PostgresSessionStore(client).consumeEnrollment(enrollment,'e'.repeat(64),'2026-07-10T20:00:00.000Z','2026-07-10T20:30:00.000Z'))).resolves.toBeNull();
  });
});
