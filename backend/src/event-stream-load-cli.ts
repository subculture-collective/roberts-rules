#!/usr/bin/env node
import { canonicalStringify } from '@subculture/roberts-rules-meeting-domain';
import { parseEventStreamLoadConfig, readLoadTokens, runEventStreamLoad } from './event-stream-load.js';

const config = parseEventStreamLoadConfig(process.env);
const result = await runEventStreamLoad(config, await readLoadTokens(config.sessionFile));
process.stdout.write(`${canonicalStringify(result)}\n`);
if (result.summary.initial.failed > 0 || result.summary.reconnect.failed > 0 || Object.keys(result.summary.failures).length > 0) process.exitCode = 1;
