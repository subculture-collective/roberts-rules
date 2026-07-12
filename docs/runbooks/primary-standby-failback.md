# Primary/Standby Failback

## Purpose

Return the repaired former primary as a standby of the current primary. Failback never moves authority merely to restore the old hostname and never merges divergent writes.

## Preconditions

- The promoted primary is healthy, writable, backed up, and remains the sole authority.
- The former primary is fenced from all client and replication traffic and PostgreSQL can be stopped cleanly before its data directory is changed.
- `CURRENT_PRIMARY_URL`, `FORMER_PRIMARY_PGDATA`, replication credentials, WAL archive, and appliance configuration are available.
- Data checksums or `wal_log_hints=on` and the required WAL are available if `pg_rewind` is considered.

## 1. Preserve and assess

1. Take a verified backup of the current primary using the private-journal backup runbook.
2. Capture current-primary timeline, WAL LSN, meeting versions, and canonical replay digests.
3. Preserve the failed appliance data directory or storage snapshot until incident review authorizes deletion.
4. Decide between a fresh `pg_basebackup` rebuild (default) and `pg_rewind` (only when prerequisites and WAL coverage are proven).

If `pg_rewind` fails, PostgreSQL warns that the target directory may not be recoverable. Discard that attempted target and perform a fresh base backup.

## 2. Rebuild the standby

Preferred fresh rebuild on the fenced former-primary host:

```bash
pg_ctl -D "$FORMER_PRIMARY_PGDATA" stop -m fast -w
mv "$FORMER_PRIMARY_PGDATA" "$FORMER_PRIMARY_PGDATA.abandoned.$(date -u +%Y%m%dT%H%M%SZ)"
install -d -m 0700 -o postgres -g postgres "$FORMER_PRIMARY_PGDATA"
pg_basebackup --dbname="$REPLICATION_URL" --pgdata="$FORMER_PRIMARY_PGDATA" --format=plain --wal-method=stream --checkpoint=fast --write-recovery-conf --progress
```

`REPLICATION_URL` must point to the current primary and use a least-privilege replication role. Restore appliance-local TLS paths and configuration after reviewing files copied from the primary.

Conditional rewind path:

```bash
pg_rewind --target-pgdata="$FORMER_PRIMARY_PGDATA" --source-server="$REWIND_SOURCE_URL" --write-recovery-conf --restore-target-wal --progress
```

Use rewind only after a successful dry run where supported, a clean target shutdown, checksum/`wal_log_hints` confirmation, and WAL-archive verification. Never use `--no-sync` in production.

## 3. Start and verify recovery

```bash
pg_ctl -D "$FORMER_PRIMARY_PGDATA" start -w -t 60
psql "$FORMER_STANDBY_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --command="
SELECT pg_is_in_recovery(), pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn();"
```

Expected: `pg_is_in_recovery = t`. On the current primary:

```bash
psql "$CURRENT_PRIMARY_URL" --no-psqlrc --set=ON_ERROR_STOP=1 --command="
SELECT application_name, state, sync_state, sent_lsn, write_lsn, flush_lsn, replay_lsn
FROM pg_stat_replication ORDER BY application_name;"
```

Expected: one row for the rebuilt standby with `state = streaming`. Wait for replay to reach the current-primary LSN and confirm the configured synchronous state before changing durability mode.

The standby API `/health` may succeed, but `/ready` must return 503 because PostgreSQL remains in recovery/read-only mode.

## 4. Re-arm resilience

1. Re-enable the approved replication slot/WAL-retention alerting.
2. Run a controlled write on the current primary and prove its LSN reaches and replays on the standby.
3. Confirm canonical journal digests after temporarily pausing writes and comparing source with a read-only standby query environment.
4. Run the failover rehearsal checklist without promotion.
5. Remove degraded-mode warnings only after both operators approve synchronous replication evidence.

Do not switch authority back. A planned switchover is a separate change using the failover safety gates: freeze, catch up, fence, promote, verify, and reopen.

## Cleanup

Retain the abandoned data directory only under the incident/legal-hold policy. Securely expire it and any storage snapshots after approval. Record build/config digests, base-backup or rewind result, replay catch-up time, and restored durability mode without copying private meeting content.

## References

- [PostgreSQL 17 `pg_rewind`](https://www.postgresql.org/docs/17/app-pgrewind.html)
- [PostgreSQL 17 hot standby](https://www.postgresql.org/docs/17/hot-standby.html)
- [PostgreSQL 17 replication monitoring](https://www.postgresql.org/docs/17/monitoring-stats.html)
