# Stack Reference

Roberts Rules is a pnpm TypeScript workspace requiring Node.js 22 or newer, with a Node API, Vite React frontend, PostgreSQL, Docker Compose, Vitest, and Open Pilot conventions. The meeting-domain simulator remains authoritative. `meeting-publication` owns pure public projections and approval/outbox state; `atproto-publication` owns the repository adapter.

AT Protocol schemas live in `lexicons/`. Run `pnpm lexicons:build` after changing them and commit the reproducible generated TypeScript in `packages/meeting-publication/src/generated/`. Production PDS access is not part of the default verification gate.

The private command API uses PostgreSQL migrations in `backend/migrations/`. To run its real integration suite against the Compose database on an unused local port:

```bash
POSTGRES_PORT=55432 docker compose up -d postgres
TEST_DATABASE_URL='postgres://roberts_rules:change-me@localhost:55432/roberts_rules?sslmode=disable' pnpm --filter @subculture/roberts-rules-api test
POSTGRES_PORT=55432 docker compose down
```

The canonical verification command is:

```bash
make verify
```

Private realtime clients use `ws` on the API server's explicit HTTP upgrade path. They reconnect with their last applied aggregate version; PostgreSQL LISTEN/NOTIFY wakes the server, while journal queries provide the actual ordered event data.

The React client applies only consecutive meeting events with the shared meeting-domain reducer. Duplicate versions are ignored, gaps force a snapshot refresh, and reconnect attempts use capped exponential backoff with jitter. The live-floor dashboard is read-only until production authentication and command authorization are implemented.
