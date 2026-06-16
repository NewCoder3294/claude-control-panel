# Security Policy

The Control Panel runs entirely on your machine and binds to `127.0.0.1` only —
it is not meant to be exposed to a network.

## Reporting a vulnerability

Please report security issues privately — open a GitHub security advisory on this
repository or contact the maintainer directly — rather than filing a public issue.

## Scope notes

- The backend reads and writes files under `~/.claude` (and, optionally, `~/.clean`).
- Destructive actions are reversible: edits are backed up to
  `~/.claude/.control-panel-backups/` and skill/MCP removals are archived, not deleted.
