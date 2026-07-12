# Authenticated Event-Stream Load Test

## Safety and prerequisites

Use only a disposable PostgreSQL database and non-production meeting UUID. The fixture command deletes/recreates the confirmed meeting and its cascading sessions. It refuses a meeting containing journal events, but that is not permission to point it at production.

Required: Node 22+, pnpm, PostgreSQL 17, API build, high open-file limit, and an absolute private session-file path. The session file contains live bearer tokens; keep mode `0600` and delete it after the run.

## Prepare

```bash
export TEST_DATABASE_URL='postgres://roberts_rules:change-me@127.0.0.1:55432/roberts_rules?sslmode=disable'
export LOAD_MEETING_ID='00000000-0000-4000-8000-000000001500'
export LOAD_SESSION_FILE='/tmp/rr-load-sessions.jsonl'
export LOAD_SESSION_COUNT=1500
export CONFIRM_LOAD_FIXTURE="$LOAD_MEETING_ID"
pnpm --filter @subculture/roberts-rules-api load:fixture
```

Expected: JSON reports the meeting ID, 1,500 sessions, and file path. Verify `stat` reports mode `0600`.

Start the real API against the same database with `APP_ORIGIN` matching the load origin. Confirm `/ready` returns 200.

## Run the target profile

```bash
export LOAD_WS_URL="ws://127.0.0.1:18080/api/meetings/$LOAD_MEETING_ID/events?after=0"
export LOAD_ORIGIN='http://localhost:5173'
export LOAD_CONNECTIONS=1500
export LOAD_RAMP_MS=10000
export LOAD_HOLD_MS=35000
export LOAD_RECONNECT_PERCENT=10
export LOAD_TIMEOUT_MS=10000
pnpm --silent --filter @subculture/roberts-rules-api load:events >event-stream-result.json
```

Success requires process exit 0, initial/reconnect failures 0, empty failure codes, and the hold exceeding the 30-second server heartbeat. Hash and retain the canonical JSON with host/configuration metadata; never retain the token file.

## Reconnect storm

Repeat with `LOAD_RECONNECT_PERCENT=100`, a controlled reconnect ramp, and a shorter post-connect hold. This tests authentication and meeting lookup on every reconnect; it does not replace the heartbeat profile.

## Invalid credentials

Use a separate file of invalid test tokens. Expected: HTTP 401 counts equal the target, zero ready frames, and nonzero exit status. Never use real expired/revoked participant tokens as load fixtures.

## Interruption

Run a small profile, stop the API after clients become ready, and keep PostgreSQL running. Expected: abnormal closes are recorded and reconnects fail until the API returns. Restart, then run a fresh profile with the same cursors to prove recovery. Do not kill a production process for this test.

## Resource capture

Record source commit/dirty state, OS/kernel, CPU/RAM, Node/pnpm/PostgreSQL versions, `ulimit -n`, API/proxy/database configuration, replication mode, command lines, API and harness RSS/CPU, PostgreSQL CPU/memory/client count, result digest, and timestamps. State sampling intervals and distinguish instantaneous from integrated CPU.

## Cleanup

```bash
rm -f "$LOAD_SESSION_FILE"
unset TEST_DATABASE_URL LOAD_MEETING_ID LOAD_SESSION_FILE LOAD_SESSION_COUNT CONFIRM_LOAD_FIXTURE
unset LOAD_WS_URL LOAD_ORIGIN LOAD_CONNECTIONS LOAD_RAMP_MS LOAD_HOLD_MS LOAD_RECONNECT_PERCENT LOAD_TIMEOUT_MS
```

Drop the disposable database or delete only the confirmed fixture meeting. Confirm raw bearer tokens, temporary results containing infrastructure addresses, and local resource logs are removed or moved into the approved evidence store.
