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

Start PostgreSQL, the API, and the Vite development server together, then open `http://localhost:5173`:

```bash
make dev
```

In a second terminal, create a disposable open meeting. The command prints its meeting URL and single-use chair, secretary, delegate, and observer enrollment tokens once:

```bash
make dev-fixture
```

Open the printed `meetingUrl`, paste one enrollment token into the form, and enter the live floor. Tokens are private credentials: do not put them in URLs, browser storage, screenshots, chat, or committed files. Each token expires after 15 minutes and can be redeemed only once.

Use `make dev-db`, `make dev-api`, and `make dev-web` when separate terminals are more useful for debugging. The development database defaults to host port `55433`; override it with `make dev DEV_POSTGRES_PORT=65432`. `make dev-status`, `make dev-logs`, and `make dev-down` inspect or stop the local stack; stopping it preserves the database volume. Run `make help` for the complete command list.

Install the Playwright browser runtimes once, then run the browser suite across Chromium, Firefox, WebKit, and mobile Safari emulation:

```bash
pnpm test:e2e:install
pnpm test:e2e
```

The same operations are available as `make test-e2e-install`, `make test-e2e`, and `make test-e2e-ui`.

Use `pnpm test:e2e:ui` for an interactive browser session. The suite covers the public landing page plus authenticated restoration, role boundaries, multi-client journal delivery, reconnect catch-up, logout revocation, token ephemerality, browser errors, and responsive overflow. These flows remain a non-secret procedural simulation; they are not binding, secure voting or a production deployment claim.

## Staging pilot

A disposable staging pilot is available at `https://meetings-staging.subcult.tv`. It runs on the NUC behind the Almaz/Cloudflare edge; PostgreSQL and the API are not published directly. It is suitable for operator validation with generated fixtures, not real meeting data or production voting.

Run the public smoke and authenticated browser matrix from a configured operator workstation:

```bash
STAGING_URL=https://meetings-staging.subcult.tv make pilot-smoke
STAGING_REMOTE_HOST=nuc make pilot-test-remote
```

See the [NUC staging runbook](docs/runbooks/nuc-staging.md) for exact-revision deployment, private backup/restore, restart recovery, and rollback. Enrollment tokens remain paste-only credentials and browser traces, screenshots, and videos are disabled in credential-bearing suites.

See the [implementation plan](docs/PLAN.md), [documentation index](docs/README.md), and [architecture decisions](docs/adr/README.md).

## Open Pilot

This repository preserves the Open Pilot issue and pull-request templates for focused, verifiable work.

## License

AGPL-3.0-only. See `LICENSE`.
