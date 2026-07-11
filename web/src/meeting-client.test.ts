import { describe, expect, it, vi } from 'vitest';
import { createInitialState, reduce } from '@subculture/roberts-rules-meeting-domain';
import { MeetingProjectionClient, type SocketLike } from './meeting-client';

const profile = { id: 'standard', version: 1, quorum: { type: 'fixed' as const, minimum: 1 }, debate: { defaultDurationSeconds: 300 }, voteMethods: ['counted'] as const, motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' as const }, tiePolicy: 'motionFails' as const, overrides: { quorumIndependentActions: [] } };
const state = reduce(createInitialState(profile), { id: 'e1', type: 'MeetingInitialized', aggregateVersion: 1, occurredAt: '2026-07-10T19:59:00.000Z', causationId: 'c1', payload: { meetingId: 'meeting-1', rulesProfileId: 'standard', rulesProfileVersion: 1 } });
class FakeSocket implements SocketLike { onopen: (() => void) | null = null; onmessage: ((event: { data: string }) => void) | null = null; onclose: (() => void) | null = null; onerror: (() => void) | null = null; close = vi.fn(); }

describe('MeetingProjectionClient', () => {
  it('hydrates a snapshot, applies consecutive events, and ignores duplicates', async () => {
    const socket = new FakeSocket(); const projections: number[] = [];
    const client = new MeetingProjectionClient('http://api.test', 'meeting-1', vi.fn().mockResolvedValue({ ok: true, json: async () => state }) as never, () => socket);
    client.subscribe((projection) => { if (projection.state) projections.push(projection.state.version); });
    await client.start(); socket.onopen?.();
    const event = { id: 'e2', type: 'MeetingOpened', aggregateVersion: 2, occurredAt: '2026-07-10T20:00:00.000Z', causationId: 'c2', payload: {} };
    socket.onmessage?.({ data: JSON.stringify({ type: 'event', version: 2, event }) });
    socket.onmessage?.({ data: JSON.stringify({ type: 'event', version: 2, event }) });
    await Promise.resolve();
    expect(projections).toEqual([1, 1, 2]);
  });

  it('reconnects from the last applied version after close', async () => {
    const sockets: FakeSocket[] = []; const schedule = vi.fn((callback: () => void) => callback());
    const client = new MeetingProjectionClient('http://api.test', 'meeting-1', vi.fn().mockResolvedValue({ ok: true, json: async () => state }) as never, () => { const socket = new FakeSocket(); sockets.push(socket); return socket; }, schedule);
    await client.start(); sockets[0]?.onclose?.();
    expect(sockets).toHaveLength(2); expect(schedule).toHaveBeenCalled();
  });

  it('refreshes the authoritative snapshot when an event version has a gap', async () => {
    const socket = new FakeSocket(); const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => state });
    const client = new MeetingProjectionClient('http://api.test', 'meeting-1', fetcher as never, () => socket);
    await client.start();
    socket.onmessage?.({ data: JSON.stringify({ type: 'event', version: 3, event: { id: 'e3', type: 'MeetingOpened', aggregateVersion: 3, occurredAt: '2026-07-10T20:00:00.000Z', causationId: 'c3', payload: {} } }) });
    await Promise.resolve(); await Promise.resolve();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
