# NUC Staging Runbook

This runbook operates the disposable staging pilot only. It does not authorize real rosters, binding votes, secret ballots, or a production availability claim.

## Topology and source of truth

- Checkout and private environment: `/srv/server/projects/roberts-rules-staging` on `nuc`.
- Compose project: `roberts-rules-staging`.
- Published origin: `10.0.0.56:3042`, admitted only from `almaz` by `nuc-docker-user-policy.service`.
- Public route: `https://meetings-staging.subcult.tv` through Cloudflare Tunnel and the Almaz Caddy configuration.
- PostgreSQL data: named Compose volume; neither routine shutdown nor rollback may use `down --volumes`.

## Deploy an exact revision

From a clean, verified local checkout:

```bash
CI=true make verify
git archive <commit> | ssh nuc 'cd /srv/server/projects/roberts-rules-staging && tar -xf -'
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && sed -i "s/^IMAGE_TAG=.*/IMAGE_TAG=<short-commit>/" deploy/staging.env && printf "%s\n" <short-commit> > REVISION && make pilot-build && make pilot-up'
STAGING_URL=https://meetings-staging.subcult.tv make pilot-smoke
STAGING_REMOTE_HOST=nuc make pilot-test-remote
```

Do not replace `deploy/staging.env`, print it, or place its values in command output. The browser gate creates unique meetings over SSH and deletes only those UUIDs.

## Inspect and operate

```bash
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-status'
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-logs'
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-down'
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-up'
```

Expected exposure is one NUC publish for `web`; `api` and `postgres` must show container ports only. A non-Almaz LAN host must not reach `http://10.0.0.56:3042`.

## Backup and restore rehearsal

```bash
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-backup BACKUP_ID=<unique-id> BACKUP_DIR=/srv/server/backups/roberts-rules-staging'
ssh nuc 'cd /srv/server/projects/roberts-rules-staging && make pilot-restore-test BACKUP_ID=<unique-id> BACKUP_DIR=/srv/server/backups/roberts-rules-staging'
```

Artifacts and their directory must remain mode `0600` and `0700` respectively. The rehearsal restores only into `roberts_rules_restore_rehearsal`, compares authority-table counts, and drops that database on exit.

## Roll back

1. Preserve the journal volume and private environment.
2. Set `IMAGE_TAG` in `deploy/staging.env` to the previous locally retained image tag.
3. Run `make pilot-up`; Compose recreates only changed services.
4. Run the public smoke and browser gates.
5. If ingress itself must be withdrawn, restore the timestamped pre-route Caddyfile on Almaz, validate it with `caddy validate`, and reload Caddy. Do not alter the Cloudflare wildcard route.

Never use `docker compose down --volumes`, truncate shared tables, or restore a backup over a non-empty target.

## Monitoring and escalation

The readiness monitor should request `https://meetings-staging.subcult.tv/ready` and require HTTP 200 with `{"status":"ready"}`. Add it through the authenticated Uptime Kuma UI; do not edit `kuma.db` directly. Until that operator action is complete, use `make pilot-smoke` before and after every deployment and inspect container health on NUC.

If `/health` succeeds but `/ready` fails, stop command traffic and investigate PostgreSQL writability or primary authority. If both fail, inspect NUC containers, the edge-only firewall, Almaz Caddy, and Cloudflare Tunnel in that order.
