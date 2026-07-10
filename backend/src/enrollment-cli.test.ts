import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { issueEnrollment } from './enrollment-cli.js';

describe('issueEnrollment',()=>{
  it('returns the raw token once and persists only its hash with bounded expiry',async()=>{
    const createEnrollment=vi.fn(); const raw=Buffer.alloc(32,7);
    const token=await issueEnrollment({createEnrollment},{meetingId:'00000000-0000-4000-8000-000000000070',participantId:'delegate-1',role:'delegate',ttlMinutes:10},new Date('2026-07-10T20:00:00.000Z'),()=>raw);
    expect(token).toBe(raw.toString('base64url'));
    expect(createEnrollment).toHaveBeenCalledWith(expect.objectContaining({tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:'2026-07-10T20:10:00.000Z'}));
    expect(JSON.stringify(createEnrollment.mock.calls)).not.toContain(token);
  });
  it('rejects invalid roles and TTLs',async()=>{
    await expect(issueEnrollment({createEnrollment:vi.fn()},{meetingId:'00000000-0000-4000-8000-000000000070',participantId:'x',role:'superuser',ttlMinutes:16})).rejects.toThrow();
  });
});
