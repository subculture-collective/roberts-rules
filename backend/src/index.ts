import { createApp, getConfig } from './server.js';
import { Pool } from 'pg';
import { migrate } from './db.js';
import { MeetingService } from './meeting-service.js';
import { denyAllPrincipals } from './principal.js';
import { PostgresMeetingEventSource } from './event-source.js';
import { MeetingEventStream } from './event-stream.js';
import { withTransaction } from './db.js';
import { PostgresMeetingStore } from './meeting-store.js';

const config = getConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
await migrate(pool);
const service = new MeetingService(pool);
const source = new PostgresMeetingEventSource(pool); await source.start();
const app = createApp({ application: service, principals: denyAllPrincipals });
new MeetingEventStream(app, denyAllPrincipals, {
  exists: async (id) => { try { await service.snapshot(id); return true; } catch { return false; } },
  loadAfter: (id, version) => withTransaction(pool, (client) => new PostgresMeetingStore(client).loadEventsAfter(id, version)),
}, source);
app.listen(config.PORT, () => {
  console.log(`api listening on ${config.PORT}`);
});
