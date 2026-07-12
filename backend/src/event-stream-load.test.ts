import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { MeetingEventStream } from './event-stream.js';
import { parseEventStreamLoadConfig, runEventStreamLoad } from './event-stream-load.js';

const meetingId = '00000000-0000-4000-8000-000000001500';
const closers: (() => void)[] = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });

describe('event stream load harness', () => {
  it('validates the load profile', () => {
    const config = parseEventStreamLoadConfig({ LOAD_WS_URL: `ws://localhost/api/meetings/${meetingId}/events?after=0`, LOAD_ORIGIN: 'http://localhost:5173', LOAD_SESSION_FILE: '/tmp/sessions', LOAD_CONNECTIONS: '2', LOAD_RAMP_MS: '10', LOAD_HOLD_MS: '10', LOAD_RECONNECT_PERCENT: '50', LOAD_TIMEOUT_MS: '1000' });
    expect(config.connections).toBe(2);
    expect(() => parseEventStreamLoadConfig({ ...process.env, LOAD_CONNECTIONS: '0' })).toThrow();
  });

  it('connects distinct authenticated clients and reconnects the target subset', async () => {
    const http = createServer();
    const stream = new MeetingEventStream(http, { authenticate: async (request) => request.headers.cookie?.includes('token-') ? { actorId: 'load', role: 'observer' } : null }, { exists: async () => true, loadAfter: async () => [] }, { subscribe: () => () => undefined });
    await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
    closers.push(() => { stream.close(); http.close(); });
    const port = (http.address() as AddressInfo).port;
    const result = await runEventStreamLoad({ wsUrl: `ws://127.0.0.1:${port}/api/meetings/${meetingId}/events?after=0`, origin: 'http://localhost:5173', sessionFile: '/unused', connections: 4, rampMs: 5, holdMs: 10, reconnectPercent: 50, timeoutMs: 1000 }, ['token-1', 'token-2', 'token-3', 'token-4']);
    expect(result.summary.initial).toMatchObject({ target: 4, succeeded: 4, failed: 0 });
    expect(result.summary.reconnect).toMatchObject({ target: 2, succeeded: 2, failed: 0 });
    expect(result.summary.failures).toEqual({});
  });
});
