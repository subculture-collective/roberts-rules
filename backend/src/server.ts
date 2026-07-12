import { createServer } from 'node:http';
import { z } from 'zod';
import type { MeetingApplication } from './http.js';
import { createHttpHandler } from './http.js';
import { denyAllPrincipals, type PrincipalProvider } from './principal.js';
import type { SessionPrincipalProvider } from './session-principal.js';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  COOKIE_SECURE: z.enum(['true', 'false']).transform((value) => value === 'true').optional(),
  DATABASE_URL: z
    .string()
    .default(
      'postgres://roberts_rules:change-me@localhost:5432/roberts_rules?sslmode=disable',
    ),
});

export function getConfig(env: NodeJS.ProcessEnv = process.env) {
  return envSchema.parse(env);
}

export function createApp(dependencies: { application?: MeetingApplication; principals?: PrincipalProvider; sessions?: SessionPrincipalProvider; allowedOrigin?:string; secureCookies?:boolean; readiness?: () => Promise<boolean> } = {}) {
  const api = dependencies.application ? createHttpHandler(dependencies.application, dependencies.principals ?? denyAllPrincipals,dependencies.sessions,dependencies.allowedOrigin,dependencies.secureCookies) : undefined;
  return createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }
    if (req.url === '/ready') {
      void (dependencies.readiness?.() ?? Promise.resolve(false))
        .then((ready) => {
          res.writeHead(ready ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ status: ready ? 'ready' : 'not_ready' }));
        })
        .catch(() => {
          res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ status: 'not_ready' }));
        });
      return;
    }
    if (api) { void api(req, res); return; }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not_found' }));
  });
}
