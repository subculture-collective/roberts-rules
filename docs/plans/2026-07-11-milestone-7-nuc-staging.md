# Milestone 7: NUC Staging Pilot

> **For agentic workers:** Keep the public/private authority boundary intact. Never print, persist, or attach enrollment credentials to test artifacts.

**Goal:** Operate a disposable, internet-reachable staging pilot on the NUC while Almaz remains the only ingress host.

**Architecture:** PostgreSQL and the Node API live only on an internal Compose network. An unprivileged Nginx container is the sole published service at `10.0.0.56:3042`; the NUC firewall admits that port only from Almaz. Almaz Caddy forwards the existing Cloudflare Tunnel hostname to that origin. The meeting journal remains authoritative on the NUC.

## Completed slices

- [x] Build root-context, digest-pinned API and web images with non-root runtime users, read-only filesystems, dropped capabilities, health checks, resource limits, and bounded logs.
- [x] Add an explicit staging Compose profile, private environment template, smoke checks, fixture commands, backup/restore rehearsal, and volume-preserving shutdown.
- [x] Deploy a randomly credentialed private environment under `/srv/server/projects/roberts-rules-staging`; expose only `10.0.0.56:3042` and add it to the NUC edge-only firewall policy.
- [x] Add `meetings-staging.subcult.tv` to Almaz Caddy behind the existing wildcard Cloudflare Tunnel without adding a second authentication layer that would break meeting-scoped WebSockets.
- [x] Prove direct LAN access from a non-edge host times out while Almaz and the public HTTPS route reach both liveness and readiness.
- [x] Create a mode-`0600` private-journal dump and checksum, restore it into a fixed disposable database, compare authority counts, and remove the rehearsal database.
- [x] Redeem a real secure-cookie session through the public edge, fully recreate all three application containers without deleting the volume, and prove that the same scoped session remains valid afterward.
- [x] Run public authenticated chair/delegate/observer synchronization across Chromium, Firefox, WebKit, and mobile Safari. Disable traces, screenshots, and videos for credential-bearing suites; prove tokens stay out of URLs, storage, and console output.
- [x] Add HSTS, cross-origin opener/resource policies, and `Cache-Control: no-store` for private API JSON.

## Current deployed evidence

- Host: NUC application authority with Almaz ingress.
- Public staging URL: `https://meetings-staging.subcult.tv`.
- Deployed application revision: `ffe342d`.
- Public smoke: liveness, writable-primary readiness, CSP, HSTS, cross-origin policies, nosniff, and API no-store passed.
- Browser gate: four of four projects passed after the hardened deployment.
- Database scope after tests: zero disposable meetings remained.
- Production dependency audit: no known vulnerabilities; the complete repository verification gate passed.

## Remaining release gates

- An operator must add `https://meetings-staging.subcult.tv/ready` to Uptime Kuma through its authenticated application UI. Direct mutation of the live Kuma SQLite database is prohibited.
- Container CVE scanning requires an authenticated scanner installation or Docker Scout login; base images remain digest-pinned until that scan and review are recorded.
- Backup retention duration and accountable data owner need organizational approval before real meeting data is permitted.
- The final primary/standby hardware must pass replication, fencing, failover/failback, large-replay, and 1,500-client tests in its reviewed topology.
- Secret-ballot implementation remains prohibited by Milestone 4B. Every current vote is non-secret, simulation-only, and non-binding.
