# Meeting Domain Simulator

Replay a deterministic JSON-lines transcript from the repository root:

```bash
pnpm --silent --filter @subculture/roberts-rules-meeting-domain replay <fixture>
```

The replay command is a private-workspace source-level `tsx` script, not an installed distribution binary. Run it from this repository and replace `<fixture>` with a repository-relative or absolute transcript path. The `--silent` option is required when piping the machine-readable output: ordinary non-silent `pnpm` execution may print lifecycle banners.

Line 1 must be a `roberts-rules-transcript-v1` header containing the complete rules profile. Every later nonblank line contains one `CommandEnvelope`. The profile is explicit input; commands contain their own expected aggregate version, actor, role, timestamp, and discriminated command payload.

Successful replay writes one canonical JSON object containing `state`, `events`, and `decisions`, followed by a newline. Invalid JSON or structural input writes a line-numbered error to standard error, writes nothing to standard output, and exits nonzero. A structurally valid command rejected by the meeting aggregate remains a normal replay decision.

The counted voting fixtures are non-secret simulator examples. They are not binding, secure, or production-ready voting systems.
