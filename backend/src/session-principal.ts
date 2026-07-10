import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Pool } from 'pg';
import { withTransaction } from './db.js';
import type { MeetingPrincipal } from './meeting-service.js';
import type { PrincipalProvider } from './principal.js';
import { PostgresSessionStore } from './session-store.js';

export const SESSION_COOKIE = 'rr_meeting_session';
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
export function readSessionToken(request: IncomingMessage): string | null {
  for (const part of (request.headers.cookie ?? '').split(';')) { const [name,...rest]=part.trim().split('='); if(name===SESSION_COOKIE)return decodeURIComponent(rest.join('=')); }
  return null;
}

export class SessionPrincipalProvider implements PrincipalProvider {
  constructor(private readonly pool: Pool, private readonly allowedOrigin: string) {}
  async authenticate(request: IncomingMessage, meetingId?: string): Promise<MeetingPrincipal | null> {
    if (!meetingId || (request.headers.origin && request.headers.origin !== this.allowedOrigin)) return null;
    const token=readSessionToken(request); if(!token)return null;
    const session=await withTransaction(this.pool,(client)=>new PostgresSessionStore(client).findSession(hash(token),meetingId,new Date().toISOString()));
    return session?{actorId:session.participantId,role:session.role}:null;
  }
  async redeem(meetingId:string,enrollmentToken:string):Promise<{token:string;principal:MeetingPrincipal;expiresAt:string}|null>{
    const token=randomBytes(32).toString('base64url'); const now=new Date(); const expiresAt=new Date(now.getTime()+30*60_000).toISOString();
    const session=await withTransaction(this.pool,(client)=>new PostgresSessionStore(client).consumeEnrollment(hash(enrollmentToken),hash(token),now.toISOString(),expiresAt));
    return session?{token,principal:{actorId:session.participantId,role:session.role},expiresAt}:null;
  }
  async revoke(request:IncomingMessage):Promise<void>{const token=readSessionToken(request);if(token)await withTransaction(this.pool,(client)=>new PostgresSessionStore(client).revokeSession(hash(token),new Date().toISOString()));}
}
export function sessionCookie(meetingId:string,token:string,secure:boolean):string{return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/api/meetings/${meetingId}; HttpOnly; SameSite=Strict; Max-Age=1800${secure?'; Secure':''}`;}
export function clearSessionCookie(meetingId:string,secure:boolean):string{return `${SESSION_COOKIE}=; Path=/api/meetings/${meetingId}; HttpOnly; SameSite=Strict; Max-Age=0${secure?'; Secure':''}`;}
