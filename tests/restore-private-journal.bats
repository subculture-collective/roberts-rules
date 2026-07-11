#!/usr/bin/env bats

setup() {
  export REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/.." && pwd)"
  export TEST_ROOT="$BATS_TEST_TMPDIR/case"
  export MOCK_BIN="$TEST_ROOT/bin"
  mkdir -p "$MOCK_BIN" "$TEST_ROOT/backups"
  printf 'private-journal-dump' >"$TEST_ROOT/backups/meeting-001.dump"
  (cd "$TEST_ROOT/backups" && if command -v sha256sum >/dev/null 2>&1; then sha256sum meeting-001.dump >meeting-001.sha256; else shasum -a 256 meeting-001.dump >meeting-001.sha256; fi)
  cat >"$MOCK_BIN/psql" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
case "$*" in
  *current_database*) printf '%s\n' "${MOCK_DATABASE_NAME:-restored_private}";;
  *pg_tables*) printf '%s\n' "${MOCK_TABLE_COUNT:-0}";;
  *) exit 2;;
esac
MOCK
  cat >"$MOCK_BIN/pg_restore" <<'MOCK'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >"${MOCK_RESTORE_ARGS:?}"
MOCK
  chmod +x "$MOCK_BIN/psql" "$MOCK_BIN/pg_restore"
}

@test "restore requires exact database-name confirmation" {
  run env TARGET_DATABASE_URL='postgres://operator:secret@db/restored_private' RESTORE_DATABASE_NAME='restored_private' CONFIRM_RESTORE_DATABASE='wrong' PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/restore-private-journal.sh" "$TEST_ROOT/backups/meeting-001.dump" "$TEST_ROOT/backups/meeting-001.sha256"
  [ "$status" -ne 0 ]
  [[ "$output" == *"confirmation does not match"* ]]
}

@test "restore refuses a non-empty target" {
  run env TARGET_DATABASE_URL='postgres://operator:secret@db/restored_private' RESTORE_DATABASE_NAME='restored_private' CONFIRM_RESTORE_DATABASE='restored_private' MOCK_TABLE_COUNT=1 PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/restore-private-journal.sh" "$TEST_ROOT/backups/meeting-001.dump" "$TEST_ROOT/backups/meeting-001.sha256"
  [ "$status" -ne 0 ]
  [[ "$output" == *"target database is not empty"* ]]
}

@test "restore refuses a dump that does not match its checksum" {
  printf 'tampered' >>"$TEST_ROOT/backups/meeting-001.dump"
  run env TARGET_DATABASE_URL='postgres://operator:secret@db/restored_private' RESTORE_DATABASE_NAME='restored_private' CONFIRM_RESTORE_DATABASE='restored_private' PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/restore-private-journal.sh" "$TEST_ROOT/backups/meeting-001.dump" "$TEST_ROOT/backups/meeting-001.sha256"
  [ "$status" -ne 0 ]
  [[ "$output" == *"checksum verification failed"* ]]
}

@test "restore validates and uses a single transaction" {
  export MOCK_RESTORE_ARGS="$TEST_ROOT/restore.args"
  run env TARGET_DATABASE_URL='postgres://operator:secret@db/restored_private' RESTORE_DATABASE_NAME='restored_private' CONFIRM_RESTORE_DATABASE='restored_private' MOCK_RESTORE_ARGS="$MOCK_RESTORE_ARGS" PATH="$MOCK_BIN:$PATH" "$REPO_ROOT/scripts/restore-private-journal.sh" "$TEST_ROOT/backups/meeting-001.dump" "$TEST_ROOT/backups/meeting-001.sha256"
  [ "$status" -eq 0 ]
  grep -q -- '--single-transaction' "$MOCK_RESTORE_ARGS"
  grep -q -- '--exit-on-error' "$MOCK_RESTORE_ARGS"
  grep -q -- '--no-owner' "$MOCK_RESTORE_ARGS"
}
