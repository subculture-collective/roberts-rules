import { createHash } from 'node:crypto';import { Pool } from 'pg';
import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { migrate,withTransaction } from './db.js';import { PostgresMeetingStore } from './meeting-store.js';import { PostgresSessionStore } from './session-store.js';
import { clearSessionCookie, readSessionToken, SESSION_COOKIE, SessionPrincipalProvider, sessionCookie } from './session-principal.js';

describe('meeting session cookies',()=>{
  it('uses a meeting-scoped HttpOnly Strict cookie without exposing broader paths',()=>{
    const value=sessionCookie('00000000-0000-4000-8000-000000000080','secret',true);
    expect(value).toContain(`${SESSION_COOKIE}=secret`);expect(value).toContain('Path=/api/meetings/00000000-0000-4000-8000-000000000080');expect(value).toContain('HttpOnly');expect(value).toContain('SameSite=Strict');expect(value).toContain('Secure');
  });
  it('parses and clears the scoped cookie',()=>{expect(readSessionToken({headers:{cookie:`x=1; ${SESSION_COOKIE}=abc`}} as never)).toBe('abc');expect(clearSessionCookie('00000000-0000-4000-8000-000000000080',false)).toContain('Max-Age=0');});
});

const databaseUrl=process.env.TEST_DATABASE_URL;const integration=describe.skipIf(!databaseUrl);
integration('SessionPrincipalProvider',()=>{const pool=new Pool({connectionString:databaseUrl});const id='00000000-0000-4000-8000-000000000080';const enrollment='raw-enrollment-token';
  beforeAll(async()=>{await migrate(pool);await pool.query('TRUNCATE meeting_sessions,meeting_enrollments,command_decisions,meeting_events,meetings CASCADE');await withTransaction(pool,async(client)=>{await new PostgresMeetingStore(client).createMeeting(id,{id:'p',version:1,quorum:{type:'fixed',minimum:1},debate:{defaultDurationSeconds:1},voteMethods:['counted'],motionThreshold:{numerator:1,denominator:2,basis:'votesCast'},tiePolicy:'motionFails',overrides:{quorumIndependentActions:[]}});await new PostgresSessionStore(client).createEnrollment({tokenHash:createHash('sha256').update(enrollment).digest('hex'),meetingId:id,participantId:'chair-1',role:'chair',expiresAt:new Date(Date.now()+60_000).toISOString()});});});afterAll(()=>pool.end());
  it('redeems once, authenticates only the bound meeting, and revokes',async()=>{const provider=new SessionPrincipalProvider(pool,'http://localhost:5173');const redeemed=await provider.redeem(id,enrollment);expect(redeemed?.principal).toEqual({actorId:'chair-1',role:'chair'});await expect(provider.redeem(id,enrollment)).resolves.toBeNull();const request={headers:{cookie:`${SESSION_COOKIE}=${redeemed?.token}`,origin:'http://localhost:5173'}} as never;await expect(provider.authenticate(request,id)).resolves.toEqual({actorId:'chair-1',role:'chair'});await expect(provider.authenticate(request,'00000000-0000-4000-8000-000000000081')).resolves.toBeNull();await provider.revoke(request);await expect(provider.authenticate(request,id)).resolves.toBeNull();});
});
