# Primary/Standby Failover

## Purpose

Promote the PostgreSQL 17 standby after a primary failure without creating two writable meeting authorities. This procedure implements ADR 0008. It is not automatic failover.

## Preconditions

- Two trained operators with access to the LAN traffic endpoint, both appliances, PostgreSQL administration, and the incident log.
- Approved fencing mechanism tested for both power and network isolation.
- `PRIMARY_ADMIN_URL`, `STANDBY_ADMIN_URL`, `STANDBY_PGDATA`, and the traffic-control command documented in the appliance-specific sealed runbook.
- A recent successful backup/restore rehearsal and known replication mode: `synchronous`, `degraded`, or `fail-closed`.
- Participant communication channel that does not depend on the failed appliance or optional WAN gateway.

Never promote until the old primary is fenced. If fencing cannot be proven, freeze commands and continue procedural contingency rather than risk split brain.

## 1. Declare and freeze

1. Open an incident record with UTC detection time, observers, meeting IDs, declared durability mode, and symptoms. Do not copy private journal content into it.
2. Remove the primary API from the LAN traffic endpoint or enable the command-maintenance response.
3. Announce that state-changing commands are frozen. Clients may retain their last applied aggregate version but must not retry through an unapproved endpoint.
4. Capture the last acknowledged command receipt/version available from operator telemetry and each affected chair/secretary client.

Success: new commands cannot reach either appliance. Abort promotion if authoritative traffic still reaches the old primary.

## 2. Fence the old primary

Use the approved out-of-band power or switch-port mechanism. Application shutdown alone is not fencing.

Verify from two independent locations:

```bash
pg_isready -d "$PRIMARY_ADMIN_URL"
```

Expected: connection rejected or no response. Also verify its API `/ready`, replication network, and virtual IP are unreachable. Record the fence mechanism, time, operator, and evidence digest.

If the primary remains reachable on any authority network, stop. Do not promote.

## 3. Assess standby state and loss window

On the standby:

```bash
psql "$STANDBY_ADMIN_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --command="
SELECT pg_is_in_recovery() AS in_recovery,
       pg_last_wal_receive_lsn() AS received_lsn,
       pg_last_wal_replay_lsn() AS replayed_lsn,
       pg_last_xact_replay_timestamp() AS last_replay_time;"
```

Expected before promotion: `in_recovery = t`. Wait until received and replayed LSN match if WAL is still arriving from an intentionally stopped primary. During an unplanned loss, record the last replayed LSN and replay time; do not claim zero loss unless synchronous-mode evidence proves the acknowledged commit was durable on this standby.

Capture meeting versions:

```bash
psql "$STANDBY_ADMIN_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --command='SELECT id, aggregate_version FROM meetings ORDER BY id;'
```

Compare them with the last acknowledged versions. Any lower standby version is a known potential-loss event requiring chair/secretary review after promotion.

## 4. Promote

Both operators sign the promotion checkpoint: traffic frozen, old primary fenced, standby in recovery, LSN/version evidence captured, and loss assessment recorded.

On the standby host as the PostgreSQL service account:

```bash
pg_ctl -D "$STANDBY_PGDATA" promote -w -t 60
```

Verify:

```bash
psql "$STANDBY_ADMIN_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --command="
SELECT pg_is_in_recovery() AS in_recovery,
       current_setting('transaction_read_only') AS transaction_read_only,
       pg_current_wal_lsn() AS current_lsn;"
```

Expected: `in_recovery = f` and `transaction_read_only = off`. If not, keep traffic frozen and investigate; never repeat promotion against an unknown state.

## 5. Verify application authority

Start or restart the API against the promoted database. Verify:

```bash
curl --fail --silent --show-error "$PROMOTED_API_URL/health"
curl --fail --silent --show-error "$PROMOTED_API_URL/ready"
DATABASE_URL="$PROMOTED_DATABASE_URL" pnpm --filter @subculture/roberts-rules-api journal:digest >promoted-digests.json
```

Expected: health is `{"status":"ok"}`, readiness is `{"status":"ready"}`, and every meeting replays without aggregate-version mismatch. The readiness query rejects a server still in recovery or read-only mode.

Check the latest event for each meeting against the captured version and ask chair/secretary operators to confirm the last acknowledged action. Record any accepted command missing from the promoted journal as potential data loss; do not reconstruct it silently.

## 6. Switch traffic and reopen

1. Move the LAN virtual IP/DNS/service route to the promoted appliance with the approved traffic command.
2. Verify the old primary remains fenced and the optional WAN gateway is not required.
3. Open WebSocket connections using known last-applied versions. Expected: clients receive a ready frame and replay events after their cursor; duplicates are tolerated.
4. Re-enable state-changing commands only after both operators, chair, and secretary approve the version/loss assessment.
5. Announce recovery time, confirmed journal version, degraded durability status, and any actions participants must repeat.

Success criteria:

- exactly one writable authority;
- `/ready` succeeds only on the promoted primary;
- canonical replay succeeds for every meeting;
- client projections converge after reconnect;
- acknowledged-version comparison is recorded;
- promotion time after fencing is measured against the under-five-minute target.

## Abort and rollback

There is no rollback to the old primary after promotion. If verification fails, keep commands frozen, preserve both data directories and logs, restore into a separate database if needed, and invoke meeting contingency procedures. Reintroduce the old appliance only through the failback runbook.

## References

- [PostgreSQL 17 high availability](https://www.postgresql.org/docs/17/high-availability.html)
- [PostgreSQL 17 `pg_ctl promote`](https://www.postgresql.org/docs/17/app-pg-ctl.html)
- [PostgreSQL 17 recovery status functions](https://www.postgresql.org/docs/17/functions-admin.html)
