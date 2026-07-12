import { randomUUID } from 'node:crypto';
import { open } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import type { MeetingRole, RulesProfile } from '@subculture/roberts-rules-meeting-domain';
import type { Pool } from 'pg';
import { z } from 'zod';
import { withTransaction } from './db.js';
import { issueEnrollment } from './enrollment-cli.js';
import { MeetingService } from './meeting-service.js';
import { PostgresSessionStore } from './session-store.js';

const configSchema=z.object({DATABASE_URL:z.string().min(1),CONFIRM_DEV_FIXTURE:z.literal('local-only'),DEV_WEB_ORIGIN:z.url().default('http://localhost:5173'),DEV_FIXTURE_OUTPUT:z.string().optional()});
export function parseDevFixtureConfig(env:NodeJS.ProcessEnv){const value=configSchema.parse(env);const url=new URL(value.DATABASE_URL);if(!['localhost','127.0.0.1','::1'].includes(url.hostname))throw new Error('development fixtures require a local database host');if(value.DEV_FIXTURE_OUTPUT&&!isAbsolute(value.DEV_FIXTURE_OUTPUT))throw new Error('DEV_FIXTURE_OUTPUT must be absolute');return{databaseUrl:value.DATABASE_URL,origin:value.DEV_WEB_ORIGIN.replace(/\/$/,''),output:value.DEV_FIXTURE_OUTPUT};}

const profile:RulesProfile={id:'development',version:1,quorum:{type:'fixed',minimum:2},debate:{defaultDurationSeconds:300},voteMethods:['counted','rollCall','weighted','plurality','rankedChoice'],motionThreshold:{numerator:1,denominator:2,basis:'votesCast'},tiePolicy:'motionFails',overrides:{quorumIndependentActions:[]}};
const roles:{participantId:string;role:MeetingRole}[]=[{participantId:'chair-1',role:'chair'},{participantId:'secretary-1',role:'secretary'},{participantId:'delegate-1',role:'delegate'},{participantId:'observer-1',role:'observer'}];
export interface DevFixture{meetingId:string;meetingUrl:string;enrollments:Record<string,string>}

export async function createDevFixture(pool:Pool,origin:string,id:()=>string=randomUUID):Promise<DevFixture>{
  const meetingId=id();const service=new MeetingService(pool);await service.createMeeting(meetingId,profile);
  const submit=async(actorId:string,role:MeetingRole,command:Parameters<typeof service.submitCommand>[1]['command'])=>{const state=await service.snapshot(meetingId);const decision=await service.submitCommand({actorId,role},{meetingId,commandId:id(),expectedVersion:state.version,occurredAt:new Date().toISOString(),command});if(!decision.accepted)throw new Error(`fixture command rejected: ${decision.code}`);};
  try{
    await submit('administrator-1','administrator',{type:'InitializeMeeting',meetingId});
    await submit('secretary-1','secretary',{type:'CheckInParticipant',participantId:'delegate-1',participantRole:'delegate'});
    await submit('secretary-1','secretary',{type:'CheckInParticipant',participantId:'delegate-2',participantRole:'delegate'});
    await submit('chair-1','chair',{type:'OpenMeeting'});
    const enrollments:Record<string,string>={};
    await withTransaction(pool,async(client)=>{const store=new PostgresSessionStore(client);for(const role of roles)enrollments[role.role]=await issueEnrollment(store,{meetingId,...role,ttlMinutes:15});});
    return{meetingId,meetingUrl:`${origin}/meetings/${meetingId}`,enrollments};
  }catch(error){await cleanupDevFixture(pool,meetingId);throw error;}
}

export async function cleanupDevFixture(pool:Pool,meetingId:string):Promise<void>{await pool.query('DELETE FROM meetings WHERE id=$1',[meetingId]);}
export async function writeDevFixture(path:string,fixture:DevFixture):Promise<void>{const handle=await open(path,'wx',0o600);try{await handle.writeFile(`${JSON.stringify(fixture)}\n`,'utf8');}finally{await handle.close();}}
