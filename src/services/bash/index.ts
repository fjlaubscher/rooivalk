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

// The command runs through `sh -c`, so the allowlist below only means anything
// if the shell can't be talked into running a second command. Anything that
// chains, substitutes, or redirects is refused outright.
// ponytail: a metacharacter denylist keeps `exec` and its glob expansion
// working; switch to execFile with an argv array if this needs to get stricter.
const SHELL_METACHARACTERS = /[;&|`$<>(){}\\\n\r]/;

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
