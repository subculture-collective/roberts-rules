#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/lib/private-journal-backup.sh"

[[ $# -eq 2 ]] || die 'usage: restore-private-journal.sh DUMP MANIFEST'
require_env TARGET_DATABASE_URL
require_env RESTORE_DATABASE_NAME
require_env CONFIRM_RESTORE_DATABASE
require_command psql
require_command pg_restore

dump=$1
manifest=$2
[[ -f $dump ]] || die "dump does not exist: $dump"
[[ -f $manifest ]] || die "manifest does not exist: $manifest"
[[ $CONFIRM_RESTORE_DATABASE == "$RESTORE_DATABASE_NAME" ]] || die 'database confirmation does not match RESTORE_DATABASE_NAME'
sha256_verify "$manifest" || die 'backup checksum verification failed'

actual_database=$(psql "$TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command='SELECT current_database()')
[[ $actual_database == "$RESTORE_DATABASE_NAME" ]] || die "target URL resolves to database $actual_database, not $RESTORE_DATABASE_NAME"
table_count=$(psql "$TARGET_DATABASE_URL" --no-psqlrc --tuples-only --no-align --command="SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')")
[[ $table_count == 0 ]] || die 'target database is not empty'

pg_restore --dbname="$TARGET_DATABASE_URL" --single-transaction --exit-on-error --no-owner --no-privileges "$dump"
printf 'restored_database=%s\n' "$RESTORE_DATABASE_NAME"
