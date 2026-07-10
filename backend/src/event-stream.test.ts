import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { MeetingEvent } from '@subculture/roberts-rules-meeting-domain';
import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';
import { MeetingEventStream } from './event-stream.js';

const meetingId = '00000000-0000-4000-8000-000000000050';
const event = (version: number): MeetingEvent => ({ id: `e${version}`, type: 'MeetingOpened', aggregateVersion: version, occurredAt: '2026-07-10T20:00:00.000Z', causationId: `c${version}`, payload: {} });
const closers: (() => void)[] = [];
afterEach(() => { for (const close of closers.splice(0)) close(); });

async function fixture(authenticated = true) {
  const http = createServer(); let wakeup: (id: string) => void = () => undefined;
  const stream = new MeetingEventStream(http, { authenticate: async () => authenticated ? { actorId: 'observer-1', role: 'observer' } : null },
    { exists: async () => true, loadAfter: async (_id, after) => [event(2), event(3)].filter((item) => item.aggregateVersion > after) },
    { subscribe: (callback) => { wakeup = callback; return () => undefined; } });
  await new Promise<void>((resolve) => http.listen(0, resolve));
  closers.push(() => { stream.close(); http.close(); });
  return { url: `ws://127.0.0.1:${(http.address() as AddressInfo).port}/api/meetings/${meetingId}/events?after=1`, wakeup };
}

describe('MeetingEventStream', () => {
  it('replays ordered durable events after the reconnect cursor', async () => {
    const { url } = await fixture(); const socket = new WebSocket(url); closers.push(() => socket.close());
    const messages: unknown[] = [];
    await new Promise<void>((resolve, reject) => { socket.on('message', (data) => { messages.push(JSON.parse(data.toString())); if (messages.length === 3) resolve(); }); socket.on('error', reject); });
    expect(messages).toEqual([
      { type: 'ready', meetingId, after: 1 },
      { type: 'event', meetingId, version: 2, event: event(2) },
      { type: 'event', meetingId, version: 3, event: event(3) },
    ]);
  });

  it('rejects anonymous upgrades', async () => {
    const { url } = await fixture(false); const socket = new WebSocket(url);
    const status = await new Promise<number>((resolve) => socket.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0)));
    expect(status).toBe(401);
  });

  it('rejects invalid cursors and client command frames', async () => {
    const { url } = await fixture();
    const invalid = new WebSocket(url.replace('after=1', 'after=-1'));
    await expect(new Promise<number>((resolve) => invalid.on('unexpected-response', (_request, response) => resolve(response.statusCode ?? 0)))).resolves.toBe(400);
    const socket = new WebSocket(url); await new Promise<void>((resolve) => socket.once('open', resolve));
    socket.send(JSON.stringify({ type: 'command' }));
    await expect(new Promise<number>((resolve) => socket.once('close', resolve))).resolves.toBe(1008);
  });
});
