import { createApp, getConfig } from './server.js';
import { Pool } from 'pg';
import { migrate } from './db.js';
import { MeetingService } from './meeting-service.js';
import { PostgresMeetingEventSource } from './event-source.js';
import { MeetingEventStream } from './event-stream.js';
import { withTransaction } from './db.js';
import { PostgresMeetingStore } from './meeting-store.js';
import { SessionPrincipalProvider } from './session-principal.js';
import { isWritablePrimary } from './readiness.js';

const config = getConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL, connectionTimeoutMillis: 2_000, query_timeout: 2_000 });
await migrate(pool);
const service = new MeetingService(pool);
const allowedOrigin=process.env.APP_ORIGIN??'http://localhost:5173';
const principals=new SessionPrincipalProvider(pool,allowedOrigin);
const source = new PostgresMeetingEventSource(pool); await source.start();
const app = createApp({
  application: service,
  principals,
  sessions: principals,
  allowedOrigin,
  secureCookies: config.COOKIE_SECURE ?? process.env.NODE_ENV === 'production',
  readiness: () => isWritablePrimary(pool),
});
new MeetingEventStream(app, principals, {
  exists: async (id) => { try { await service.snapshot(id); return true; } catch { return false; } },
  loadAfter: (id, version) => withTransaction(pool, (client) => new PostgresMeetingStore(client).loadEventsAfter(id, version)),
}, source);
app.listen(config.PORT, () => {
  console.log(`api listening on ${config.PORT}`);
});
