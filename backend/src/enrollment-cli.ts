#!/usr/bin/env node
import { createHash, randomBytes } from 'node:crypto';
import { Pool } from 'pg';
import { z } from 'zod';
import { migrate, withTransaction } from './db.js';
import { PostgresSessionStore, type MeetingSession } from './session-store.js';

const inputSchema = z.object({
  meetingId: z.string().uuid(),
  participantId: z.string().min(1).max(200),
  role: z.enum(['administrator','chair','parliamentarian','secretary','teller','delegate','alternate','participant','observer','technicalOperator']),
  ttlMinutes: z.number().int().min(1).max(15).default(15),
}).strict();

export interface EnrollmentWriter { createEnrollment(input: MeetingSession & { tokenHash: string }): Promise<void> }

export async function issueEnrollment(writer: EnrollmentWriter, input: unknown, now = new Date(), random = randomBytes): Promise<string> {
  const parsed = inputSchema.parse(input);
  const token = random(32).toString('base64url');
  await writer.createEnrollment({
    tokenHash: createHash('sha256').update(token).digest('hex'),
    meetingId: parsed.meetingId, participantId: parsed.participantId, role: parsed.role,
    expiresAt: new Date(now.getTime() + parsed.ttlMinutes * 60_000).toISOString(),
  });
  return token;
}

function parseArgs(args: string[]) {
  const values = new Map<string,string>();
  for (let index=0; index<args.length; index+=2) { const key=args[index]; const value=args[index+1]; if (!key?.startsWith('--') || value===undefined) throw new Error('Arguments must be --key value pairs'); values.set(key.slice(2),value); }
  return { meetingId:values.get('meeting'), participantId:values.get('participant'), role:values.get('role'), ttlMinutes:values.has('ttl')?Number(values.get('ttl')):15 };
}

export async function main(args: string[], env: NodeJS.ProcessEnv = process.env): Promise<void> {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool=new Pool({connectionString:env.DATABASE_URL});
  try { await migrate(pool); const token=await withTransaction(pool,(client)=>issueEnrollment(new PostgresSessionStore(client),parseArgs(args))); process.stdout.write(`${token}\n`); }
  finally { await pool.end(); }
}

if (process.argv[1]?.endsWith('enrollment-cli.ts') || process.argv[1]?.endsWith('enrollment-cli.js')) {
  main(process.argv.slice(2)).catch((error:unknown)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
}
