# Roberts Rules

Roberts Rules is an early-stage platform for chair-led parliamentary meetings. Its first deliverable is a deterministic TypeScript simulator: versioned commands produce an append-only, replayable meeting journal.

The project models original procedural behavior and organization-specific rules. It does not bundle or reproduce prose from *Robert's Rules of Order*.

Public organization identity, rule profiles, meeting manifests, and explicitly approved aggregate outcomes may eventually be published through AT Protocol. Rosters, attendance, credentials, deliberation, participation records, and ballots remain private by default. The current simulator is not production-ready and must not be treated as a binding or secure voting system.

## Quick start

```bash
make verify
```

See the [implementation plan](docs/PLAN.md), [documentation index](docs/README.md), and [architecture decisions](docs/adr/README.md).

## Open Pilot

This repository preserves the Open Pilot issue and pull-request templates for focused, verifiable work.

## License

AGPL-3.0-only. See `LICENSE`.
