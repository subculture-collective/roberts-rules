# Contributing

Keep changes small, reviewable, and aligned with the current milestone in `docs/PLAN.md`.

## Development flow

1. Create or pick an issue before making non-trivial changes.
2. Create a branch from `main`.
3. Make the smallest change that satisfies the issue.
4. Run verification:

   ```bash
   make verify
   ```

5. Open a pull request using the PR template.
6. Link the issue with `Closes #N` when appropriate.

## Commit style

Prefer concise conventional-style subjects:

```text
feat: add meeting lifecycle commands
docs: update Open Pilot guidance
fix: preserve quorum transition events
chore: update workspace metadata
```

## Open Pilot issues

Use `.gitea/ISSUE_TEMPLATE/open-pilot-task.yaml` for tasks that Open Pilot should implement.

Open Pilot requires:

- `ready-for-agent`
- `agent:queued`
- a deterministic `Test Command`

The template adds `ready-for-agent`; add `agent:queued` only after the issue is complete and ready for automation.

Good Open Pilot tasks are:

- one focused outcome
- clear context and constraints
- explicit out-of-scope notes
- verifiable from the repository root

## Verification commands

Use the narrowest deterministic command that proves the change.

Default full check:

```bash
make verify
```

Use narrower workspace commands only when they fully prove the focused change; run `make verify` before pull-request handoff.

## Project boundaries

The meeting journal is the procedural source of truth. Keep browser state, clocks, and network delivery outside the authoritative domain model. Public AT Protocol records must never contain private rosters, attendance, credentials, deliberation, participation records, or ballots.

Contributions must model original procedural behavior and must not copy or bundle prose from *Robert's Rules of Order*. Treat simulator votes as non-secret and non-production until later assurance milestones are complete.
