import { createApp, getConfig } from './server.js';
import { Pool } from 'pg';
import { migrate } from './db.js';
import { MeetingService } from './meeting-service.js';

const config = getConfig();
const pool = new Pool({ connectionString: config.DATABASE_URL });
await migrate(pool);
createApp({ application: new MeetingService(pool) }).listen(config.PORT, () => {
  console.log(`api listening on ${config.PORT}`);
});
