import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const ALLOWED_PREFIXES = [
  'ls',
  'cat',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'pm2 logs rooivalk',
  'pm2 status',
  'pm2 show rooivalk',
] as const;

const FILE_COMMANDS = new Set([
  'ls',
  'cat',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
]);

// The command runs through `sh -c`, which re-parses the string after `validate`
// has already parsed it. Every character below is one the shell would rewrite
// or act on, so banning them collapses that gap: what `validate` sees as a
// whitespace-split argument is what `cat` receives. Chaining and substitution
// go with it, and so do quotes (`cat '.env'` would otherwise reach the shell
// as `.env`) and `~` (which expands to `$HOME`, escaping the cwd sandbox).
// The cost is that quoted multi-word arguments are unavailable, e.g.
// `grep -r "foo bar" src/` — acceptable for a log-poking tool.
// ponytail: a denylist leaves glob expansion working; switch to execFile with
// an argv array if the tool ever needs to accept quoted arguments.
const SHELL_METACHARACTERS = /[;&|`$<>(){}\\'"~\n\r]/;

function validate(command: string): string | null {
  if (SHELL_METACHARACTERS.test(command)) {
    return 'Shell metacharacters are not allowed';
  }

  const allowed = ALLOWED_PREFIXES.some(
    (prefix) => command === prefix || command.startsWith(`${prefix} `),
  );

  if (!allowed) {
    return `Command not allowed. Permitted: ${ALLOWED_PREFIXES.join(', ')}`;
  }

  const parts = command.split(/\s+/);
  const cmd = parts[0];

  if (FILE_COMMANDS.has(cmd)) {
    for (const arg of parts.slice(1)) {
      if (arg.startsWith('-')) continue;
      if (arg.startsWith('/')) {
        return 'Absolute paths are not allowed';
      }
      // Rejects `..` traversal and dotfiles (`.env` holds the bot's tokens) in
      // any path segment, while still allowing a bare `.` as in `find . -name`.
      if (arg.split('/').some((seg) => seg.startsWith('.') && seg !== '.')) {
        return 'Directory traversal and dotfiles are not allowed';
      }
    }
  }

  return null;
}

export type BashResult =
  { ok: true; output: string } | { ok: false; error: string };

export async function runBash(rawCommand: string): Promise<BashResult> {
  let command = rawCommand.trim();

  if (command.startsWith('pm2 logs') && !command.includes('--nostream')) {
    command += ' --nostream';
  }

  const validationError = validate(command);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: process.cwd(),
      timeout: 30_000,
    });
    return { ok: true, output: stdout || stderr || '(no output)' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { ok: false, error: message };
  }
}
