import { describe, expect, it, vi } from 'vitest';
import { isWritablePrimary } from './readiness.js';

describe('isWritablePrimary', () => {
  it('accepts only a writable non-recovery database', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ready: true }] });
    await expect(isWritablePrimary({ query })).resolves.toBe(true);
    expect(query).toHaveBeenCalledWith(expect.stringContaining('pg_is_in_recovery'));
  });

  it('rejects a reachable standby or read-only database', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ ready: false }] });
    await expect(isWritablePrimary({ query })).resolves.toBe(false);
  });
});
