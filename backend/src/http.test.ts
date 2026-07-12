import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from './server.js';

const servers: ReturnType<typeof createApp>[] = [];
afterEach(async () => Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve())))));

async function start(principal: { actorId: string; role: 'administrator' | 'chair' } | null) {
  const application = { createMeeting: vi.fn(), submitCommand: vi.fn().mockResolvedValue({ accepted: false, code: 'STALE_VERSION', explanation: 'stale' }), snapshot: vi.fn().mockResolvedValue({ version: 3 }) };
  const server = createApp({ application: application as never, principals: { authenticate: async () => principal } });
  servers.push(server); await new Promise<void>((resolve) => server.listen(0, resolve));
  return { application, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}` };
}

describe('private meeting HTTP boundary', () => {
  it('redeems enrollment into a scoped HttpOnly session cookie',async()=>{
    const application={createMeeting:vi.fn(),submitCommand:vi.fn(),snapshot:vi.fn()};const sessions={redeem:vi.fn().mockResolvedValue({token:'session-secret',principal:{actorId:'delegate-1',role:'delegate'},expiresAt:'2026-07-10T20:30:00.000Z'}),revoke:vi.fn()};
    const server=createApp({application:application as never,sessions:sessions as never,allowedOrigin:'http://localhost:5173',secureCookies:true});servers.push(server);await new Promise<void>((resolve)=>server.listen(0,resolve));const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const response=await fetch(`${url}/api/meetings/00000000-0000-4000-8000-000000000030/session`,{method:'POST',headers:{origin:'http://localhost:5173'},body:JSON.stringify({enrollmentToken:'enrollment-token-long-enough'})});
    expect(response.status).toBe(201);expect(response.headers.get('set-cookie')).toContain('HttpOnly');expect(await response.json()).not.toHaveProperty('token');
  });

  it('returns the current meeting session and fails closed without one', async () => {
    const meetingId = '00000000-0000-4000-8000-000000000030';
    const principals = {
      authenticate: vi.fn(async (_request, requestedMeetingId?: string) =>
        requestedMeetingId === meetingId ? { actorId: 'chair-1', role: 'chair' as const } : null,
      ),
    };
    const application={createMeeting:vi.fn(),submitCommand:vi.fn(),snapshot:vi.fn()};
    const server=createApp({application:application as never,principals});servers.push(server);await new Promise<void>((resolve)=>server.listen(0,resolve));
    const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const current = await fetch(`${url}/api/meetings/${meetingId}/session`);
    expect(current.status).toBe(200);
    await expect(current.json()).resolves.toEqual({ meetingId, actorId: 'chair-1', role: 'chair' });

    const missing = await fetch(`${url}/api/meetings/00000000-0000-4000-8000-000000000031/session`);
    expect(missing.status).toBe(401);
    await expect(missing.json()).resolves.toEqual({ error: 'AUTHENTICATION_REQUIRED' });
  });
  it('creates a meeting for an authenticated administrator', async () => {
    const { application, url } = await start({ actorId: 'admin-1', role: 'administrator' });
    const profile = { id: 'standard', version: 1, quorum: { type: 'fixed', minimum: 1 }, debate: { defaultDurationSeconds: 300 }, voteMethods: ['counted'], motionThreshold: { numerator: 1, denominator: 2, basis: 'votesCast' }, tiePolicy: 'motionFails', overrides: { quorumIndependentActions: [] } };
    const response = await fetch(`${url}/api/meetings`, { method: 'POST', body: JSON.stringify({ id: '00000000-0000-4000-8000-000000000030', profile }) });
    expect(response.status).toBe(201); expect(application.createMeeting).toHaveBeenCalledOnce();
  });

  it('derives command authority from the principal and returns domain rejections', async () => {
    const { application, url } = await start({ actorId: 'chair-1', role: 'chair' });
    const response = await fetch(`${url}/api/meetings/00000000-0000-4000-8000-000000000030/commands`, { method: 'POST', headers:{origin:'http://localhost:5173'}, body: JSON.stringify({ commandId: 'open-1', expectedVersion: 1, occurredAt: '2026-07-10T20:00:00.000Z', command: { type: 'OpenMeeting' } }) });
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ code: 'STALE_VERSION' });
    expect(application.submitCommand.mock.calls[0]?.[0]).toEqual({ actorId: 'chair-1', role: 'chair' });
  });

  it('rejects client-supplied authority and missing authentication', async () => {
    const authenticated = await start({ actorId: 'chair-1', role: 'chair' });
    const forbidden = await fetch(`${authenticated.url}/api/meetings/00000000-0000-4000-8000-000000000030/commands`, { method: 'POST', headers:{origin:'http://localhost:5173'}, body: JSON.stringify({ actorId: 'fake', commandId: 'x', expectedVersion: 0, occurredAt: '2026-07-10T20:00:00.000Z', command: { type: 'OpenMeeting' } }) });
    expect(forbidden.status).toBe(400); expect(await forbidden.json()).toEqual({ error: 'ENVELOPE_AUTHORITY_FORBIDDEN' });
    const anonymous = await start(null);
    expect((await fetch(`${anonymous.url}/api/meetings/00000000-0000-4000-8000-000000000030/snapshot`)).status).toBe(401);
  });
});
