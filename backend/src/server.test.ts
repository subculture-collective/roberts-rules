import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp, getConfig } from './server.js';

describe('getConfig', () => {
  it('parses a port from env', () => {
    expect(getConfig({ PORT: '9090' }).PORT).toBe(9090);
  });

  it('uses the project database by default', () => {
    expect(getConfig({}).DATABASE_URL).toBe(
      'postgres://roberts_rules:change-me@localhost:5432/roberts_rules?sslmode=disable',
    );
  });

  it('reports not ready without exposing the readiness failure', async () => {
    const app = createApp({ readiness: async () => { throw new Error('postgres://private-host/meeting'); } } as never);
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    try {
      const port = (app.address() as AddressInfo).port;
      const response = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ status: 'not_ready' });
    } finally {
      await new Promise<void>((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
    }
  });

  it('reports ready only when the injected check succeeds while liveness stays independent', async () => {
    const app = createApp({ readiness: async () => true });
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', resolve));
    try {
      const port = (app.address() as AddressInfo).port;
      const ready = await fetch(`http://127.0.0.1:${port}/ready`);
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: 'ready' });
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });
    } finally {
      await new Promise<void>((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
    }
  });
});
