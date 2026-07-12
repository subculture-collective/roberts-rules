# Event Stream: 1,500 Authenticated Clients

## Result

On 2026-07-11 America/Chicago, commit `0314256` successfully served 1,500 simultaneous authenticated WebSocket clients through the real API and PostgreSQL session boundary. All 1,500 received a ready frame, remained connected through a 35-second hold spanning the 30-second heartbeat, and 150/150 jittered reconnects succeeded.

This is a measured development-host result, not a production appliance certification or service-level guarantee. The run used one API process and one Docker PostgreSQL instance without primary/standby synchronous replication, TLS, a reverse proxy, or WAN gateway. It proves the harness and this host crossed the roadmap's 1,500-client event-stream target; production sizing still requires the same profile on the final appliance and durability topology.

## Host and configuration

| Item | Measured value |
| --- | --- |
| Host | Apple M3, 16 GiB RAM |
| OS | macOS 26.5.2, Darwin 25.5.0 arm64 |
| Node / pnpm | Node 24.15.0 / pnpm 10.33.0 |
| PostgreSQL | 17.10, official Docker image |
| Open-file limit | 1,048,575 |
| Source | `0314256`, clean tracked worktree before measurement |
| API | One development `tsx` process, port 18080, default `pg` pool (10 clients), writable-primary readiness enabled |
| Database | One local Docker PostgreSQL; no replication; development durability profile |
| Authority path | Direct LAN-local API → PostgreSQL; no WAN gateway |
| Fixture | One zero-event meeting; 1,500 distinct observer sessions; only SHA-256 token hashes stored |

## Primary profile

Configuration: 1,500 clients, 10-second ramp, 35-second hold, 10% reconnect, 10-second per-connection timeout, cursor `after=0`.

| Metric | Result |
| --- | ---: |
| Initial ready | 1,500 / 1,500 |
| Initial failures | 0 |
| Ready latency p50 / p95 / p99 / max | 3 / 7 / 15 / 43 ms |
| Reconnect ready | 150 / 150 |
| Reconnect failures | 0 |
| Reconnect latency p50 / p95 / p99 / max | 6 / 12 / 46 / 53 ms |
| Harness peak RSS | 103,694,336 bytes (98.9 MiB) |
| API observed peak RSS | 204,032 KiB (199.3 MiB) |
| API observed peak CPU | 13.6% |
| PostgreSQL observed peak memory | 42.18 MiB |
| PostgreSQL observed peak CPU | 17.94% |
| PostgreSQL client-process count | baseline 7, observed peak 16 in a repeated 1,500-client sampling run |

Raw canonical result: [2026-07-11-event-stream-1500.json](results/2026-07-11-event-stream-1500.json), SHA-256 `bd5f21c58afbcfdbf375c971fb7e7c555bc8f8eae74fbe63a39201f6530a5980`.

Resource metrics were sampled approximately every three seconds using `ps` and `docker stats`; CPU values are point samples, not integrated utilization. Database connection count was sampled every 0.5 seconds in a repeated 1,500-client run, which also completed without failures.

## Failure and boundary profiles

### Invalid sessions

Ten invalid session cookies produced ten HTTP 401 upgrade rejections, zero ready frames, and a nonzero harness exit. This confirms authentication work remains in the measured path. [Raw result](results/2026-07-11-event-stream-invalid-sessions.json).

### Full reconnect storm

After 1,500 successful initial connections, all 1,500 were closed and jitter-reconnected across five seconds. All reconnects succeeded; reconnect p95 was 4 ms and p99 was 7 ms. The one-second hold does not exercise heartbeat behavior; the primary profile covers heartbeat. [Raw result](results/2026-07-11-event-stream-reconnect-storm.json).

### API interruption

The API process was terminated after 100 clients connected. All 100 observed abnormal close code 1006; all ten configured reconnect attempts failed with socket errors while the API remained down; the harness exited nonzero. This is expected detection behavior. Client-side production reconnect must use jitter/backoff and resume from the last applied aggregate version after readiness returns. [Raw result](results/2026-07-11-event-stream-api-interruption.json).

### Slow consumers and replay volume

This run used a zero-event meeting, so it did not produce enough outbound data to force the server's 256 KiB slow-consumer backpressure close. Existing integration tests cover ordered replay and server-only frames, but a production appliance test still needs a large-event fixture and a deliberately paused TCP reader to measure close code 1013 under real kernel buffers. The 1,500-client success must not be generalized to high-throughput replay or large events until that profile is measured.

## Observed limit and caveats

The measured lower bound on this host is 1,500 idle/reconnecting authenticated clients; no connection ceiling was sought above the roadmap target. The run does not establish command throughput, large-journal replay throughput, synchronous-replication latency, TLS/proxy overhead, multi-meeting distribution, browser memory, packet loss behavior, failover RTO, or a production hardware minimum.

The final appliance acceptance run must repeat the committed harness with:

- the production Node build rather than `tsx`;
- TLS and the production LAN proxy/virtual IP;
- the selected synchronous replication mode and standby monitoring;
- realistic event history and broadcast traffic;
- API/DB metrics from a monotonic metrics collector;
- a paused-reader backpressure profile;
- promotion/reconnect and restored-backup scenarios.

No WAN component is required or present in any result above.
