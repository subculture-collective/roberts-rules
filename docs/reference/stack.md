# Stack Reference

Roberts Rules is a pnpm TypeScript workspace requiring Node.js 22 or newer, with a Node API, Vite React frontend, PostgreSQL, Docker Compose, Vitest, and Open Pilot conventions. The meeting-domain simulator remains authoritative. `meeting-publication` owns pure public projections and approval/outbox state; `atproto-publication` owns the repository adapter.

AT Protocol schemas live in `lexicons/`. Run `pnpm lexicons:build` after changing them and commit the reproducible generated TypeScript in `packages/meeting-publication/src/generated/`. Production PDS access is not part of the default verification gate.

The canonical verification command is:

```bash
make verify
```
