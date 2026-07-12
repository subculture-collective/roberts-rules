#!/usr/bin/env node
import { Pool } from 'pg';
import { z } from 'zod';
import { cleanupDevFixture,parseDevFixtureConfig } from './dev-fixture.js';

export async function main(args:string[],env:NodeJS.ProcessEnv=process.env){const config=parseDevFixtureConfig(env);const meetingId=z.string().uuid().parse(args[0]);const pool=new Pool({connectionString:config.databaseUrl});try{await cleanupDevFixture(pool,meetingId);}finally{await pool.end();}}
if(process.argv[1]?.endsWith('dev-fixture-cleanup-cli.ts')||process.argv[1]?.endsWith('dev-fixture-cleanup-cli.js'))main(process.argv.slice(2)).catch((error:unknown)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
