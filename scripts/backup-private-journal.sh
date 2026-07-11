#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
source "$SCRIPT_DIR/lib/private-journal-backup.sh"

[[ $# -eq 1 ]] || die 'usage: backup-private-journal.sh OUTPUT_DIRECTORY'
require_env DATABASE_URL
require_command pg_dump

output_directory=$1
backup_id=${BACKUP_ID:-$(date -u +'%Y%m%dT%H%M%SZ')}
[[ $backup_id =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || die 'BACKUP_ID contains unsafe characters'
mkdir -p "$output_directory"
dump="$output_directory/$backup_id.dump"
manifest="$output_directory/$backup_id.sha256"
[[ ! -e $dump && ! -e $manifest ]] || die "refusing to overwrite backup artifact $backup_id"

temporary_dump="$dump.partial.$$"
temporary_manifest="$manifest.partial.$$"
cleanup() { rm -f "$temporary_dump" "$temporary_manifest"; }
trap cleanup EXIT INT TERM

pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$temporary_dump"
chmod 600 "$temporary_dump"
sha256_write "$temporary_dump" "$temporary_manifest" "$(basename "$dump")"
chmod 600 "$temporary_manifest"
mv "$temporary_dump" "$dump"
mv "$temporary_manifest" "$manifest"
trap - EXIT INT TERM
printf 'backup=%s\nmanifest=%s\n' "$dump" "$manifest"
