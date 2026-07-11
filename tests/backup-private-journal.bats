#!/usr/bin/env bats

setup() {
  export REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  export TEST_ROOT="$BATS_TEST_TMPDIR/case"
  export MOCK_BIN="$TEST_ROOT/bin"
  mkdir -p "$MOCK_BIN" "$TEST_ROOT/backups"
  cat >"$MOCK_BIN/pg_dump" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
for argument in "$@"; do
  case "$argument" in --file=*) output=${argument#--file=};; esac
done
printf 'private-journal-dump' >"${output:?missing --file}"
MOCK
  chmod +x "$MOCK_BIN/pg_dump"
}

@test "backup requires DATABASE_URL" {
  run env -u DATABASE_URL PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/backup-private-journal.sh" "$TEST_ROOT/backups"
  [ "$status" -ne 0 ]
  [[ "$output" == *"DATABASE_URL is required"* ]]
}

@test "backup creates a private dump and checksum manifest" {
  run env DATABASE_URL='postgres://operator:secret@db/private' BACKUP_ID='meeting-001' PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/backup-private-journal.sh" "$TEST_ROOT/backups"
  [ "$status" -eq 0 ]
  [ -f "$TEST_ROOT/backups/meeting-001.dump" ]
  [ -f "$TEST_ROOT/backups/meeting-001.sha256" ]
  permissions=$(portable_permissions "$TEST_ROOT/backups/meeting-001.dump")
  [ "$permissions" = '600' ]
  (cd "$TEST_ROOT/backups" && verify_checksum meeting-001.sha256)
}

@test "backup refuses to overwrite an existing artifact" {
  env DATABASE_URL='postgres://operator:secret@db/private' BACKUP_ID='meeting-001' PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/backup-private-journal.sh" "$TEST_ROOT/backups"
  run env DATABASE_URL='postgres://operator:secret@db/private' BACKUP_ID='meeting-001' PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/backup-private-journal.sh" "$TEST_ROOT/backups"
  [ "$status" -ne 0 ]
  [[ "$output" == *"refusing to overwrite"* ]]
}

portable_permissions() {
  if [[ $(uname -s) == Darwin ]]; then stat -f '%Lp' "$1"; else stat -c '%a' "$1"; fi
}

verify_checksum() {
  if command -v sha256sum >/dev/null 2>&1; then sha256sum --check "$1"; else shasum -a 256 --check "$1"; fi
}
