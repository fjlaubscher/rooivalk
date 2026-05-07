# BashService Agent Guidelines

## Overview

`BashService` exposes a single `runBash(command)` function that validates and executes a shell command on the server, returning its output. It is the mechanism behind the `run_bash` tool.

## Allowlist

Only the following command prefixes are permitted:

| Prefix                                            | Notes                                  |
| ------------------------------------------------- | -------------------------------------- |
| `ls`, `cat`, `grep`, `find`, `head`, `tail`, `wc` | File exploration — relative paths only |
| `pm2 logs rooivalk`                               | Process log inspection                 |
| `pm2 status`                                      | Process list                           |
| `pm2 show rooivalk`                               | Process detail                         |

Anything outside this list is rejected before execution.

## Sandboxing

- Execution `cwd` is fixed to `process.cwd()` (the deploy root).
- For file commands, arguments containing `..` or starting with `/` are rejected.
- PM2 commands are allowed to reach outside the project directory — that is intentional and limited to the named process.

## pm2 logs behaviour

`--nostream` is always appended to `pm2 logs rooivalk` commands if not already present, preventing the process from hanging while waiting for new log lines.

## Return type

```ts
type BashResult = { ok: true; output: string } | { ok: false; error: string };
```

Execution errors (timeout, non-zero exit) are returned as `ok: false` rather than thrown.

## Timeout

Hard 30-second timeout enforced via `child_process.exec`. Long-running commands (e.g. a stuck `pnpm` invocation) are killed and return an error.

## Common Tasks

| Task                   | Notes                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Add an allowed command | Add the prefix to `ALLOWED_PREFIXES` in `index.ts`. If it's a file command that should be sandboxed, also add it to `FILE_COMMANDS`. |
| Change the timeout     | Update the `timeout` option passed to `execAsync`.                                                                                   |
