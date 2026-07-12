#!/usr/bin/env node
import { Pool } from 'pg';
import { migrate } from './db.js';
import { createDevFixture,parseDevFixtureConfig,writeDevFixture } from './dev-fixture.js';

export async function main(env:NodeJS.ProcessEnv=process.env){const config=parseDevFixtureConfig(env);const pool=new Pool({connectionString:config.databaseUrl});try{await migrate(pool);const fixture=await createDevFixture(pool,config.origin);if(config.output)await writeDevFixture(config.output,fixture);process.stdout.write(`${JSON.stringify(fixture)}\n`);}finally{await pool.end();}}
if(process.argv[1]?.endsWith('dev-fixture-cli.ts')||process.argv[1]?.endsWith('dev-fixture-cli.js'))main().catch((error:unknown)=>{process.stderr.write(`${error instanceof Error?error.message:String(error)}\n`);process.exitCode=1;});
