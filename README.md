# Roberts Rules

Roberts Rules is an early-stage platform for chair-led parliamentary meetings. Its first deliverable is a deterministic TypeScript simulator: versioned commands produce an append-only, replayable meeting journal.

The project models original procedural behavior and organization-specific rules. It does not bundle or reproduce prose from *Robert's Rules of Order*.

Public organization identity, rule profiles, meeting manifests, and explicitly approved aggregate outcomes have experimental AT Protocol schemas and a fail-closed publication boundary. Rosters, attendance, credentials, deliberation, participation records, and ballots remain private by default. No production PDS integration or secure voting system exists yet, and the simulator must not be treated as binding or production-ready.

The private API now has a transactional PostgreSQL journal, durable command idempotency, strict command validation, and an authentication boundary that denies access by default.
The private API also provides an authenticated, resumable WebSocket event stream with at-least-once delivery. Meeting-scoped sessions and role-gated controls are implemented; hardware-backed device identity and production credential automation remain future security work.

The web application includes a live-floor projection client, role-aware dashboard, and authenticated command controls. It refreshes from the authoritative snapshot after event gaps, resumes from the last applied version, and shows an authentication-required boundary until a meeting-scoped session is redeemed.

Operators can issue a short-lived, single-use enrollment token directly against the private database. The raw token is printed once; only its hash is stored:

```bash
DATABASE_URL='postgres://…' pnpm --filter @subculture/roberts-rules-api enrollment:issue -- --meeting <uuid> --participant <private-id> --role delegate --ttl 10
```

Redeeming that token creates a 30-minute, revocable, meeting-scoped HttpOnly cookie used by both HTTP commands and WebSocket upgrades. This is not yet hardware-backed device authentication, and initial meeting creation remains an out-of-band operator bootstrap.

Authenticated live-floor controls now cover chair lifecycle actions, recognition queues, and non-secret simulator ballot choices. Commands wait for authoritative event delivery; stale-version responses trigger a full snapshot refresh rather than optimistic reconciliation.

The live-floor control set also covers attendance, agenda, motions, debate deadlines, points of order, appeals, and counted, roll-call, weighted, plurality, and ranked-choice administration. Voting remains explicitly non-secret, simulation-only, and not production-ready. Secret-ballot implementation is prohibited pending the independent security gate documented in Milestone 4B.

LAN operations now have primary/standby authority, backup/restore, failover/failback, and retention runbooks. An authenticated development-host load test served 1,500 simultaneous event-stream clients, but that measurement is not a reviewed production-appliance capacity claim.

## Quick start

```bash
make verify
```

Install the Playwright browser runtimes once, then run the browser suite across Chromium, Firefox, WebKit, and mobile Safari emulation:

```bash
pnpm test:e2e:install
pnpm test:e2e
```

Use `pnpm test:e2e:ui` for an interactive browser session. The initial suite covers the public landing page, authentication boundary, keyboard navigation, browser console errors, and responsive overflow. Authenticated multi-user live-floor coverage follows the application entry-point wiring.

See the [implementation plan](docs/PLAN.md), [documentation index](docs/README.md), and [architecture decisions](docs/adr/README.md).

## Open Pilot

This repository preserves the Open Pilot issue and pull-request templates for focused, verifiable work.

## License

AGPL-3.0-only. See `LICENSE`.
