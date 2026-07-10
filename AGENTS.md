# Agent Instructions

This repository is a TypeScript full-stack project with a Vite React frontend, Node backend, PostgreSQL, and Docker Compose. `docs/PLAN.md` is the canonical implementation roadmap.

Use Node.js 22 or newer. AT Protocol Lexicons live in `lexicons/`; regenerate committed types with `pnpm lexicons:build`. Never run the local PDS smoke command against a public host or with a non-disposable identity.

## Priorities

1. Execute one milestone at a time and keep every slice runnable and minimal.
2. Preserve Open Pilot issue and PR templates.
3. Keep generated caches, secrets, and local data out of git.
4. Update this file and `README.md` when stack conventions change.
5. Preserve the public/private authority boundary documented in the ADRs.

The simulator models original procedural behavior; do not copy or bundle prose from *Robert's Rules of Order*. Do not describe simulation-only voting as binding, secure, or production-ready.

## Verification

Run:

```bash
make verify
```

Use narrower commands only when an issue explicitly asks for a smaller check.
