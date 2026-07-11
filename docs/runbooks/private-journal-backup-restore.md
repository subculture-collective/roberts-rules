# Private Journal Backup and Restore

## Purpose

Create an integrity-checked PostgreSQL custom-format backup of the private meeting authority and restore it into a separately named empty database. Replication is not a backup; use this procedure in addition to the primary/standby topology.

This procedure backs up the application database. It must never contain future secret-ballot guardian keys, ballot nonces, plaintext selections, or identity-to-ciphertext mappings prohibited by ADR 0007.

## Preconditions

- PostgreSQL 17 client tools compatible with the server: `pg_dump`, `pg_restore`, and `psql`.
- An operator account allowed to read the source and create/restore the target.
- An encrypted destination volume with enough free space for the dump, checksum, and retention window.
- A private shell/session. Database URLs are secrets; do not paste them into tickets, chat, or shared terminal recordings.
- `pnpm install` completed so `make backup-test` can run Bats.

## Verify the tooling

```bash
make backup-test
```

Expected: every Bats case passes, including restrictive permissions, overwrite refusal, checksum rejection, empty-target enforcement, and single-transaction restore.

## Create a backup

```bash
export DATABASE_URL='postgres://BACKUP_USER:REDACTED@PRIMARY_HOST:5432/roberts_rules?sslmode=require'
export BACKUP_ID="private-journal-$(date -u +%Y%m%dT%H%M%SZ)"
scripts/backup-private-journal.sh /encrypted/backups/roberts-rules
unset DATABASE_URL
```

Expected output names one `.dump` and one `.sha256` file. Both are created with mode `0600`; the script refuses to overwrite either final path and removes partial files after failure.

Verify independently from the destination directory:

```bash
cd /encrypted/backups/roberts-rules
sha256sum --check "$BACKUP_ID.sha256"
```

On macOS use `shasum -a 256 --check`. Expected: the dump reports `OK`.

Record only the backup ID, checksum, storage class, encryption-key reference, creation time, operator, and retention/deletion date in the operations log. Do not attach the dump.

## Restore into an empty database

Create a new database. Never point this procedure at the active primary database.

```bash
createdb --maintenance-db="$ADMIN_DATABASE_URL" restored_private_journal
export TARGET_DATABASE_URL='postgres://RESTORE_USER:REDACTED@RESTORE_HOST:5432/restored_private_journal?sslmode=require'
export RESTORE_DATABASE_NAME='restored_private_journal'
export CONFIRM_RESTORE_DATABASE='restored_private_journal'
scripts/restore-private-journal.sh \
  "/encrypted/backups/roberts-rules/$BACKUP_ID.dump" \
  "/encrypted/backups/roberts-rules/$BACKUP_ID.sha256"
unset TARGET_DATABASE_URL RESTORE_DATABASE_NAME CONFIRM_RESTORE_DATABASE
```

The script verifies the checksum, asks PostgreSQL for the actual target database name, refuses a target containing user tables, and runs `pg_restore` with `--single-transaction --exit-on-error --no-owner --no-privileges`.

## Verify canonical replay

Generate replay digests from the source and restored journal. This reconstructs each meeting state through the domain reducer and hashes canonical state; it does not merely compare row counts.

```bash
DATABASE_URL="$SOURCE_DATABASE_URL" pnpm --filter @subculture/roberts-rules-api journal:digest >source-digests.json
DATABASE_URL="$RESTORED_DATABASE_URL" pnpm --filter @subculture/roberts-rules-api journal:digest >restored-digests.json
diff -u source-digests.json restored-digests.json
```

Expected: `diff` exits `0` with no output. Then verify migrations, meeting count, aggregate versions, session revocation behavior, and a read-only snapshot against the restored environment before declaring the backup usable.

## Abort and cleanup

Abort if the checksum fails, the actual database name differs, the target is not empty, `pg_restore` reports any error, or replay digests differ. Preserve logs without URLs or private content, quarantine the suspect dump, and create a new restore target for another attempt.

After a successful rehearsal:

```bash
dropdb --maintenance-db="$ADMIN_DATABASE_URL" restored_private_journal
rm -f source-digests.json restored-digests.json
```

Do not delete the source backup until its approved retention/deletion date or replace a known-good backup solely because one rehearsal failed.
