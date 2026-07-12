# Private Audit Retention and Verified Deletion

## Purpose

Define who approves retention, what must remain replayable, how legal/incident holds work, and how deletion is verified across primary storage, replicas, logs, exports, and backups. This is a policy-execution runbook, not a universal retention schedule.

Each organization must approve durations before production use based on governance, labor/privacy obligations, applicable law, dispute windows, and meeting purpose. The application must not silently invent one policy for every organization.

## Data classes

| Class | Authority and sensitivity | Retention owner | Deletion trigger and evidence |
| --- | --- | --- | --- |
| Meeting journal (`meetings`, `meeting_events`) | Procedural source of truth; contains motions, attendance-derived events, deliberation, rulings, voter-keyed non-secret simulator ballots, and corrections | Secretary plus privacy/governance owner | End of approved audit/dispute window and no hold; canonical digest, deletion transaction ID, replica confirmation, backup-expiry schedule |
| Command decisions | Integrity and idempotency evidence; actor/command linkage and rejection detail may be sensitive | Service owner plus secretary | Same or shorter than parent meeting journal but never earlier when needed to prove accepted-command behavior; row counts/digest before deletion and verification query after |
| Sessions and enrollments | Credentials and identity/role linkage; high sensitivity, not permanent audit history | Security owner | Expiry/revocation plus short incident window; verify primary/standby removal and log redaction; enrollment plaintext tokens are never stored |
| Attendance and participation projections | Derived from journal but privacy-sensitive | Secretary/privacy owner | Projection may be deleted and rebuilt while journal is retained; deletion evidence identifies projection only, not authoritative events |
| Publication jobs/outbox | Approval and delivery audit; may link private approval workflow to public artifact | Publication owner | Public artifact retention plus operational retry/dispute window; retain idempotency key and approved digest as policy requires |
| Public AT Protocol artifacts | Deliberately public and portable; deletion may not remove third-party copies | Organization/publication owner | Governed by public-record policy and protocol capabilities; evidence distinguishes local deletion from network-wide erasure claims |
| Application/access/security logs, metrics, traces, crash dumps | Operational metadata can reveal identities, timing, meeting IDs, URLs, or ballot correlation | Security/operations owner | Shortest useful diagnostic/security window; verified expiry in every sink; private bodies, cookies, tokens, ballots, and database URLs are prohibited at collection |
| Database backups and storage snapshots | Full private authority copy; highest aggregate exposure | Backup custodian | Approved backup window, successful newer restore sample, no hold; cryptographic erasure/key-destruction evidence plus provider expiry confirmation |
| Failover incident artifacts | Versions, LSNs, timings, configuration, and evidence digests; must not include meeting content | Incident commander | Incident closure plus approved assurance window; ticket/artifact deletion confirmation |
| Future secret-ballot encrypted/public record | Governed by ADR 0007 and the ceremony document; not part of current implementation | Election record owner | Exact approved election-record policy; public/independent-verification requirements may mandate long retention |
| Future guardian secrets, nonces, plaintext selections, identity/ciphertext linkage | Prohibited from meeting journal, logs, backups, tickets, and ordinary support exports | Guardian/security owner | Guardian-controlled destruction ceremony where applicable; prohibited classes require incident response if discovered rather than routine retention |

## Establish a retention schedule

Before a production meeting, create a signed schedule containing:

- organization and policy version;
- data class and storage systems, including primary, standby, object store, monitoring, support exports, and operator workstations;
- duration or event-based trigger;
- accountable owner and deletion executor;
- dispute/legal/incident hold authority;
- backup expiry and encryption-key lifecycle;
- sampling frequency for restore and deletion verification;
- participant notice and approved exceptions.

Store the schedule and its digest outside the private journal if it contains infrastructure details. The rules profile may reference a public policy identifier but must not embed secrets or copied legal text.

## Place or release a hold

1. Record hold ID, scope, authority, start time, affected meetings/data classes, and review date without copying private content.
2. Suspend automated deletion only for the scoped material. Do not pause all privacy deletion because one meeting is held.
3. Propagate the hold to primary/standby, backups/snapshots, log archives, exports, and destruction queues.
4. Require two-person approval to release. Record release time and restart each original retention clock according to the approved policy.

## Execute deletion

1. Confirm the schedule version, trigger, approvals, absence/release of holds, and a known-good restore sample newer than any backup being expired.
2. Freeze affected export/publication jobs so deletion does not race with a new copy.
3. Capture evidence counts and content digests where safe; never export raw rows merely to prove deletion.
4. Delete or cryptographically erase primary data in a transaction scoped by immutable meeting/data-class identifiers.
5. Confirm standby replay of the deletion using WAL/replication positions.
6. Expire object versions, snapshots, local operator copies, temporary restore databases, generated digest files, logs, traces, and support exports.
7. Destroy or rotate encryption keys when cryptographic erasure is the approved control; verify no other retained data depends on that key.
8. Record deletion evidence: policy/hold IDs, query/tool version, affected counts, primary/standby confirmation, backup expiry dates, key/provider receipts, operators, reviewer, and exceptions.

## Verify deletion

Verification is a separate operator/reviewer action:

- query primary and standby for the scoped identifiers;
- search approved log/trace/export indexes for prohibited tokens and meeting identifiers without broadening access;
- list backup/snapshot/object versions and confirm expiry or hold state;
- sample a restoration from the oldest still-retained backup and prove deleted data is absent when its deletion should have reached that generation;
- confirm temporary databases and local digest/output files were removed;
- review public-artifact limitations separately and avoid claiming deletion from third-party AT Protocol repositories.

If any copy remains unexpectedly, stop signing completion, preserve evidence, scope the propagation failure, and open a privacy/security incident. Do not repeatedly copy the residual data into diagnostic tickets.

## Restore sampling

At the organization-approved frequency and before expiring the last known-good generation:

1. restore into a separately named empty database with the backup/restore runbook;
2. compare canonical journal replay digests;
3. verify expected retention deletions and holds;
4. destroy the temporary database and digest files;
5. record backup ID, checksum, result, duration, operator/reviewer, and cleanup evidence.

Replication failover tests do not count as backup restore samples, and successful checksum validation alone does not prove a usable backup.

## Safety rules

- Never use `DROP DATABASE`, unscoped table truncation, or a production database URL as a convenience retention mechanism.
- Never rewrite immutable meeting events while retaining later events that depend on them. If policy requires partial redaction that breaks replay, design and independently review a new cryptographic-erasure/archive boundary first.
- Never retain credentials or ballot linkage “for debugging.” Prohibited collection is an incident.
- Never mark deletion complete while a replica, snapshot, backup, log sink, support export, or operator copy remains outside the documented hold/expiry schedule.
