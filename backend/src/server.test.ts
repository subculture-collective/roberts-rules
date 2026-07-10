import { describe, expect, it } from 'vitest';
import { getConfig } from './server.js';

describe('getConfig', () => {
  it('parses a port from env', () => {
    expect(getConfig({ PORT: '9090' }).PORT).toBe(9090);
  });

  it('uses the project database by default', () => {
    expect(getConfig({}).DATABASE_URL).toBe(
      'postgres://roberts_rules:change-me@localhost:5432/roberts_rules?sslmode=disable',
    );
  });
});
