# Roberts Rules

Roberts Rules is software for chair-led parliamentary meetings: motions,
debate, points of order, the speaking queue and votes, run from a shared live
view. It is meant for organizations that hold formal meetings under their own
rules of procedure.

It is early-stage. Meetings run as a deterministic simulation, and votes are
not secret, binding or production-ready. Do not use it for a real decision.

The project models procedure in original code and organization-specific rule
profiles. It does not bundle or reproduce prose from *Robert's Rules of Order*.

## Features

- **Meeting simulator.** Versioned commands produce an append-only meeting
  journal that can be replayed to the same result. Sample transcripts are in
  `packages/meeting-domain/fixtures/`.
- **Meeting lifecycle:** open, recess, resume and adjourn; check-in and
  check-out, alternates and quorum; agenda adoption and advance.
- **Floor procedure:** a recognition queue, motions (second, amend, withdraw,
  table, dispose), debate with deadlines, points of order, rulings, appeals and
  chair corrections.
- **Voting:** counted, roll-call, weighted, plurality and ranked-choice votes.
  All voting is non-secret; there is no secret ballot.
- **Roles:** administrator, chair, parliamentarian, secretary, teller,
  delegate, alternate, participant, observer and technical operator, each with
  its own controls.
- **Private API** with a PostgreSQL journal, idempotent commands, strict
  command validation and access denied by default.
- **Live floor.** The web app follows the meeting over a resumable WebSocket
  event stream and reloads the full snapshot after a gap.
- **Enrollment tokens.** An operator issues a short-lived, single-use token for
  one participant and role. Redeeming it creates a 30-minute, revocable,
  meeting-scoped session cookie.
- **Public records (experimental).** AT Protocol lexicons for organization
  identity, rule profiles, meeting manifests and approved aggregate outcomes.
  Rosters, attendance, credentials, deliberation, participation and ballots
  stay private.
- **Backup and restore** scripts for the private journal.

## Quick start

You need Node.js 22 or later, pnpm and Docker with Compose.

```sh
make verify       # install, build, format, lint, tests and Compose checks
make dev          # PostgreSQL, API and web app; open http://localhost:5173
```

In a second terminal, create a disposable meeting:

```sh
make dev-fixture
```

It prints a meeting URL and single-use enrollment tokens for chair, secretary,
delegate and observer. Open the URL and paste one token into the form. Tokens
expire after 15 minutes. Treat them as credentials: keep them out of URLs,
screenshots and committed files.

`make dev-db`, `make dev-api` and `make dev-web` start the parts separately.
The development database uses host port `55433`; change it with
`make dev DEV_POSTGRES_PORT=65432`. `make dev-down` stops the stack and keeps
the database volume. `make help` lists every target.

Browser tests run on Chromium, Firefox, WebKit and mobile Safari emulation:

```sh
pnpm test:e2e:install
pnpm test:e2e
```

Replay a transcript through the simulator:

```sh
pnpm --silent --filter @subculture/roberts-rules-meeting-domain replay packages/meeting-domain/fixtures/completed-meeting.jsonl
```

Issue an enrollment token against a database:

```sh
DATABASE_URL='postgres://…' pnpm --filter @subculture/roberts-rules-api enrollment:issue -- --meeting <uuid> --participant <private-id> --role delegate --ttl 10
```

## Configuration

- `DATABASE_URL`: PostgreSQL connection for the API
- `APP_ORIGIN`: public origin of the web app
- `.env.example`: `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PORT` for the local
  database in `docker-compose.yml`
- `deploy/staging.env.example`: `POSTGRES_*`, `APP_ORIGIN`, `COOKIE_SECURE`,
  `PUBLISH_ADDRESS`, `WEB_PORT` and `IMAGE_TAG` for the packaged stack

## Deploy

`deploy/compose.staging.yml` runs the packaged stack: PostgreSQL, the API
image (`deploy/api.Dockerfile`) and the web image (`deploy/web.Dockerfile`,
served by nginx). Only the web port is published. Copy
`deploy/staging.env.example`, fill it in, then:

```sh
make pilot-config   # validate the Compose file
make pilot-build    # build the images
make pilot-up       # start or update the stack
make pilot-smoke    # check health, readiness and security headers
```

`make pilot-backup` and `make pilot-restore-test` back up the journal and test
a restore. This stack is for testing with generated meetings, not real meeting
data.

## Project layout

- `packages/meeting-domain`: the meeting simulator (commands, events, replay)
- `packages/meeting-publication`, `packages/atproto-publication`: public record
  schemas and the publication boundary
- `backend/`: private API, event stream, sessions and operator commands
- `web/`: React live-floor app (Vite)
- `lexicons/`: AT Protocol lexicons
- `migrations/`: database migrations
- `tests/`: Playwright browser tests and backup script tests
- `deploy/`, `scripts/`: packaging, Compose and backup scripts
- `docs/`: design records, plans and security notes

## Contributing

Report bugs and request features in
[GitHub issues](https://github.com/subculture-collective/roberts-rules/issues).
Ask questions and share ideas in
[GitHub Discussions](https://github.com/subculture-collective/roberts-rules/discussions).
For security problems, see [SECURITY.md](SECURITY.md).

Send code as a pull request on GitHub against `main`. CI runs `make verify`
(build, format, lint, unit tests, backup tests and Compose checks) on every
pull request. [CONTRIBUTING.md](CONTRIBUTING.md) has the commit style and
project boundaries.

## License

AGPL-3.0-only. See [LICENSE](LICENSE).

Built by [SUBCULT](https://subcult.tv).
